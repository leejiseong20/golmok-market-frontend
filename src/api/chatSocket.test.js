import test from "node:test";
import assert from "node:assert/strict";
import { createChatSocket } from "./chatSocket.js";

/** @stomp/stompjs Client 대역. 옵션을 붙잡아 두고 콜백을 테스트에서 직접 부른다. */
function fakeStomp() {
  const created = [];
  const createClient = (options) => {
    const instance = {
      ...options,
      activated: false,
      deactivated: false,
      subscriptions: [],
      activate() { this.activated = true; },
      async deactivate() { this.deactivated = true; },
      subscribe(destination, callback) { this.subscriptions.push({ destination, callback }); },
    };
    created.push(instance);
    return instance;
  };
  return { created, createClient };
}

function fakeApi(session = { accessToken: "access" }) {
  const calls = { refresh: 0, clear: 0 };
  return {
    calls,
    getSession: () => session,
    refreshTokens: async () => { calls.refresh++; },
    clearSession: () => { calls.clear++; },
  };
}

test("연결할 때마다 현재 access token 을 CONNECT 헤더에 싣는다", async () => {
  let session = { accessToken: "first" };
  const api = { ...fakeApi(), getSession: () => session };
  const stomp = fakeStomp();
  const socket = createChatSocket({ api, createClient: stomp.createClient, url: () => "ws://test/api/ws" });

  socket.start();
  const instance = stomp.created[0];
  await instance.beforeConnect(instance);
  assert.deepEqual(instance.connectHeaders, { Authorization: "Bearer first" });

  // 재발급 뒤 자동 재연결은 새 토큰을 써야 한다.
  session = { accessToken: "second" };
  await instance.beforeConnect(instance);
  assert.deepEqual(instance.connectHeaders, { Authorization: "Bearer second" });
});

test("세션이 없으면 연결하지 않는다", async () => {
  const stomp = fakeStomp();
  const socket = createChatSocket({ api: fakeApi(null), createClient: stomp.createClient, url: () => "ws://test" });
  socket.start();
  await stomp.created[0].beforeConnect(stomp.created[0]);
  assert.equal(stomp.created[0].deactivated, true);
});

test("EXPIRED_TOKEN 으로 거부되면 재발급하고, INVALID_TOKEN·UNAUTHORIZED 면 세션을 지운다", async () => {
  const api = fakeApi();
  const stomp = fakeStomp();
  const socket = createChatSocket({ api, createClient: stomp.createClient, url: () => "ws://test" });
  socket.start();
  const instance = stomp.created[0];

  await instance.onStompError({ headers: { message: "EXPIRED_TOKEN" } });
  assert.deepEqual(api.calls, { refresh: 1, clear: 0 });

  await instance.onStompError({ headers: { message: "INVALID_TOKEN" } });
  await instance.onStompError({ headers: { message: "UNAUTHORIZED" } });
  assert.deepEqual(api.calls, { refresh: 1, clear: 2 });

  // 권한 문제(FORBIDDEN)는 토큰 문제가 아니므로 세션을 건드리지 않는다.
  await instance.onStompError({ headers: { message: "FORBIDDEN" } });
  assert.deepEqual(api.calls, { refresh: 1, clear: 2 });
});

test("재발급이 실패해도 예외가 새지 않는다(다음 재연결에서 다시 시도한다)", async () => {
  const api = { ...fakeApi(), refreshTokens: async () => { throw new Error("network"); } };
  const stomp = fakeStomp();
  const socket = createChatSocket({ api, createClient: stomp.createClient, url: () => "ws://test" });
  socket.start();
  await stomp.created[0].onStompError({ headers: { message: "EXPIRED_TOKEN" } });
});

test("연결되면 개인 큐를 구독하고 이벤트와 연결 알림을 전달한다", () => {
  const stomp = fakeStomp();
  const socket = createChatSocket({ api: fakeApi(), createClient: stomp.createClient, url: () => "ws://test" });
  const events = [];
  let connected = 0;
  socket.onEvent((event) => events.push(event));
  socket.onConnected(() => connected++);

  socket.start();
  const instance = stomp.created[0];
  instance.onConnect();
  assert.equal(connected, 1);
  assert.equal(instance.subscriptions[0].destination, "/user/queue/chat");

  instance.subscriptions[0].callback({ body: JSON.stringify({ type: "READ", roomId: 7, readerId: 1 }) });
  instance.subscriptions[0].callback({ body: "깨진 JSON" }); // 무시한다
  assert.deepEqual(events, [{ type: "READ", roomId: 7, readerId: 1 }]);
});

test("start 를 여러 번 불러도 연결은 하나고, stop 후에는 새로 만든다", () => {
  const stomp = fakeStomp();
  const socket = createChatSocket({ api: fakeApi(), createClient: stomp.createClient, url: () => "ws://test" });
  socket.start();
  socket.start();
  assert.equal(stomp.created.length, 1);

  socket.stop();
  assert.equal(stomp.created[0].deactivated, true);
  socket.start();
  assert.equal(stomp.created.length, 2);
});
