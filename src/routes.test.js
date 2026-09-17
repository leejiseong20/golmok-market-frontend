import test from "node:test";
import assert from "node:assert/strict";
import { homeSearch, isAppPath, parseHomeQuery, parseId, paths } from "./routes.js";

test("화면 주소를 만든다", () => {
  assert.equal(paths.product(12), "/products/12");
  assert.equal(paths.user(3), "/users/3");
  assert.equal(paths.chatRoom(7), "/chat-rooms/7");
  assert.equal(paths.my(), "/my");
  assert.equal(paths.my("favorites"), "/my");
  assert.equal(paths.my("reviews"), "/my/reviews");
});

test("경로 id 는 양의 정수만 받는다", () => {
  assert.equal(parseId("12"), 12);
  for (const bad of [undefined, null, "", "0", "-1", "012", "12abc", "1.5", "99999999999999999999"]) {
    assert.equal(parseId(bad), null, String(bad));
  }
});

test("홈 쿼리를 읽고 모르는 값은 기본값으로 되돌린다", () => {
  assert.deepEqual(parseHomeQuery("?q=%20식탁%20&category=3&sort=PRICE_ASC"), { keyword: "식탁", categoryId: 3, sort: "PRICE_ASC" });
  assert.deepEqual(parseHomeQuery(""), { keyword: "", categoryId: null, sort: "LATEST" });
  assert.deepEqual(parseHomeQuery("?category=abc&sort=DROP_TABLE"), { keyword: "", categoryId: null, sort: "LATEST" });
  assert.equal(parseHomeQuery(`?q=${"가".repeat(60)}`).keyword.length, 50);
});

test("홈 쿼리는 기본값을 빼고 만들어 같은 조건이 같은 주소가 된다", () => {
  assert.equal(homeSearch({}), "");
  assert.equal(homeSearch({ keyword: "  ", categoryId: null, sort: "LATEST" }), "");
  const search = homeSearch({ keyword: "원목 식탁", categoryId: 3, sort: "PRICE_ASC" });
  assert.deepEqual(parseHomeQuery(search), { keyword: "원목 식탁", categoryId: 3, sort: "PRICE_ASC" });
});

test("알림 경로는 앱 화면 허용 목록만 통과한다", () => {
  for (const ok of ["/products/12", "/users/3", "/chat-rooms/7", "/chat", "/my", "/my/reviews", "/my/purchases"]) {
    assert.equal(isAppPath(ok), true, ok);
  }
  for (const bad of [null, "", "https://evil.example/products/1", "//evil.example", "/products/", "/products/0",
    "/products/12/edit", "/my/admin", "javascript:alert(1)", "/chat-rooms/abc"]) {
    assert.equal(isAppPath(bad), false, String(bad));
  }
});
