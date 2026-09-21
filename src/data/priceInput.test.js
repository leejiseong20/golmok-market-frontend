import test from "node:test";
import assert from "node:assert/strict";
import { formatDigits, onlyDigits } from "./priceInput.js";

test("쉼표가 찍힌 입력칸 글자에서 숫자만 남긴다(NaN 이 되지 않는다)", () => {
  // 입력칸에는 "1,000" 이 보이고, 그 뒤에 한 글자를 치면 "1,0005" 가 onChange 로 온다.
  assert.equal(onlyDigits("1,0005"), "10005");
  assert.equal(formatDigits(onlyDigits("1,0005")), "10,005");
});

test("지우면 빈 값이 된다", () => {
  assert.equal(onlyDigits(""), "");
  assert.equal(formatDigits(""), "");
  assert.equal(formatDigits(onlyDigits("1")), "1");
});

test("숫자가 아닌 글자는 버리고 앞의 0 은 하나만 남긴다", () => {
  assert.equal(onlyDigits("12a3원 "), "123");
  assert.equal(onlyDigits("007"), "7");
  assert.equal(onlyDigits("0"), "0");
  assert.equal(onlyDigits("abc"), "");
});

test("10자리까지만 받는다", () => {
  assert.equal(onlyDigits("123456789012"), "1234567890");
});

test("수정 화면의 서버 가격(숫자)도 그대로 표시한다", () => {
  assert.equal(formatDigits(18000), "18,000");
  assert.equal(formatDigits(null), "");
});
