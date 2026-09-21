import test from "node:test";
import assert from "node:assert/strict";
import { client } from "./client.js";
import { REPORT_REASONS, report } from "./reportApi.js";
import { blockUser, fetchMyBlocks, unblockUser } from "./blockApi.js";

test("신고는 대상과 사유를 보내고, 공백만 적은 설명은 보내지 않는다", async (t) => {
  let call;
  t.mock.method(client, "request", async (path, options) => { call = { path, options }; return { id: 1 }; });
  await report({ targetType: "PRODUCT", targetId: 12, reason: "OTHER", detail: "   " });
  assert.equal(call.path, "/reports");
  assert.deepEqual(call.options, {
    method: "POST", body: { targetType: "PRODUCT", targetId: 12, reason: "OTHER", detail: null },
  });
});

test("신고 설명은 앞뒤 공백을 걷어 보낸다", async (t) => {
  let body;
  t.mock.method(client, "request", async (_, options) => { body = options.body; });
  await report({ targetType: "USER", targetId: 3, reason: "FRAUD", detail: "  선입금을 요구해요 " });
  assert.equal(body.detail, "선입금을 요구해요");
});

test("신고 사유는 서버가 아는 코드만 쓰고 기타가 맨 끝이다", () => {
  const codes = REPORT_REASONS.map((reason) => reason.value);
  assert.deepEqual([...codes].sort(), ["ABUSE", "FRAUD", "OTHER", "PROHIBITED", "SPAM"]);
  assert.equal(codes.at(-1), "OTHER");
});

test("차단·해제는 사용자 경로에 POST·DELETE 를 보낸다", async (t) => {
  const calls = [];
  t.mock.method(client, "request", async (path, options) => { calls.push([path, options.method]); });
  await blockUser(8);
  await unblockUser(8);
  assert.deepEqual(calls, [["/users/8/block", "POST"], ["/users/8/block", "DELETE"]]);
});

test("차단 목록은 커서를 붙이고 취소 신호를 넘긴다", async (t) => {
  const abort = new AbortController();
  t.mock.method(client, "request", async (path, options) => {
    const url = new URL(path, "http://test");
    assert.equal(url.pathname, "/users/me/blocks");
    assert.equal(url.searchParams.get("cursor"), "2026-09-20T14:02:11_4");
    assert.equal(options.signal, abort.signal);
  });
  await fetchMyBlocks({ cursor: "2026-09-20T14:02:11_4", signal: abort.signal });
});
