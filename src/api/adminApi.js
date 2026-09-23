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

/** 조치 기록에 보일 문구. 서버는 코드만 준다. */
export const ACTION_LABELS = {
  SUSPEND_USER: "사용자 정지",
  UNSUSPEND_USER: "정지 해제",
  DELETE_PRODUCT: "상품 내리기",
  RESTORE_PRODUCT: "상품 되살리기",
  RESOLVE_REPORT: "신고 인정",
  REJECT_REPORT: "신고 반려",
};
export const actionLabel = (action) => ACTION_LABELS[action] ?? action;

export const USER_STATUS_LABELS = { ACTIVE: "정상", SUSPENDED: "정지", WITHDRAWN: "탈퇴" };

/**
 * 관리자 API 가 "관리자가 아님"으로 답했는지. 서버는 이때 RESOURCE_NOT_FOUND(404) 를 준다.
 * 없는 회원·상품은 USER_NOT_FOUND 처럼 다른 코드라 여기에 걸리지 않는다(그때는 없는 페이지로 보내지 않는다).
 */
export const isAdminDenied = (error) => error?.code === "RESOURCE_NOT_FOUND";

/** 빈 값은 보내지 않는다. 서버는 빠진 조건을 "거르지 않음"으로 본다. */
function queryOf(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

const post = (path, reason) => client.request(path, { method: "POST", body: { reason: reason.trim() } });

export const fetchSummary = (signal) => client.request("/admin/summary", { signal });

/** q 에 @ 가 있으면 서버가 이메일 전체 일치로, 없으면 닉네임 부분 일치로 찾는다. */
export const fetchUsers = ({ q, status, cursor } = {}, signal) =>
  client.request(`/admin/users${queryOf({ q, status, cursor })}`, { signal });
export const fetchAdminUser = (id, signal) => client.request(`/admin/users/${id}`, { signal });
export const suspendUser = (id, reason) => post(`/admin/users/${id}/suspend`, reason);
export const unsuspendUser = (id, reason) => post(`/admin/users/${id}/unsuspend`, reason);

/** deleted: true(삭제만)·false(보이는 것만)·생략(전부). 삭제한 상품도 보인다. */
export const fetchAdminProducts = ({ q, sellerId, deleted, cursor } = {}, signal) =>
  client.request(`/admin/products${queryOf({ q, sellerId, deleted, cursor })}`, { signal });
export const fetchAdminProduct = (id, signal) => client.request(`/admin/products/${id}`, { signal });
export const deleteProductByAdmin = (id, reason) => post(`/admin/products/${id}/delete`, reason);
/** 관리자가 내린 상품만 된다. 판매자가 직접 지웠거나 판매자가 탈퇴했으면 서버가 409 로 거절한다. */
export const restoreProduct = (id, reason) => post(`/admin/products/${id}/restore`, reason);

export const fetchActions = ({ action, cursor } = {}, signal) =>
  client.request(`/admin/actions${queryOf({ action, cursor })}`, { signal });
