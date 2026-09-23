import { client } from "./client.js";

/**
 * 관리자 신고 처리.
 *
 * 관리자가 아니면 서버가 404 로 답한다(403 을 주면 이 주소에 관리자 기능이 있다는 사실이 드러난다).
 * 그래서 화면은 "권한 없음"을 따로 그리지 않고 없는 페이지로 보낸다.
 */

/** 화면에 보일 조치 문구. 서버는 코드만 안다(신고 사유와 같은 방식). */
export const ADMIN_ACTIONS = [
  { value: "NONE", label: "조치 없이 확인함", hint: "신고는 맞지만 지금은 손대지 않아요." },
  { value: "DELETE_PRODUCT", label: "상품 내리기", hint: "목록에서 사라집니다. 대화와 거래 기록은 남아요.", only: "PRODUCT" },
  { value: "SUSPEND_USER", label: "사용자 정지", hint: "로그인이 막힙니다. 해제하면 그대로 돌아와요." },
];

export const REPORT_STATUS_LABELS = { PENDING: "처리 전", RESOLVED: "처리함", REJECTED: "반려" };

export const fetchReports = ({ status = "PENDING", targetType, cursor, size } = {}, signal) => {
  const query = new URLSearchParams({ status });
  if (targetType) query.set("targetType", targetType);
  if (cursor) query.set("cursor", cursor);
  if (size) query.set("size", String(size));
  return client.request(`/admin/reports?${query}`, { signal });
};

export const fetchReport = (id, signal) => client.request(`/admin/reports/${id}`, { signal });

/** 신고를 인정한다. 같은 대상의 대기 신고도 함께 닫힌다(서버 규칙). */
export const resolveReport = (id, { action, reason }) =>
  client.request(`/admin/reports/${id}/resolve`, { method: "POST", body: { action, reason: reason.trim() } });

/** 이 신고 한 건만 닫는다. 대상에는 아무 일도 하지 않는다. */
export const rejectReport = (id, { reason }) =>
  client.request(`/admin/reports/${id}/reject`, { method: "POST", body: { reason: reason.trim() } });
