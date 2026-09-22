/**
 * 웹 푸시 켜기·끄기.
 *
 * 흐름: 알림 권한 요청 → 서버의 VAPID 공개키로 브라우저 구독 → 구독 정보를 서버에 저장.
 * 끌 때는 브라우저 구독을 먼저 지운다. 서버 삭제가 실패하면 다음 발송의 404·410 에서 정리된다.
 *
 * pwa.js 와 같이 브라우저 객체를 주입받는다. 그래야 DOM 없이 테스트할 수 있다.
 */

/**
 * 이 기기에서 푸시를 받을 수 있는가.
 *   "supported"     — 받을 수 있다
 *   "needs-install" — 아이폰·아이패드인데 홈 화면 앱이 아니다. iOS 는 홈 화면에 추가한 앱에서만 받는다(iOS 16.4+).
 *                     iOS 의 Chrome 도 여기에 해당한다(Safari 로 추가해야 한다)
 *   "unsupported"   — 이 브라우저는 웹 푸시가 없다
 */
export function detectPushSupport(env = globalThis) {
  const nav = env.navigator;
  // iPadOS 는 데스크톱 Safari 처럼 "MacIntel" 로 보인다. 터치 지점 수로 구분한다.
  const ios = /iPad|iPhone|iPod/.test(nav?.userAgent ?? "") || (nav?.platform === "MacIntel" && nav?.maxTouchPoints > 1);
  const standalone = nav?.standalone === true || env.matchMedia?.("(display-mode: standalone)")?.matches === true;
  if (ios && !standalone) return "needs-install";
  if (!nav?.serviceWorker || !("PushManager" in env) || !("Notification" in env)) return "unsupported";
  return "supported";
}

/** base64url(서버 공개키) → 브라우저 subscribe() 가 받는 바이트 배열. */
export function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = globalThis.atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function sameBytes(buffer, bytes) {
  if (!buffer) return false;
  const view = new Uint8Array(buffer);
  return view.length === bytes.length && view.every((value, i) => value === bytes[i]);
}

/**
 * 지금 이 기기의 브라우저 구독. 서비스 워커가 없으면(개발 서버) null.
 * serviceWorker.ready 를 쓰지 않는다 — 등록된 워커가 없으면 영원히 기다린다.
 */
export async function currentSubscription(container) {
  const registration = await container?.getRegistration?.();
  // iOS 는 홈 화면 앱에서만 pushManager 를 준다. Safari·Chrome 탭에서는 서비스 워커는 있어도 pushManager 가 없다.
  // 구독할 수 없는 곳이라 "구독 없음"이다. 없는 객체를 부르면 TypeError 가 나 로그아웃까지 실패했다(2026-09-22, 아이폰 크롬).
  if (!registration?.pushManager) return null;
  return registration.pushManager.getSubscription();
}

/**
 * 알림 켜기. 반드시 버튼을 누른 그 처리 안에서 바로 불러야 한다 — 사파리는 사용자 동작 없이 권한을 묻지 못한다.
 * 결과: { ok: true } 또는 { ok: false, reason: "denied" | "dismissed" | "no-worker" | "disabled" }
 */
export async function enablePush({ container, notification, api }) {
  const started = accountVersion;
  const permission = await notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: permission === "denied" ? "denied" : "dismissed" };
  return serialize(async () => {
    ensureAccount(started);
    const registration = await container.getRegistration();
    if (!registration) return { ok: false, reason: "no-worker" };
    const { enabled, publicKey } = await api.fetchPublicKey();
    if (!enabled) return { ok: false, reason: "disabled" };

    const serverKey = base64UrlToBytes(publicKey);
    let subscription = await registration.pushManager.getSubscription();
    // 서버 키가 바뀌었으면 옛 구독으로는 받을 수 없다(푸시 서비스가 서명을 거부한다). 지우고 새로 만든다.
    if (subscription && !sameBytes(subscription.options?.applicationServerKey, serverKey)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    // userVisibleOnly: 받은 푸시는 반드시 알림으로 보여 준다는 약속이다. 크롬·사파리는 이것만 허용한다.
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey });
    try {
      ensureAccount(started);
      await api.save(subscription.toJSON());
      ensureAccount(started);
      saveOwner(accountId);
    } catch (error) {
      await subscription.unsubscribe();
      throw error;
    }
    return { ok: true };
  });
}

/** 알림 끄기. 브라우저 해제를 먼저 완료한 뒤 서버에 정리를 요청한다. */
export async function disablePush({ container, api }) {
  return serialize(async () => {
    const subscription = await currentSubscription(container);
    if (!subscription) return;
    // 브라우저 해제를 먼저 완료한다. 서버 장애가 있어도 이 기기로는 더 받지 않는다.
    if (!await subscription.unsubscribe()) throw new Error("이 기기의 알림을 끄지 못했어요. 다시 시도해 주세요.");
    saveOwner(null);
    try { await api.remove(subscription.endpoint); } catch { /* 해제된 endpoint 는 서버의 다음 404·410 응답에서 정리된다. */ }
  });
}

// 계정 변경과 구독 작업을 직렬화한다. 이전 계정의 늦은 저장이 새 계정 구독을 덮지 않게 한다.
const OWNER_KEY = "golmok.push.owner";
let accountId = null;
let accountVersion = 0;
let queue = Promise.resolve();
function serialize(work) {
  const result = queue.then(work);
  queue = result.catch(() => {});
  return result;
}
function ensureAccount(version) {
  if (version !== accountVersion) throw new Error("로그인 상태가 변경됐어요. 알림을 다시 켜 주세요.");
}
function saveOwner(id) {
  try {
    if (id == null) globalThis.localStorage?.removeItem(OWNER_KEY);
    else globalThis.localStorage?.setItem(OWNER_KEY, String(id));
  } catch { /* 저장소를 못 쓰면 다음 실행에서 기존 구독을 안전하게 해제한다. */ }
}

/** 앱 시작·로그인·세션 만료 모두 같은 경로를 탄다. 소유자를 모르는 옛 구독도 해제한다. */
export function syncPushAccount(id, container = globalThis.navigator?.serviceWorker) {
  accountId = id ?? null;
  const version = ++accountVersion;
  return serialize(async () => {
    if (version !== accountVersion) return;
    let owner;
    try { owner = globalThis.localStorage?.getItem(OWNER_KEY); } catch { /* 소유자 불명 */ }
    if (accountId != null && owner === String(accountId)) return;
    const subscription = await currentSubscription(container);
    if (subscription && !await subscription.unsubscribe()) throw new Error("이전 계정의 알림을 해제하지 못했어요.");
    saveOwner(null);
  });
}

/** 브라우저 구독만 보고 켜짐으로 표시하지 않는다. 서버 저장과 공개키까지 다시 맞춘다. */
export function reconcilePush({ container, api }) {
  const version = accountVersion;
  return serialize(async () => {
    ensureAccount(version);
    const key = await api.fetchPublicKey();
    const subscription = await currentSubscription(container);
    if (!subscription) return { enabled: key.enabled, subscribed: false };
    if (!key.enabled || !sameBytes(subscription.options?.applicationServerKey, base64UrlToBytes(key.publicKey))) {
      await subscription.unsubscribe();
      saveOwner(null);
      return { enabled: key.enabled, subscribed: false };
    }
    try {
      ensureAccount(version);
      await api.save(subscription.toJSON());
      ensureAccount(version);
      saveOwner(accountId);
      return { enabled: true, subscribed: true };
    } catch (error) {
      await subscription.unsubscribe();
      throw error;
    }
  });
}
