/**
 * 웹 푸시 켜기·끄기.
 *
 * 흐름: 알림 권한 요청 → 서버의 VAPID 공개키로 브라우저 구독 → 구독 정보를 서버에 저장.
 * 끌 때는 서버 구독을 먼저 지운다. 브라우저 구독만 지우면 서버는 계속 보내다 410 을 받고서야 지운다.
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
  return registration ? registration.pushManager.getSubscription() : null;
}

/**
 * 알림 켜기. 반드시 버튼을 누른 그 처리 안에서 바로 불러야 한다 — 사파리는 사용자 동작 없이 권한을 묻지 못한다.
 * 결과: { ok: true } 또는 { ok: false, reason: "denied" | "dismissed" | "no-worker" | "disabled" }
 */
export async function enablePush({ container, notification, api }) {
  const permission = await notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: permission === "denied" ? "denied" : "dismissed" };

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
  await api.save(subscription.toJSON());
  return { ok: true };
}

/** 알림 끄기. 서버 구독을 먼저 지우고, 실패해도 브라우저 구독은 지운다(이 기기로는 더 받지 않는다). */
export async function disablePush({ container, api }) {
  const subscription = await currentSubscription(container);
  if (!subscription) return;
  try {
    await api.remove(subscription.endpoint);
  } finally {
    await subscription.unsubscribe();
  }
}
