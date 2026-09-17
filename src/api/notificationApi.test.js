import test from "node:test";
import assert from "node:assert/strict";
import { client } from "./client.js";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "./notificationApi.js";

test("알림 목록은 커서와 취소 신호를 전달한다", async (t) => {
  const abort = new AbortController();
  t.mock.method(client, "request", async (path, options) => {
    const url = new URL(path, "http://test");
    assert.equal(url.pathname, "/notifications");
    assert.equal(url.searchParams.get("cursor"), "2026-09-17T12:00:00_3");
    assert.equal(options.signal, abort.signal);
  });
  await fetchNotifications({ cursor: "2026-09-17T12:00:00_3", signal: abort.signal });
});

test("읽음 처리는 PATCH 로 보낸다", async (t) => {
  const calls = [];
  t.mock.method(client, "request", async (path, options) => { calls.push([path, options.method]); return null; });
  await markNotificationRead(5);
  await markAllNotificationsRead();
  assert.deepEqual(calls, [["/notifications/5/read", "PATCH"], ["/notifications/read-all", "PATCH"]]);
});
