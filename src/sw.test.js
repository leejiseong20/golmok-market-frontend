import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function worker(caches = {}) {
  const response = { status: 200, type: "basic", clone() { return this; } };
  const context = { self: { location: { origin: "https://app.example" }, addEventListener() {} },
    URL, Response, caches, fetch: async () => response };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), context);
  return { context, response };
}

test("알림은 허용된 내부 경로만 연다", () => {
  const { context } = worker();
  for (const path of ["//evil.example", "/\\evil.example", "https://evil.example", "/api/auth/login", "/products/1?url=evil", "/products/../chat"]) {
    assert.equal(context.safePath(path), "/");
  }
  for (const path of ["/products/1", "/users/2", "/chat-rooms/3", "/my/reviews", "/chat"]) {
    assert.equal(context.safePath(path), path);
  }
});

test("캐시를 열지 못해도 네트워크 응답을 반환한다", async () => {
  const { context, response } = worker({ open: async () => { throw new Error("저장소 없음"); } });
  assert.equal(await context.cacheFirst("/assets/app.js", "test"), response);
});

test("캐시 용량이 부족해도 번들과 화면의 정상 응답을 반환한다", async () => {
  const { context, response } = worker({ open: async () => ({ match: async () => null,
    put: async () => { throw new Error("QuotaExceededError"); } }) });
  assert.equal(await context.cacheFirst("/assets/app.js", "test"), response);
  assert.equal(await context.networkFirstShell("/products/1"), response);
});

test("네트워크와 캐시가 모두 실패하면 오프라인 안내를 반환한다", async () => {
  const { context } = worker({ match: async () => { throw new Error("저장소 없음"); } });
  context.fetch = async () => { throw new Error("오프라인"); };
  assert.equal((await context.networkFirstShell("/")).status, 503);
});
