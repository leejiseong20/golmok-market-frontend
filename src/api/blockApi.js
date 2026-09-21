import { client } from "./client.js";

export const blockUser = (userId) =>
  client.request(`/users/${encodeURIComponent(userId)}/block`, { method: "POST" });

/** 차단하지 않은 사람을 해제해도 서버는 204 다(멱등). 화면 상태가 어긋나도 한 번 더 누르면 맞춰진다. */
export const unblockUser = (userId) =>
  client.request(`/users/${encodeURIComponent(userId)}/block`, { method: "DELETE" });

export function fetchMyBlocks({ cursor, signal } = {}) {
  const query = new URLSearchParams({ size: 20 });
  if (cursor) query.set("cursor", cursor);
  return client.request(`/users/me/blocks?${query}`, { signal });
}

/** 차단 전에 묻는 문구. 프로필·채팅방·신고 완료 화면이 같은 문장을 쓴다. */
export const blockConfirmText = (nickname) =>
  `${nickname}님을 차단할까요?\n서로 채팅할 수 없고, 이 사람의 상품이 목록에 보이지 않아요. 상대는 차단 사실을 알 수 없어요.`;
