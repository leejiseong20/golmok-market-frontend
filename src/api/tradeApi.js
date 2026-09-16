import { client } from "./client.js";

export function fetchMyPurchases({ cursor, signal } = {}) {
  const query = new URLSearchParams({ size: 20 });
  if (cursor) query.set("cursor", cursor);
  return client.request(`/users/me/purchases?${query}`, { signal });
}

// 응답은 갱신된 구매내역 한 건이라 목록을 다시 부르지 않고 그 항목만 교체한다.
export const confirmPurchase = (tradeId) =>
  client.request(`/trades/${encodeURIComponent(tradeId)}/confirm`, { method: "PATCH" });
