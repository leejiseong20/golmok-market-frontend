import test from "node:test";
import assert from "node:assert/strict";
import { watchViewport } from "./viewport.js";

function fakeRoot(clientHeight = 800) {
  const style = new Map();
  return {
    dataset: {},
    clientHeight,
    style: { setProperty: (key, value) => style.set(key, value) },
    read: (key) => style.get(key),
  };
}
function fakeViewport(height, offsetTop = 0) {
  const handlers = new Map();
  return {
    height, offsetTop,
    addEventListener: (type, fn) => handlers.set(type, fn),
    removeEventListener: (type) => handlers.delete(type),
    fire(type) { handlers.get(type)?.(); },
    get listeners() { return handlers.size; },
  };
}

test("키보드가 없으면 보이는 높이를 그대로 내려주고 표시를 붙이지 않는다", () => {
  globalThis.innerHeight = 800;
  const root = fakeRoot();
  watchViewport(root, fakeViewport(800));

  assert.equal(root.read("--vvh"), "800px");
  assert.equal(root.read("--kb"), "0px");
  assert.equal(root.dataset.keyboard, undefined);
});

test("키보드가 올라오면 가린 높이와 표시를 남긴다", () => {
  globalThis.innerHeight = 800;
  const root = fakeRoot();
  const viewport = fakeViewport(800);
  watchViewport(root, viewport);

  viewport.height = 450;           // 키보드가 350px 을 덮었다
  viewport.fire("resize");

  assert.equal(root.read("--vvh"), "450px");
  assert.equal(root.read("--kb"), "350px");
  assert.equal(root.dataset.keyboard, "open");
});

test("주소창이 접히는 정도(120px 이하)는 키보드로 보지 않는다", () => {
  globalThis.innerHeight = 800;
  const root = fakeRoot();
  const viewport = fakeViewport(800);
  watchViewport(root, viewport);

  viewport.height = 720;
  viewport.fire("resize");

  assert.equal(root.read("--kb"), "80px");
  assert.equal(root.dataset.keyboard, undefined);
});

test("키보드를 닫으면 표시를 지운다", () => {
  globalThis.innerHeight = 800;
  const root = fakeRoot();
  const viewport = fakeViewport(400);
  watchViewport(root, viewport);
  assert.equal(root.dataset.keyboard, "open");

  viewport.height = 800;
  viewport.fire("resize");
  assert.equal(root.dataset.keyboard, undefined);
});

test("화면이 밀려 올라가도(offsetTop) 키보드 높이는 보이는 높이로만 잰다", () => {
  globalThis.innerHeight = 800;
  const root = fakeRoot();
  // iOS 는 키보드를 띄우며 페이지를 밀어 올린다. offsetTop 을 빼면 키보드를 못 알아챈다.
  watchViewport(root, fakeViewport(450, 200));

  assert.equal(root.read("--kb"), "350px");
  assert.equal(root.dataset.keyboard, "open");
});

test("innerHeight 가 키보드와 함께 줄어드는 브라우저에서도 알아챈다(iOS 크롬 실측)", () => {
  // 실제 아이폰 값: innerHeight 와 보이는 높이가 모두 390 이고, 레이아웃 높이만 684 로 남는다.
  globalThis.innerHeight = 390;
  const root = fakeRoot(684);
  watchViewport(root, fakeViewport(390, 294));

  assert.equal(root.read("--kb"), "294px");
  assert.equal(root.dataset.keyboard, "open");
});

test("정리 함수는 등록한 청취를 모두 거둔다", () => {
  globalThis.innerHeight = 800;
  const viewport = fakeViewport(800);
  const stop = watchViewport(fakeRoot(), viewport);
  assert.equal(viewport.listeners, 2);

  stop();
  assert.equal(viewport.listeners, 0);
});

test("visualViewport 가 없는 브라우저에서는 아무 일도 하지 않는다", () => {
  const root = fakeRoot();
  const stop = watchViewport(root, undefined);
  stop();
  assert.equal(root.read("--vvh"), undefined);
});
