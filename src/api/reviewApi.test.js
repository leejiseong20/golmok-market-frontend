import test from "node:test";
import assert from "node:assert/strict";
import { client, ApiError } from "./client.js";
import { createReview, fetchReviews } from "./reviewApi.js";

test("후기 등록은 거래를 지정하고 평가 대상 ID는 보내지 않는다", async (t) => {
  let call;
  t.mock.method(client, "request", async (path, options) => { call = { path, options }; return { id: 1 }; });
  await createReview(42, { score: 5, content: "친절해요", revieweeId: 999 });
  assert.equal(call.path, "/trades/42/reviews");
  assert.deepEqual(call.options, { method: "POST", body: { score: 5, content: "친절해요" } });
});

test("받은 후기 조회는 커서를 인코딩하고 취소 신호를 전달한다", async (t) => {
  const abort = new AbortController();
  const cursor = "2026-09-17T12:30:00_12";
  t.mock.method(client, "request", async (path, options) => {
    const url = new URL(path, "http://test");
    assert.equal(url.pathname, "/users/3/reviews");
    assert.equal(url.searchParams.get("cursor"), cursor);
    assert.equal(url.searchParams.get("size"), "20");
    assert.equal(options.signal, abort.signal);
  });
  await fetchReviews(3, { cursor, signal: abort.signal });
});

test("중복 작성 오류를 숨기지 않아 화면이 작성 완료 상태로 전환할 수 있다", async (t) => {
  t.mock.method(client, "request", async () => { throw new ApiError("이미 작성", { status: 409, code: "ALREADY_REVIEWED" }); });
  await assert.rejects(createReview(42, { score: 5 }), { code: "ALREADY_REVIEWED", status: 409 });
});
