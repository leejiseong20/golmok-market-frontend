import { client } from "./client.js";

export const fetchCategories = (signal) => client.request("/categories", { signal });
export function fetchProducts({ regionId, categoryId, keyword, sort = "LATEST", cursor, signal }) {
  const query = new URLSearchParams({ regionId, sort, size: 20 });
  if (categoryId) query.set("categoryId", categoryId);
  if (keyword) query.set("keyword", keyword);
  if (cursor) query.set("cursor", cursor);
  return client.request(`/products?${query}`, { signal });
}
export const fetchProduct = (id, signal) => client.request(`/products/${encodeURIComponent(id)}`, { signal });

// 응답은 { isLiked, favoriteCount } — 목록을 다시 부르지 않고 카드만 갱신한다.
export const addFavorite = (id) => client.request(`/products/${encodeURIComponent(id)}/favorite`, { method: "POST" });
export const removeFavorite = (id) => client.request(`/products/${encodeURIComponent(id)}/favorite`, { method: "DELETE" });

export const createProduct = (body) => client.request("/products", { method: "POST", body });
export const updateProduct = (id, body) => client.request(`/products/${encodeURIComponent(id)}`, { method: "PUT", body });
export const deleteProduct = (id) => client.request(`/products/${encodeURIComponent(id)}`, { method: "DELETE" });
export const changeProductStatus = (id, status) => client.request(`/products/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status } });
export const bumpProduct = (id) => client.request(`/products/${encodeURIComponent(id)}/bump`, { method: "POST" });
export function fetchMyProducts({ status, cursor, signal } = {}) {
  const query = new URLSearchParams({ size: 20 });
  if (status) query.set("status", status);
  if (cursor) query.set("cursor", cursor);
  return client.request(`/products/me?${query}`, { signal });
}
