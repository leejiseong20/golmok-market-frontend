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

