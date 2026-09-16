import { client } from "./client.js";

export const fetchMe = (signal) => client.request("/users/me", { signal });

export function fetchMyFavorites({ cursor, signal } = {}) {
  const query = new URLSearchParams({ size: 20 });
  if (cursor) query.set("cursor", cursor);
  return client.request(`/users/me/favorites?${query}`, { signal });
}
