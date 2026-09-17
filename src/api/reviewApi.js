import { client } from "./client.js";

export const createReview = (tradeId, { score, content }) =>
  client.request(`/trades/${encodeURIComponent(tradeId)}/reviews`, { method: "POST", body: { score, content } });

export function fetchReviews(userId, { cursor, signal } = {}) {
  const query = new URLSearchParams({ size: 20 });
  if (cursor) query.set("cursor", cursor);
  return client.request(`/users/${encodeURIComponent(userId)}/reviews?${query}`, { signal });
}
