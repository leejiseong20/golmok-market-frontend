import { client } from "./client.js";

export function fetchNotifications({ cursor, signal } = {}) {
  const query = new URLSearchParams({ size: 20 });
  if (cursor) query.set("cursor", cursor);
  return client.request(`/notifications?${query}`, { signal });
}

export const fetchUnreadCount = (signal) => client.request("/notifications/unread-count", { signal });

export const markNotificationRead = (id) =>
  client.request(`/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });

export const markAllNotificationsRead = () => client.request("/notifications/read-all", { method: "PATCH" });

/**
 * 알림의 이동 경로를 화면 동작으로 바꾼다. 라우터가 없어 경로를 직접 해석한다.
 * 모르는 경로면 null 을 돌려주고, 화면은 알림을 읽음 처리만 한다(서버가 새 경로를 추가해도 깨지지 않게).
 */
export function resolveTarget(targetUrl) {
  const product = /^\/products\/(\d+)$/.exec(targetUrl ?? "");
  if (product) return { kind: "product", id: Number(product[1]) };
  const room = /^\/chat-rooms\/(\d+)$/.exec(targetUrl ?? "");
  if (room) return { kind: "chat", id: Number(room[1]) };
  if (targetUrl === "/my/reviews") return { kind: "myReviews" };
  return null;
}
