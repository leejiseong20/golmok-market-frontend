import test from "node:test";
import assert from "node:assert/strict";
import { watchInputMode } from "./inputMode.js";

function fakeTarget() {
  const handlers = new Map();
  return {
    addEventListener: (type, fn) => handlers.set(type, fn),
    removeEventListener: (type) => handlers.delete(type),
    fire: (type, event = {}) => handlers.get(type)?.(event),
    get listeners() { return handlers.size; },
  };
}

test("처음에는 pointer 다(아무것도 누르지 않았는데 초점 링이 뜨지 않는다)", () => {
  const root = { dataset: {} };
  watchInputMode(root, fakeTarget());
  assert.equal(root.dataset.input, "pointer");
});

test("Tab 을 누르면 keyboard, 다시 누르거나 터치하면 pointer", () => {
  const root = { dataset: {} };
  const target = fakeTarget();
  watchInputMode(root, target);
  target.fire("keydown", { key: "Tab" });
  assert.equal(root.dataset.input, "keyboard");
  target.fire("pointerdown");
  assert.equal(root.dataset.input, "pointer");
});

test("글자 입력(휴대폰 키보드 포함)은 키보드 모드로 보지 않는다", () => {
  const root = { dataset: {} };
  const target = fakeTarget();
  watchInputMode(root, target);
  for (const key of ["a", "ㅎ", "Enter", "Backspace", " "]) target.fire("keydown", { key });
  assert.equal(root.dataset.input, "pointer");
});

test("해제하면 듣기를 멈춘다", () => {
  const target = fakeTarget();
  const stop = watchInputMode({ dataset: {} }, target);
  assert.equal(target.listeners, 2);
  stop();
  assert.equal(target.listeners, 0);
});
