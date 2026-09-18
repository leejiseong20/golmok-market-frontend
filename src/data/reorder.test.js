import test from "node:test";
import assert from "node:assert/strict";
import { reorder } from "./reorder.js";

const list = ["a", "b", "c", "d"];

test("뒤 항목을 앞으로 끌면 사이 항목들이 한 칸씩 밀린다", () => {
  assert.deepEqual(reorder(list, 2, 0), ["c", "a", "b", "d"]);
});

test("앞 항목을 뒤로 끌어도 순서가 유지된다", () => {
  assert.deepEqual(reorder(list, 0, 2), ["b", "c", "a", "d"]);
});

test("맨 앞으로 옮긴 사진이 대표가 된다", () => {
  assert.equal(reorder(list, 3, 0)[0], "d");
});

test("제자리나 범위 밖이면 원래 배열을 그대로 돌려준다", () => {
  assert.equal(reorder(list, 1, 1), list);
  assert.equal(reorder(list, 0, -1), list);
  assert.equal(reorder(list, 0, 4), list);
});

test("원래 배열을 바꾸지 않는다", () => {
  reorder(list, 0, 3);
  assert.deepEqual(list, ["a", "b", "c", "d"]);
});
