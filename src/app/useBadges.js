import { useEffect, useRef, useState } from "react";
import { chatSocket } from "../api/chatSocket.js";
import { fetchChatUnreadCount } from "../api/chatApi.js";
import { fetchUnreadCount } from "../api/notificationApi.js";

/**
 * 채팅 실시간 연결과 헤더·하단 탭의 뱃지(안 읽은 알림 · 안 읽은 채팅 메시지).
 *
 * @param userId   로그인한 동안만 연결한다. 바뀌면 이전 연결을 끊고 새 토큰으로 다시 연결한다.
 * @param pathname 페이지를 옮길 때마다 채팅 뱃지를 다시 묻는다(나가기는 이벤트 없이 읽음 처리된다).
 */
export default function useBadges(userId, pathname) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const reloadChatUnread = useRef(() => {});
  const chatUnreadPath = useRef(pathname);

  // 로그인한 동안만 채팅 실시간 연결을 유지한다. 사용자가 바뀌면 이전 연결을 끊고 새 토큰으로 다시 연결한다.
  useEffect(() => {
    if (!userId) return undefined;
    chatSocket.start();
    return () => chatSocket.stop();
  }, [userId]);

  // 알림 뱃지. 로그인 시·소켓 (재)연결 시 서버 값으로 맞추고, 그 사이에는 실시간 알림 이벤트로 1씩 올린다.
  // 끊긴 동안 온 알림은 이벤트로 다시 오지 않으므로 재연결 때 다시 센다.
  useEffect(() => {
    setUnreadCount(0);
    if (!userId) return undefined;
    let abort = new AbortController();
    const load = () => {
      abort.abort(); abort = new AbortController();
      const signal = abort.signal;
      fetchUnreadCount(signal).then((data) => { if (!signal.aborted) setUnreadCount(data.count); })
        .catch(() => { /* 뱃지는 부가 정보다. 다음 연결·알림 때 다시 맞춘다. */ });
    };
    load();
    const offConnected = chatSocket.onConnected(load);
    const offEvent = chatSocket.onEvent((event) => {
      if (event.type === "NOTIFICATION") setUnreadCount((value) => value + 1);
    });
    return () => { abort.abort(); offConnected(); offEvent(); };
  }, [userId]);

  /**
   * 채팅 뱃지(안 읽은 메시지 합계). 알림 뱃지와 달리 +1 로 세지 않고 서버에 다시 묻는다.
   * 보고 있는 방의 메시지는 곧바로 읽음 처리되고, 방에 들어가 읽으면 여러 개가 한 번에 줄어서
   * 화면에서 더하고 빼면 어긋나기 쉽다. 대신 이벤트가 몰려도 요청은 300ms 에 한 번만 보낸다.
   * 다시 묻는 때: 로그인, 소켓 (재)연결, 상대의 새 메시지, 내가 읽음, 페이지 이동(나가기는 이벤트 없이 읽음 처리된다).
   */
  useEffect(() => {
    setChatUnreadCount(0);
    if (!userId) return undefined;
    const me = userId;
    let abort = new AbortController();
    let timer = null;
    const load = () => {
      clearTimeout(timer); timer = null;
      abort.abort(); abort = new AbortController();
      const signal = abort.signal;
      fetchChatUnreadCount(signal).then((data) => { if (!signal.aborted) setChatUnreadCount(data.count); })
        .catch(() => { /* 뱃지는 부가 정보다. 다음 이벤트·이동 때 다시 맞춘다. */ });
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(load, 300); };
    reloadChatUnread.current = schedule;
    load();
    const offConnected = chatSocket.onConnected(load);
    const offEvent = chatSocket.onEvent((event) => {
      if ((event.type === "MESSAGE" && event.message.senderId !== me) || (event.type === "READ" && event.readerId === me)) schedule();
    });
    return () => {
      clearTimeout(timer); abort.abort(); offConnected(); offEvent();
      reloadChatUnread.current = () => {};
    };
  }, [userId]);

  // 처음 렌더링은 위 effect 가 이미 불러오므로 건너뛴다.
  useEffect(() => {
    if (chatUnreadPath.current === pathname) return;
    chatUnreadPath.current = pathname;
    reloadChatUnread.current();
  }, [pathname]);

  return {
    unreadCount,
    chatUnreadCount,
    /** 알림 하나를 읽었다(서버 성공 뒤에만 줄인다 — 찜과 같은 이유로 낙관적 갱신 없음). */
    markRead: () => setUnreadCount((value) => Math.max(0, value - 1)),
    markAllRead: () => setUnreadCount(0),
    /** 차단·해제처럼 방 목록이 달라지는 동작 뒤에 채팅 뱃지를 다시 묻는다. */
    reloadChatUnread: () => reloadChatUnread.current(),
  };
}
