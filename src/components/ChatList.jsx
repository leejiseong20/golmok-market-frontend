import { useEffect, useRef, useState } from "react";
import { fetchChatRooms } from "../api/chatApi.js";
import { chatSocket } from "../api/chatSocket.js";
import Avatar from "./Avatar.jsx";
import { relativeTime, statusLabel } from "../data/format.js";
import EmptyState from "./EmptyState.jsx";
import { ChatListSkeleton } from "./Skeleton.jsx";
import styles from "./ChatList.module.css";

const emptyList = { items: [], cursor: null, hasNext: false, loading: true, loadingMore: false, error: "" };

/**
 * 내 채팅 목록. 최근 메시지 순.
 *
 * 실시간 이벤트로 목록을 직접 고친다.
 * - 새 메시지: 해당 방의 미리보기를 바꾸고 맨 위로 올린다. 상대 메시지면 안 읽은 수를 1 올린다.
 *   목록에 없는 방(새 방, 나갔다가 다시 나타난 방)이면 첫 페이지를 다시 불러온다.
 * - 읽음(내가 읽음): 안 읽은 수를 0 으로. 방 화면이 읽음 처리하면 서버가 이 이벤트를 보내므로
 *   선택한 방인지 여기서 따로 판단하지 않는다(서버 값만 따른다).
 * - 재연결: 끊긴 동안의 이벤트를 받지 못했으므로 다시 불러온다.
 */
export default function ChatList({ me, selectedId, onSelect }) {
  const [list, setList] = useState(emptyList);
  const [reload, setReload] = useState(0);
  const [failedImages, setFailedImages] = useState(() => new Set());
  const moreController = useRef(null);
  const morePending = useRef(false);
  const itemsRef = useRef([]);
  itemsRef.current = list.items;

  useEffect(() => {
    const abort = new AbortController();
    moreController.current?.abort();
    morePending.current = false;
    // 재연결로 다시 불러올 때는 기존 목록을 보여준 채로 바꾼다. 비우면 화면이 깜빡인다.
    setList((old) => ({ ...old, loading: old.items.length === 0, error: "" }));
    fetchChatRooms({ signal: abort.signal })
      .then((page) => {
        if (!abort.signal.aborted) setList({ ...emptyList, loading: false, items: page.content, cursor: page.nextCursor, hasNext: page.hasNext });
      })
      .catch((error) => { if (!abort.signal.aborted) setList((old) => ({ ...old, loading: false, error: error.message })); });
    return () => { abort.abort(); moreController.current?.abort(); };
  }, [reload]);

  useEffect(() => {
    const offEvent = chatSocket.onEvent((event) => {
      if (event.type === "MESSAGE") {
        // 거래 변경(시스템 메시지)은 상품 상태 표시도 바뀌므로 목록을 새로 받는다.
        if (event.message.type === "SYSTEM" || !itemsRef.current.some((room) => room.roomId === event.roomId)) {
          setReload((value) => value + 1);
          return;
        }
        const message = event.message;
        setList((old) => {
          const target = old.items.find((room) => room.roomId === event.roomId);
          if (!target) return old;
          const updated = {
            ...target,
            lastMessage: message.content.slice(0, 200),
            lastMessageAt: message.createdAt,
            unreadCount: target.unreadCount + (message.senderId === me ? 0 : 1),
          };
          return { ...old, items: [updated, ...old.items.filter((room) => room.roomId !== event.roomId)] };
        });
      } else if (event.type === "READ" && event.readerId === me) {
        setList((old) => ({ ...old, items: old.items.map((room) => room.roomId === event.roomId ? { ...room, unreadCount: 0 } : room) }));
      }
    });
    const offConnected = chatSocket.onConnected(() => setReload((value) => value + 1));
    return () => { offEvent(); offConnected(); };
  }, [me]);

  async function more() {
    if (morePending.current || list.loading || !list.hasNext) return;
    morePending.current = true;
    const abort = new AbortController();
    moreController.current = abort;
    setList((old) => ({ ...old, loadingMore: true, error: "" }));
    try {
      const page = await fetchChatRooms({ cursor: list.cursor, signal: abort.signal });
      if (!abort.signal.aborted) setList((old) => {
        const known = new Set(old.items.map((room) => room.roomId));
        return { ...old, items: [...old.items, ...page.content.filter((room) => !known.has(room.roomId))],
          cursor: page.nextCursor, hasNext: page.hasNext, loadingMore: false };
      });
    } catch (error) {
      if (!abort.signal.aborted) setList((old) => ({ ...old, error: error.message, loadingMore: false }));
    } finally {
      if (moreController.current === abort) morePending.current = false;
    }
  }

  return <div>
    {list.loading && <ChatListSkeleton />}
    {list.error && <div className={styles.error} role="alert">{list.error}
      <button className="btn btn-outline btn-sm" onClick={() => (list.items.length ? more() : setReload((value) => value + 1))}>다시 시도</button></div>}
    {!list.loading && !list.error && list.items.length === 0 &&
      <EmptyState compact title="아직 대화가 없어요" description="마음에 드는 상품에서 채팅하기를 누르면 여기에 쌓여요." />}
    <ul className={styles.list}>
      {list.items.map((room) => <li key={room.roomId}>
        <button className={styles.item + (room.roomId === selectedId ? " " + styles.selected : "")}
          aria-current={room.roomId === selectedId ? "true" : undefined}
          onClick={() => onSelect(room.roomId)}>
          <span className={styles.thumb}>
            {room.product.thumbnailUrl && !failedImages.has(room.roomId)
              ? <img src={room.product.thumbnailUrl} alt="" loading="lazy"
                  onError={() => setFailedImages((old) => new Set(old).add(room.roomId))} />
              : null}
          </span>
          <span className={styles.body}>
            <span className={styles.top}>
              <span className={styles.who}>
                <Avatar url={room.opponent.profileImageUrl} name={room.opponent.nickname} size={20} />
                <strong className={styles.nickname}>{room.opponent.nickname}</strong>
              </span>
              <span className={styles.time}>{relativeTime(room.lastMessageAt)}</span>
            </span>
            <span className={styles.product}>
              {room.product.deleted ? "삭제된 상품" : `${statusLabel(room.product.status)} · ${room.product.title}`}
            </span>
            <span className={styles.bottom}>
              <span className={styles.preview}>{room.lastMessage}</span>
              {room.unreadCount > 0 && <span className={styles.badge} aria-label={`안 읽은 메시지 ${room.unreadCount}개`}>
                {room.unreadCount > 99 ? "99+" : room.unreadCount}</span>}
            </span>
          </span>
        </button>
      </li>)}
    </ul>
    {list.hasNext && <button className={"btn btn-outline btn-block " + styles.more} onClick={more} disabled={list.loadingMore}>
      {list.loadingMore ? "불러오는 중…" : "더 보기"}</button>}
  </div>;
}
