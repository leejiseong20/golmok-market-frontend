import test from "node:test";
import assert from "node:assert/strict";
import { thumbnailUrl } from "./imageUrl.js";

test("서버에 올린 사진은 축소본 주소로 바꾼다", () => {
  assert.equal(thumbnailUrl("/api/images/2026/09/18/abc.jpg"), "/api/images/thumb/2026/09/18/abc.jpg");
});

test("외부 사진과 빈 값은 그대로 둔다", () => {
  assert.equal(thumbnailUrl("https://picsum.photos/id/1/600/600"), "https://picsum.photos/id/1/600/600");
  assert.equal(thumbnailUrl(null), null);
  assert.equal(thumbnailUrl(undefined), undefined);
});

test("이미 축소본 주소면 두 번 바꾸지 않는다", () => {
  const once = thumbnailUrl("/api/images/2026/09/18/abc.jpg");
  assert.equal(thumbnailUrl(once), once);
});
