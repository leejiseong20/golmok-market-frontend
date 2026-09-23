import test from "node:test";
import assert from "node:assert/strict";
import { buildCrashReport, createCrashReporter, MAX_REPORTS } from "./errorReport.js";

const crash = (message, boundary = "본문") => ({
  boundary, error: new TypeError(message), chunk: false, componentStack: "\n    at AdminUsers", pathname: "/admin/users",
});

test("서버가 받는 모양으로 만들고, 경로만 보낸다", () => {
  const body = buildCrashReport({ ...crash("boom"), pathname: "/search?q=내 검색어#top" });
  assert.deepEqual(body, {
    boundary: "본문", kind: "RENDER", message: "boom", path: "/search", componentStack: "\n    at AdminUsers",
  });
});

test("나눠진 파일 받기 실패는 CHUNK 로 보낸다", () => {
  assert.equal(buildCrashReport({ ...crash("x"), chunk: true }).kind, "CHUNK");
});

test("서버 길이 제한을 넘지 않게 자른다", () => {
  const body = buildCrashReport({
    boundary: "경".repeat(40), error: new Error("m".repeat(500)), componentStack: "s".repeat(3000), pathname: "/" + "p".repeat(300),
  });
  assert.equal(body.boundary.length, 30);
  assert.equal(body.message.length, 300);
  assert.equal(body.componentStack.length, 2000);
  assert.equal(body.path.length, 200);
});

test("메시지가 없거나 Error 가 아닌 값을 던져도 보낼 수 있는 모양이 된다", () => {
  assert.equal(buildCrashReport({ boundary: "창", error: null, pathname: "" }).message, "(메시지 없음)");
  assert.equal(buildCrashReport({ boundary: "창", error: null, pathname: "" }).path, "/");
  assert.equal(buildCrashReport({ boundary: "창", error: "문자열 오류", pathname: "/my" }).message, "문자열 오류");
  assert.equal(buildCrashReport({ boundary: "창", error: new Error("x"), pathname: "/my" }).componentStack, null);
});

test("같은 오류는 한 번만 보낸다", () => {
  const sent = [];
  const report = createCrashReporter({ send: (body) => sent.push(body) });
  assert.equal(report(crash("boom")), true);
  assert.equal(report(crash("boom")), false);
  // 경계가 다르면 다른 오류다.
  assert.equal(report(crash("boom", "창")), true);
  assert.equal(sent.length, 2);
});

test("한 페이지에서 최대 건수까지만 보낸다", () => {
  const sent = [];
  const report = createCrashReporter({ send: (body) => sent.push(body) });
  for (let i = 0; i < MAX_REPORTS + 3; i++) report(crash(`boom ${i}`));
  assert.equal(sent.length, MAX_REPORTS);
});

test("보내기가 실패하거나 던져도 밖으로 던지지 않는다", async () => {
  const rejecting = createCrashReporter({ send: () => Promise.reject(new Error("offline")) });
  assert.equal(rejecting(crash("a")), true);
  const throwing = createCrashReporter({ send: () => { throw new Error("no fetch"); } });
  assert.doesNotThrow(() => throwing(crash("b")));
  // 거절된 약속이 처리되지 않은 채 남지 않았는지 한 틱 기다려 본다.
  await new Promise((resolve) => setTimeout(resolve, 0));
});
