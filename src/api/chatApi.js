import { client } from "./client.js";

const room = (roomId) => `/chat-rooms/${encodeURIComponent(roomId)}`;

function page(path, { cursor, size = 20, signal } = {}) {
  const query = new URLSearchParams({ size });
  if (cursor) query.set("cursor", cursor);
  return client.request(`${path}?${query}`, { signal });
}

/** 채팅하기. 이미 방이 있으면 서버가 같은 방을 돌려준다(201/200 응답 본문이 같다). */
export const openChatRoom = (productId) =>
  client.request(`/products/${encodeURIComponent(productId)}/chat-rooms`, { method: "POST" });

export const fetchChatRooms = (options) => page("/chat-rooms", options);

export const fetchChatRoom = (roomId, signal) => client.request(room(roomId), { signal });

/** 최신 메시지부터 온다. nextCursor 로 더 오래된 메시지를 불러온다. */
export const fetchMessages = (roomId, options) => page(`${room(roomId)}/messages`, { size: 30, ...options });

export const sendMessage = (roomId, content) =>
  client.request(`${room(roomId)}/messages`, { method: "POST", body: { content } });

export const markChatRead = (roomId) => client.request(`${room(roomId)}/read`, { method: "PATCH" });

export const leaveChatRoom = (roomId) => client.request(room(roomId), { method: "DELETE" });
