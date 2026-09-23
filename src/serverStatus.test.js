import test from "node:test";
import assert from "node:assert/strict";
import { classifyResponse, createServerStatus } from "./serverStatus.js";

/** 실제로 기다리지 않도록 타이머를 직접 돌린다. */
function fakeTimer() {
  const scheduled = new Map();
  let next = 1;
  return {
    setTimeout: (fn, ms) => { const handle = next++; scheduled.set(handle, { fn, ms }); return handle; },
    clearTimeout: (handle) => scheduled.delete(handle),
    fire(ms) { [...scheduled].filter(([, job]) => job.ms === ms).forEach(([handle, job]) => { scheduled.delete(handle); job.fn(); }); },
    pending(ms) { return [...scheduled.values()].filter((job) => job.ms === ms).length; },
  };
}

const response = (status, text) => ({ status, text: async () => text });

test("서버가 직접 답하지 못한 신호만 꺼짐으로 본다", () => {
  assert.equal(classifyResponse({ networkError: true }), "down");
  for (const status of [502, 503, 504]) assert.equal(classifyResponse({ status, text: "" }), "down");
  // 앞단이 만든 HTML 오류 화면
  assert.equal(classifyResponse({ status: 500, text: "<html>An error occurred</html>" }), "down");
  // 서버가 JSON 으로 답했으면 4xx·5xx 여도 켜짐이다.
  assert.equal(classifyResponse({ status: 404, text: "{\"code\":\"RESOURCE_NOT_FOUND\"}" }), "up");
  assert.equal(classifyResponse({ status: 500, text: "{\"code\":\"INTERNAL_ERROR\"}" }), "up");
  assert.equal(classifyResponse({ status: 200, text: "[]" }), "up");
  assert.equal(classifyResponse({ status: 204, text: "" }), "up");
});

test("처음 응답이 오면 up, 끊기면 down, 다시 오면 recovered 를 거쳐 up", () => {
  const status = createServerStatus({ probe: async () => response(200, "[]"), timer: fakeTimer() });
  const seen = [];
  status.subscribe(() => seen.push(status.getState()));
  status.report("up");
  status.report("down");
  status.report("down");
  status.report("up");
  status.dismiss();
  assert.deepEqual(seen, ["up", "down", "recovered", "up"]);
});

test("확인 요청이 제한 시간 안에 답하지 않으면 꺼짐이다", async () => {
  const timer = fakeTimer();
  const status = createServerStatus({ timer, timeoutMs: 8000,
    probe: (signal) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) });
  const checking = status.check();
  timer.fire(8000);
  assert.equal(await checking, "down");
  assert.equal(status.getState(), "down");
});

test("꺼져 있는 동안은 주기적으로 다시 확인하고, 켜지면 멈춘다", async () => {
  const timer = fakeTimer();
  let reply = response(502, "");
  let calls = 0;
  const status = createServerStatus({ timer, retryMs: 30000, probe: async () => { calls++; return reply; } });

  await status.check();
  assert.equal(status.getState(), "down");
  assert.equal(timer.pending(30000), 1);

  // 여러 요청이 꺼짐을 알려도 다시 확인 예약은 하나다.
  status.report("down");
  assert.equal(timer.pending(30000), 1);

  reply = response(200, "[]");
  timer.fire(30000);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 2);
  assert.equal(status.getState(), "recovered");
  assert.equal(timer.pending(30000), 0);
});

test("확인 버튼을 연타해도 요청은 하나다", async () => {
  let calls = 0;
  const status = createServerStatus({ timer: fakeTimer(), probe: async () => { calls++; return response(200, "[]"); } });
  await Promise.all([status.check(), status.check(), status.check()]);
  assert.equal(calls, 1);
});
