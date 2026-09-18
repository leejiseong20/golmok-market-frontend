import test from "node:test";
import assert from "node:assert/strict";
import { createToasts } from "./toast.js";

/** 실제로 기다리지 않도록 타이머를 직접 돌린다. */
function fakeTimer() {
  const scheduled = new Map();
  let nextHandle = 1;
  return {
    setTimeout: (fn) => { const handle = nextHandle++; scheduled.set(handle, fn); return handle; },
    clearTimeout: (handle) => scheduled.delete(handle),
    runAll() { [...scheduled.values()].forEach((fn) => fn()); scheduled.clear(); },
    get pending() { return scheduled.size; },
  };
}

test("알림을 띄우면 목록에 쌓이고 구독자에게 알린다", () => {
  const timer = fakeTimer();
  const toasts = createToasts({ timer });
  let calls = 0;
  toasts.subscribe(() => { calls++; });

  toasts.success("저장했어요.");
  toasts.error("실패했어요.");

  assert.equal(calls, 2);
  assert.deepEqual(toasts.list().map((item) => [item.message, item.tone]),
    [["저장했어요.", "success"], ["실패했어요.", "error"]]);
});

test("시간이 지나면 스스로 사라진다", () => {
  const timer = fakeTimer();
  const toasts = createToasts({ timer });
  toasts.show("잠깐 보이는 알림");
  assert.equal(toasts.list().length, 1);

  timer.runAll();
  assert.equal(toasts.list().length, 0);
});

test("직접 닫으면 예약된 타이머도 정리한다", () => {
  const timer = fakeTimer();
  const toasts = createToasts({ timer });
  const id = toasts.show("닫을 알림");

  toasts.dismiss(id);
  assert.equal(toasts.list().length, 0);
  assert.equal(timer.pending, 0);
});

test("이미 닫힌 알림을 또 닫아도 구독자를 깨우지 않는다", () => {
  const toasts = createToasts({ timer: fakeTimer() });
  const id = toasts.show("한 번만");
  let calls = 0;
  toasts.subscribe(() => { calls++; });

  toasts.dismiss(id);
  toasts.dismiss(id);
  assert.equal(calls, 1);
});

test("빈 문구는 띄우지 않는다", () => {
  const toasts = createToasts({ timer: fakeTimer() });
  assert.equal(toasts.show(""), null);
  assert.equal(toasts.list().length, 0);
});

test("목록은 바뀔 때만 새 배열이 된다(같은 값이면 다시 그리지 않는다)", () => {
  const toasts = createToasts({ timer: fakeTimer() });
  const before = toasts.list();
  assert.equal(toasts.list(), before);

  toasts.show("새 알림");
  assert.notEqual(toasts.list(), before);
});
