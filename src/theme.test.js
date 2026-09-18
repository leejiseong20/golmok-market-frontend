import test from "node:test";
import assert from "node:assert/strict";
import { createTheme, THEME_KEY } from "./theme.js";

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
    map,
  };
}
function fakeMedia(matches = false) {
  const handlers = new Set();
  return {
    matches,
    addEventListener: (_, fn) => handlers.add(fn),
    removeEventListener: (_, fn) => handlers.delete(fn),
    fire() { handlers.forEach((fn) => fn()); },
  };
}
const fakeRoot = () => ({ dataset: {} });

test("고른 값이 없으면 시스템 설정을 따르고 data-theme 을 붙이지 않는다", () => {
  const root = fakeRoot();
  const theme = createTheme({ storage: fakeStorage(), root, media: fakeMedia(true) });
  assert.equal(theme.effective(), "dark");
  assert.equal(theme.get(), null);
  assert.equal(root.dataset.theme, undefined);
});

test("저장된 선택은 시스템 설정보다 우선한다", () => {
  const root = fakeRoot();
  const theme = createTheme({ storage: fakeStorage({ [THEME_KEY]: "light" }), root, media: fakeMedia(true) });
  assert.equal(theme.effective(), "light");
  assert.equal(root.dataset.theme, "light");
});

test("토글은 보이는 화면의 반대로 바꾸고 저장한다", () => {
  const root = fakeRoot();
  const storage = fakeStorage();
  const theme = createTheme({ storage, root, media: fakeMedia(true) });

  theme.toggle();
  assert.equal(theme.effective(), "light");
  assert.equal(root.dataset.theme, "light");
  assert.equal(storage.getItem(THEME_KEY), "light");

  theme.toggle();
  assert.equal(theme.effective(), "dark");
  assert.equal(storage.getItem(THEME_KEY), "dark");
});

test("선택을 지우면 다시 시스템 설정을 따른다", () => {
  const root = fakeRoot();
  const storage = fakeStorage({ [THEME_KEY]: "light" });
  const theme = createTheme({ storage, root, media: fakeMedia(true) });

  theme.set(null);
  assert.equal(theme.get(), null);
  assert.equal(theme.effective(), "dark");
  assert.equal(root.dataset.theme, undefined);
  assert.equal(storage.getItem(THEME_KEY), null);
});

test("이상한 저장값은 무시한다", () => {
  const theme = createTheme({ storage: fakeStorage({ [THEME_KEY]: "purple" }), root: fakeRoot(), media: fakeMedia(false) });
  assert.equal(theme.get(), null);
  assert.equal(theme.effective(), "light");
});

test("시스템 설정이 바뀌면 고른 값이 없을 때만 알린다", () => {
  const media = fakeMedia(false);
  const theme = createTheme({ storage: fakeStorage(), root: fakeRoot(), media });
  let calls = 0;
  theme.subscribe(() => { calls++; });

  media.fire();
  assert.equal(calls, 1);

  theme.toggle();       // 여기서 사용자가 골랐다(알림 1회)
  assert.equal(calls, 2);
  media.fire();         // 고른 값이 있으므로 시스템 변경은 무시한다
  assert.equal(calls, 2);
});

test("저장소가 막혀 있어도 이번 세션에서는 동작한다", () => {
  const blocked = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  const root = fakeRoot();
  const theme = createTheme({ storage: blocked, root, media: fakeMedia(false) });
  theme.toggle();
  assert.equal(theme.effective(), "dark");
  assert.equal(root.dataset.theme, "dark");
});
