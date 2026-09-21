import { useEffect, useRef, useState } from "react";
import { chatSocket } from "../api/chatSocket.js";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "../api/notificationApi.js";
import { relativeTime } from "../data/format.js";
import Modal from "./Modal.jsx";
import styles from "./NotificationPanel.module.css";

const empty = { items: [], cursor: null, hasNext: false, loading: true, loadingMore: false, error: "" };

/**
 * 알림함. 열 때마다 서버에서 새로 받고, 열려 있는 동안 도착한 알림은 맨 위에 붙인다.
 *
 * 읽음은 서버가 성공한 뒤에만 반영한다(찜과 같은 이유: 뱃지 숫자와 목록이 어긋난 채 남지 않게).
 * 알림을 누르면 읽음 요청을 보내고 곧바로 이동한다. 이동이 읽음 응답을 기다릴 이유는 없다.
 */
export default function NotificationPanel({ onClose, onNavigate, onRead, onAllRead }) {
  const [list, setList] = useState(empty);
  const [retry, setRetry] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);
  const [actionError, setActionError] = useState("");
  const alive = useRef(true);
  const moreController = useRef(null);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    const abort = new AbortController();
    moreController.current?.abort();
    setList(empty);
    fetchNotifications({ signal: abort.signal })
      .then((page) => { if (!abort.signal.aborted) setList({ ...empty, loading: false, items: page.content, cursor: page.nextCursor, hasNext: page.hasNext }); })
      .catch((error) => { if (!abort.signal.aborted) setList({ ...empty, loading: false, error: error.message }); });
    return () => { abort.abort(); moreController.current?.abort(); };
  }, [retry]);

  useEffect(() => chatSocket.onEvent((event) => {
    if (event.type !== "NOTIFICATION") return;
    setList((old) => old.items.some((item) => item.id === event.notification.id)
      ? old : { ...old, items: [event.notification, ...old.items] });
  }), []);

  async function more() {
    if (list.loadingMore || !list.hasNext) return;
    const abort = new AbortController();
    moreController.current = abort;
    setList((old) => ({ ...old, loadingMore: true, error: "" }));
    try {
      const page = await fetchNotifications({ cursor: list.cursor, signal: abort.signal });
      if (!abort.signal.aborted) setList((old) => {
        const known = new Set(old.items.map((item) => item.id));
        return { ...old, items: [...old.items, ...page.content.filter((item) => !known.has(item.id))],
          cursor: page.nextCursor, hasNext: page.hasNext, loadingMore: false };
      });
    } catch (error) {
      if (!abort.signal.aborted) setList((old) => ({ ...old, loadingMore: false, error: error.message }));
    }
  }

  function open(notification) {
    if (!notification.read) {
      markNotificationRead(notification.id)
        .then(() => {
          onRead();
          if (alive.current) setList((old) => ({ ...old, items: old.items.map((item) => item.id === notification.id ? { ...item, read: true } : item) }));
        })
        .catch(() => { /* 이동은 계속한다. 다음에 알림함을 열면 안 읽은 상태로 다시 보인다. */ });
    }
    onNavigate(notification.targetUrl);
  }

  async function readAll() {
    if (markingAll) return;
    setMarkingAll(true); setActionError("");
    try {
      await markAllNotificationsRead();
      onAllRead();
      if (alive.current) setList((old) => ({ ...old, items: old.items.map((item) => ({ ...item, read: true })) }));
    } catch (error) {
      if (alive.current) setActionError(error.message);
    } finally {
      if (alive.current) setMarkingAll(false);
    }
  }

  const hasUnread = list.items.some((item) => !item.read);

  return <Modal title="알림" onClose={onClose}>
    <div className={styles.toolbar}>
      <button className={styles.readAll} onClick={readAll} disabled={markingAll || !hasUnread}>
        {markingAll ? "처리 중…" : "모두 읽음"}</button>
    </div>
    {actionError && <p className={styles.error} role="alert">{actionError}</p>}
    {list.loading && <p className={styles.empty} role="status">알림을 불러오고 있어요…</p>}
    {list.error && <div className={styles.error} role="alert">{list.error}
      <button onClick={() => (list.items.length ? more() : setRetry((value) => value + 1))}>다시 시도</button></div>}
    {!list.loading && !list.error && list.items.length === 0 && <p className={styles.empty} role="status">
      아직 알림이 없어요. 찜·거래·후기 소식이 여기에 모여요.</p>}
    <ul className={styles.list}>
      {list.items.map((notification) => <li key={notification.id}>
        <button className={styles.item + " " + (notification.read ? styles.read : styles.unread)} onClick={() => open(notification)}>
          <span className={styles.top}>
            <strong>{notification.title}</strong>
            <time dateTime={notification.createdAt}>{relativeTime(notification.createdAt)}</time>
          </span>
          {notification.content && <span className={styles.content}>{notification.content}</span>}
          {!notification.read && <span className={styles.srOnly}>읽지 않음</span>}
        </button>
      </li>)}
    </ul>
    {list.hasNext && <button className={styles.more} onClick={more} disabled={list.loadingMore}>
      {list.loadingMore ? "불러오는 중…" : "더 보기"}</button>}
  </Modal>;
}
