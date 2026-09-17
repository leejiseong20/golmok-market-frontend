import test from "node:test";
import assert from "node:assert/strict";
import { client } from "./client.js";
import { withdrawMe } from "./userApi.js";
import { fetchChatUnreadCount } from "./chatApi.js";

test("회원 탈퇴는 비밀번호를 본문에 담아 DELETE 로 보낸다", async (t) => {
  const calls = [];
  t.mock.method(client, "request", async (path, options) => { calls.push([path, options]); return null; });
  await withdrawMe("Golmok123!");
  assert.deepEqual(calls, [["/users/me", { method: "DELETE", body: { password: "Golmok123!" } }]]);
});

test("채팅 안 읽은 수 합계는 취소 신호를 전달한다", async (t) => {
  const abort = new AbortController();
  t.mock.method(client, "request", async (path, options) => {
    assert.equal(path, "/chat-rooms/unread-count");
    assert.equal(options.signal, abort.signal);
    return { count: 3 };
  });
  assert.deepEqual(await fetchChatUnreadCount(abort.signal), { count: 3 });
});
