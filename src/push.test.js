import test from "node:test";
import assert from "node:assert/strict";
import { base64UrlToBytes, currentSubscription, detectPushSupport, disablePush, enablePush } from "./push.js";

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

test("끄면 서버 구독을 먼저 지우고 브라우저 구독을 지운다", async () => {
  const browser = fakeBrowser();
  await enablePush(browser);
  browser.calls.length = 0;
  await disablePush(browser);
  assert.deepEqual(browser.calls.map(([name]) => name), ["remove", "unsubscribe"]);
});

test("서버에서 지우지 못해도 이 기기의 브라우저 구독은 지운다", async () => {
  const browser = fakeBrowser();
  await enablePush(browser);
  browser.calls.length = 0;
  browser.api.remove = async () => { throw new Error("오프라인"); };
  await assert.rejects(disablePush(browser));
  assert.deepEqual(browser.calls.map(([name]) => name), ["unsubscribe"]);
});

test("구독이 없거나 워커가 없으면 조용히 넘어간다", async () => {
  await disablePush(fakeBrowser());
  assert.equal(await currentSubscription({ getRegistration: async () => undefined }), null);
  assert.equal(await currentSubscription(undefined), null);
});
