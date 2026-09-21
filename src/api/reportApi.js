import { client } from "./client.js";

/**
 * 신고. 화면에 보일 사유 문구는 여기 둔다(서버는 코드만 안다. 상품 상태 라벨과 같은 방식).
 * 순서가 곧 화면의 선택지 순서다. 흔한 것부터, 기타는 맨 끝.
 */
export const REPORT_REASONS = [
  { value: "FRAUD", label: "사기가 의심돼요" },
  { value: "PROHIBITED", label: "거래 금지 물품이에요" },
  { value: "SPAM", label: "광고·도배예요" },
  { value: "ABUSE", label: "욕설·비방을 해요" },
  { value: "OTHER", label: "기타" },
];

export const report = ({ targetType, targetId, reason, detail }) =>
  client.request("/reports", {
    method: "POST",
    // 공백만 적은 것은 안 적은 것으로 보낸다(서버도 같은 기준이다).
    body: { targetType, targetId, reason, detail: detail?.trim() || null },
  });
