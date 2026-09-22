import test from "node:test";
import assert from "node:assert/strict";
import { base64UrlToBytes, currentSubscription, detectPushSupport, disablePush, enablePush, reconcilePush, syncPushAccount } from "./push.js";

const SERVER_KEY = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";

function fakeBrowser({ permission = "granted", existing = null, hasWorker = true } = {}) {
  const calls = [];
  let current = existing;
  const pushManager = {
    getSubscription: async () => current,
    subscribe: async (options) => {
      calls.push(["subscribe", options]);
      current = fakeSubscription("https://fcm.googleapis.com/fcm/send/new", options.applicationServerKey.buffer, calls);
      return current;
    },
  };
  return {
    calls,
    container: { getRegistration: async () => (hasWorker ? { pushManager } : undefined) },
    notification: { requestPermission: async () => { calls.push(["permission"]); return permission; } },
    api: {
      fetchPublicKey: async () => ({ enabled: true, publicKey: SERVER_KEY }),
      save: async (json) => { calls.push(["save", json]); },
      remove: async (endpoint) => { calls.push(["remove", endpoint]); },
    },
  };
}

function fakeSubscription(endpoint, keyBuffer, calls) {
  return {
    endpoint,
    options: { applicationServerKey: keyBuffer },
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: "p", auth: "a" } }),
    unsubscribe: async () => { calls.push(["unsubscribe", endpoint]); return true; },
  };
}

// ---------- 지원 판별 ----------

test("아이폰 Safari 에서 홈 화면 앱이 아니면 설치 안내가 필요하다", () => {
  const env = { navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", serviceWorker: {} },
    matchMedia: () => ({ matches: false }), PushManager: {}, Notification: {} };
  assert.equal(detectPushSupport(env), "needs-install");
});

test("아이폰 홈 화면 앱이면 받을 수 있다", () => {
  const env = { navigator: { userAgent: "iPhone", standalone: true, serviceWorker: {} },
    matchMedia: () => ({ matches: true }), PushManager: {}, Notification: {} };
  assert.equal(detectPushSupport(env), "supported");
});

test("iPadOS 는 MacIntel 로 보여도 아이패드로 본다", () => {
  const env = { navigator: { userAgent: "Macintosh", platform: "MacIntel", maxTouchPoints: 5, serviceWorker: {} },
    matchMedia: () => ({ matches: false }), PushManager: {}, Notification: {} };
  assert.equal(detectPushSupport(env), "needs-install");
});

test("웹 푸시가 없는 브라우저는 지원하지 않는다", () => {
  assert.equal(detectPushSupport({ navigator: { userAgent: "Android", serviceWorker: {} }, matchMedia: () => ({ matches: false }) }), "unsupported");
});

test("서버 공개키를 65바이트로 바꾼다(패딩 없는 base64url)", () => {
  const bytes = base64UrlToBytes(SERVER_KEY);
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 0x04);
});

// ---------- 켜기 ----------

test("켜면 권한을 받고 서버 키로 구독해 서버에 저장한다", async () => {
  const browser = fakeBrowser();
  assert.deepEqual(await enablePush(browser), { ok: true });

  assert.deepEqual(browser.calls[0], ["permission"]);
  const [, options] = browser.calls.find(([name]) => name === "subscribe");
  assert.equal(options.userVisibleOnly, true);
  assert.deepEqual([...options.applicationServerKey], [...base64UrlToBytes(SERVER_KEY)]);
  const [, saved] = browser.calls.find(([name]) => name === "save");
  assert.equal(saved.endpoint, "https://fcm.googleapis.com/fcm/send/new");
});

test("권한을 거부하면 구독하지 않는다", async () => {
  const denied = fakeBrowser({ permission: "denied" });
  assert.deepEqual(await enablePush(denied), { ok: false, reason: "denied" });
  const dismissed = fakeBrowser({ permission: "default" });
  assert.deepEqual(await enablePush(dismissed), { ok: false, reason: "dismissed" });
  assert.ok(!denied.calls.some(([name]) => name === "subscribe"));
});

test("서비스 워커가 없으면(개발 서버) 구독하지 않는다", async () => {
  assert.deepEqual(await enablePush(fakeBrowser({ hasWorker: false })), { ok: false, reason: "no-worker" });
});

test("같은 서버 키로 이미 구독했으면 새로 만들지 않고 서버에만 다시 알린다", async () => {
  const browser = fakeBrowser();
  await enablePush(browser);       // 처음 켜기
  browser.calls.length = 0;
  await enablePush(browser);       // 다시 켜기(다른 계정으로 로그인한 뒤 등)
  assert.deepEqual(browser.calls.map(([name]) => name), ["permission", "save"]);
});

