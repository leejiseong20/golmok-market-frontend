import { test } from "node:test";
import assert from "node:assert/strict";
import { isChunkLoadError } from "./crash.js";

test("브라우저별 나눠진 파일 받기 실패 문구를 알아본다", () => {
  assert.equal(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/AdminApp-1.js")), true);
  assert.equal(isChunkLoadError(new TypeError("error loading dynamically imported module: https://x/a.js")), true);
  assert.equal(isChunkLoadError(new TypeError("Importing a module script failed.")), true);
  assert.equal(isChunkLoadError(new Error("Unable to preload CSS for /assets/AdminApp-1.css")), true);
  const named = new Error("chunk 3 failed");
  named.name = "ChunkLoadError";
  assert.equal(isChunkLoadError(named), true);
});

test("그 밖의 오류는 다시 시도할 수 있는 오류로 본다", () => {
  assert.equal(isChunkLoadError(new TypeError("Cannot read properties of null (reading 'id')")), false);
  assert.equal(isChunkLoadError(new Error("Failed to fetch")), false);
  assert.equal(isChunkLoadError(null), false);
  assert.equal(isChunkLoadError(undefined), false);
});

test("Error 가 아닌 값을 던져도 문구로 가른다", () => {
  assert.equal(isChunkLoadError("Importing a module script failed."), true);
  assert.equal(isChunkLoadError("그냥 문자열"), false);
});
