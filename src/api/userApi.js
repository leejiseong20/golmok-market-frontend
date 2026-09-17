import { client } from "./client.js";

export const fetchMe = (signal) => client.request("/users/me", { signal });
export const fetchProfile = (id, signal) => client.request(`/users/${encodeURIComponent(id)}`, { signal });

export function fetchMyFavorites({ cursor, signal } = {}) {
  const query = new URLSearchParams({ size: 20 });
  if (cursor) query.set("cursor", cursor);
  return client.request(`/users/me/favorites?${query}`, { signal });
}

// 세 API 모두 갱신된 내 동네 목록 전체를 돌려준다. 대표 이동처럼 여러 행이 한 번에 바뀌기 때문이다.
export const verifyMyRegion = (lat, lng) =>
  client.request("/users/me/regions", { method: "POST", body: { lat, lng } });
export const deleteMyRegion = (regionId) =>
  client.request(`/users/me/regions/${encodeURIComponent(regionId)}`, { method: "DELETE" });
export const markPrimaryRegion = (regionId) =>
  client.request(`/users/me/regions/${encodeURIComponent(regionId)}/primary`, { method: "PATCH" });
