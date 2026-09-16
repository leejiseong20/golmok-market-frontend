export const formatPrice = (price) => price === 0 ? "나눔" : `${price.toLocaleString("ko-KR")}원`;
export const statusLabel = (status) => ({ ON_SALE: "판매중", RESERVED: "예약중", SOLD: "판매완료" }[status] ?? status);

// API의 시간대 없는 LocalDateTime은 명세상 한국 시각이다.
const koreaDate = (value) => new Date(`${value}+09:00`);
export function relativeTime(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - koreaDate(value).getTime()) / 60000));
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1440)}일 전`;
}
export function formatDate(value) {
  const date = koreaDate(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short",
  }).format(date);
}
