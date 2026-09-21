/**
 * 상품 가격 입력칸. 상태에는 숫자만("1000000") 두고, 보일 때만 쉼표를 찍는다("1,000,000").
 *
 * 입력칸이 type="number" 가 아니라 글자 칸(inputMode="numeric")이라, 붙여 넣기나 쉼표가 섞인 글자도 들어온다.
 * 숫자가 아닌 글자는 모두 버린다. 처음 만든 코드는 정규식의 역슬래시가 빠져(/D/g) 쉼표가 남았고,
 * 그 값을 Number 로 바꾼 NaN 이 입력칸에 찍혀 지워지지도 않았다(실제 기기에서 발견). 그래서 테스트로 묶어 둔다.
 */

/** 가격 상한 2,147,483,647 이 10자리다. 넘는 값은 제출할 때 막는다. */
const MAX_DIGITS = 10;

/** 입력칸 글자에서 숫자만 남긴다. 앞의 0 은 하나만 남긴다("007" → "7", "0" → "0"). */
export function onlyDigits(text) {
  return String(text ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, MAX_DIGITS);
}

/** 숫자 글자를 쉼표 찍은 글자로. 빈 값은 빈 값이다(0 을 미리 채우지 않는다). */
export function formatDigits(digits) {
  const clean = onlyDigits(digits);
  return clean === "" ? "" : Number(clean).toLocaleString("ko-KR");
}