test("서버 키가 바뀌었으면 옛 구독을 지우고 새로 구독한다", async () => {
  const browser = fakeBrowser();
  const stale = fakeSubscription("https://fcm.googleapis.com/fcm/send/old", new Uint8Array(65).buffer, browser.calls);
  browser.container = { getRegistration: async () => ({ pushManager: {
    getSubscription: async () => stale,
    subscribe: async (options) => { browser.calls.push(["subscribe"]); return fakeSubscription("https://fcm.googleapis.com/fcm/send/new", options.applicationServerKey.buffer, browser.calls); },
  } }) };
  await enablePush(browser);
  const names = browser.calls.map(([name]) => name);
  assert.ok(names.indexOf("unsubscribe") < names.indexOf("subscribe"));
});

// ---------- 끄기 ----------

test("끄면 브라우저 구독을 먼저 지우고 서버 구독을 지운다", async () => {
  const browser = fakeBrowser();
  await enablePush(browser);
  browser.calls.length = 0;
  await disablePush(browser);
  assert.deepEqual(browser.calls.map(([name]) => name), ["unsubscribe", "remove"]);
});

test("서버에서 지우지 못해도 이 기기의 브라우저 구독은 지운다", async () => {
  const browser = fakeBrowser();
  await enablePush(browser);
  browser.calls.length = 0;
  browser.api.remove = async () => { throw new Error("오프라인"); };
  await disablePush(browser);
  assert.deepEqual(browser.calls.map(([name]) => name), ["unsubscribe"]);
});

test("서버 삭제가 지연돼도 브라우저 해제는 먼저 끝난다", async () => {
  const browser = fakeBrowser();
  await enablePush(browser);
  browser.calls.length = 0;
  let finish;
  browser.api.remove = () => new Promise((resolve) => { finish = resolve; });
  const task = disablePush(browser);
  await new Promise(setImmediate);
  assert.equal(browser.calls[0][0], "unsubscribe");
  finish();
  await task;
});

test("서버 등록 실패는 브라우저 구독도 해제한다", async () => {
  const browser = fakeBrowser();
  browser.api.save = async () => { throw new Error("저장 실패"); };
  await assert.rejects(enablePush(browser));
  assert.ok(browser.calls.some(([name]) => name === "unsubscribe"));
});

test("세션이 사라지면 브라우저 구독을 해제한다", async () => {
  const browser = fakeBrowser();
  await enablePush(browser);
  browser.calls.length = 0;
  await syncPushAccount(null, browser.container);
  assert.ok(browser.calls.some(([name]) => name === "unsubscribe"));
});

test("계정 변경 중 늦게 끝난 구독 저장은 폐기한다", async () => {
  const browser = fakeBrowser();
  await syncPushAccount(1, browser.container);
  let finish;
  browser.api.save = () => new Promise((resolve) => { finish = resolve; });
  const saving = enablePush(browser);
  await new Promise(setImmediate);
  const changed = syncPushAccount(2, browser.container);
  finish();
  await assert.rejects(saving, /로그인 상태/);
  await changed;
  assert.ok(browser.calls.some(([name]) => name === "unsubscribe"));
});

test("켜짐 표시는 서버 재등록이 성공해야 확정된다", async () => {
  const browser = fakeBrowser();
  await enablePush(browser);
  browser.calls.length = 0;
  assert.deepEqual(await reconcilePush(browser), { enabled: true, subscribed: true });
  assert.equal(browser.calls[0][0], "save");
});

test("같은 계정은 구독을 유지하고 다른 계정은 해제한다", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  } });
  try {
    const browser = fakeBrowser();
    await syncPushAccount(10, browser.container);
    await enablePush(browser);
    browser.calls.length = 0;
    await syncPushAccount(10, browser.container);
    assert.equal(browser.calls.length, 0);
    await syncPushAccount(11, browser.container);
    assert.deepEqual(browser.calls.map(([name]) => name), ["unsubscribe"]);
    assert.equal(values.has("golmok.push.owner"), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});

test("설정 확인 중 서버 재등록 실패도 구독을 해제하고 오류로 알린다", async () => {
  const browser = fakeBrowser();
  await enablePush(browser);
  browser.calls.length = 0;
  browser.api.save = async () => { throw new Error("등록 실패"); };
  await assert.rejects(reconcilePush(browser), /등록 실패/);
  assert.deepEqual(browser.calls.map(([name]) => name), ["unsubscribe"]);
});

test("pushManager 가 없는 브라우저(iOS 탭)에서도 로그아웃·계정 전환이 실패하지 않는다", async () => {
  // iOS Safari·Chrome 탭: 서비스 워커 등록은 있지만 pushManager 가 없다.
  const container = { getRegistration: async () => ({}) };
  assert.equal(await currentSubscription(container), null);
  await disablePush({ container, api: { remove: async () => { throw new Error("부르면 안 된다"); } } });
  await syncPushAccount(null, container);
  await syncPushAccount(7, container);
});

test("구독이 없거나 워커가 없으면 조용히 넘어간다", async () => {
  await disablePush(fakeBrowser());
  assert.equal(await currentSubscription({ getRegistration: async () => undefined }), null);
  assert.equal(await currentSubscription(undefined), null);
});
