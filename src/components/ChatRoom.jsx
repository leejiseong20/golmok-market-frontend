import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  cancelReservation, completeTrade, fetchChatRoom, fetchMessages, leaveChatRoom, markChatRead, reserveTrade, sendMessage,
} from "../api/chatApi.js";
import { chatSocket } from "../api/chatSocket.js";
import Avatar from "./Avatar.jsx";
import ReviewForm from "./ReviewForm.jsx";
import { toast } from "../toast.js";
import { formatChatDay, formatChatTime, formatPrice, statusLabel, tradeStatusLabel } from "../data/format.js";
import styles from "./ChatRoom.module.css";

const MAX_LENGTH = 1000;
const emptyMessages = { items: [], cursor: null, hasNext: false, loading: true, loadingOlder: false, error: "" };

/** id 로 중복을 거르고 오래된 순으로 정렬한다. 내가 보낸 메시지는 REST 응답과 WebSocket 으로 두 번 온다. */
function mergeById(current, incoming) {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

const dayOf = (value) => value?.slice(0, 10);

/**
 * 채팅방. 서버는 최신 메시지부터 주므로 뒤집어서 아래부터 쌓는다.
 *
 * 읽음 처리는 화면이 실제로 보일 때만 보낸다(방에 들어올 때, 보고 있는 동안 상대 메시지가 올 때,
 * 백그라운드 탭이 다시 보일 때). 다른 탭을 보고 있는데 상대에게 "읽음"이 뜨면 거짓 표시가 된다.
 *
 * 거래 버튼은 서버가 준 tradeActions 만 보고 보여준다. 거래 변경은 시스템 메시지로 실시간 전달되므로
 * 시스템 메시지를 받으면 방 정보만 다시 불러와 상대가 바꾼 거래 상태를 맞춘다.
 *
 * 재연결되면 최신 페이지로 다시 불러온다. 끊긴 동안의 메시지는 이벤트로 다시 오지 않는다.
 * 이미 불러온 이전 메시지와 이어 붙이지 않고 바꾸는 이유: 끊긴 동안 메시지가 한 페이지보다 많이 오면
 * 중간이 빈 채로 이어 붙게 된다.
 */
export default function ChatRoom({ roomId, me, onBack, onLeft, onOpenProduct, onOpenProfile }) {
  const [reviewing, setReviewing] = useState(false);
  const [info, setInfo] = useState({ data: null, loading: true, error: "" });
  const [messages, setMessages] = useState(emptyMessages);
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [failedImage, setFailedImage] = useState(false);
  const [infoReload, setInfoReload] = useState(0);
  const [tradePending, setTradePending] = useState(false);
  const [tradeError, setTradeError] = useState("");
  const tradeBusy = useRef(false);
  const alive = useRef(true);
  const sendingRef = useRef(false);
  const olderController = useRef(null);
  const scroller = useRef(null);
  const stickToBottom = useRef(true);
  const restoreFrom = useRef(null);
  const read = useRef({ pending: false, again: false });

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  function markReadIfVisible() {
    if (document.visibilityState !== "visible") return;
    if (read.current.pending) { read.current.again = true; return; }
    read.current = { pending: true, again: false };
    // 읽음 실패는 화면에 알리지 않는다. 다음에 방을 열거나 메시지가 오면 다시 시도된다.
    markChatRead(roomId).catch(() => {}).finally(() => {
      const again = read.current.again;
      read.current = { pending: false, again: false };
      // 요청 중에 도착한 메시지는 이번 읽음 처리에 포함되지 않았을 수 있다.
      if (again && alive.current) markReadIfVisible();
    });
  }

  useEffect(() => {
    const abort = new AbortController();
    olderController.current?.abort();
    setInfo((old) => ({ ...old, loading: !old.data, error: "" }));
    setMessages((old) => ({ ...emptyMessages, items: old.items, loading: old.items.length === 0 }));
    fetchChatRoom(roomId, abort.signal)
      .then((data) => { if (!abort.signal.aborted) setInfo({ data, loading: false, error: "" }); })
      .catch((error) => { if (!abort.signal.aborted) setInfo((old) => ({ ...old, loading: false, error: error.message })); });
    fetchMessages(roomId, { signal: abort.signal })
      .then((page) => {
        if (abort.signal.aborted) return;
        stickToBottom.current = true;
        setMessages({ ...emptyMessages, loading: false, items: [...page.content].reverse(), cursor: page.nextCursor, hasNext: page.hasNext });
        markReadIfVisible();
      })
      .catch((error) => { if (!abort.signal.aborted) setMessages((old) => ({ ...old, loading: false, error: error.message })); });
    return () => { abort.abort(); olderController.current?.abort(); };
  }, [roomId, reload]);

  // 방 정보만 다시 불러온다(거래 상태 변경). 첫 로드는 위 effect 가 한다.
  useEffect(() => {
    if (infoReload === 0) return undefined;
    const abort = new AbortController();
    fetchChatRoom(roomId, abort.signal)
      .then((data) => { if (!abort.signal.aborted) setInfo({ data, loading: false, error: "" }); })
      .catch(() => { /* 다음 이벤트나 재연결 때 다시 맞춘다. 대화는 계속할 수 있다. */ });
    return () => abort.abort();
  }, [roomId, infoReload]);

  useEffect(() => {
    const offEvent = chatSocket.onEvent((event) => {
      if (event.roomId !== roomId) return;
      if (event.type === "MESSAGE") {
        setMessages((old) => ({ ...old, items: mergeById(old.items, [event.message]) }));
        if (event.message.type === "SYSTEM") setInfoReload((value) => value + 1);
        if (event.message.senderId !== me) {
          // 상대가 말을 걸었다면 방에 돌아온 것이다.
          setInfo((old) => old.data ? { ...old, data: { ...old.data, opponentLeft: false } } : old);
          markReadIfVisible();
        }
      } else if (event.type === "READ" && event.readerId !== me) {
        setMessages((old) => ({ ...old, items: old.items.map((message) => message.senderId === me ? { ...message, read: true } : message) }));
      }
    });
    const offConnected = chatSocket.onConnected(() => setReload((value) => value + 1));
    const onVisible = () => { if (document.visibilityState === "visible") markReadIfVisible(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { offEvent(); offConnected(); document.removeEventListener("visibilitychange", onVisible); };
  }, [roomId, me]);

  // 이전 메시지를 위에 붙이면 보던 위치를 유지하고, 맨 아래를 보고 있었다면 새 메시지를 따라 내려간다.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    if (restoreFrom.current !== null) {
      element.scrollTop = element.scrollHeight - restoreFrom.current;
      restoreFrom.current = null;
    } else if (stickToBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages.items]);

  function onScroll() {
    const element = scroller.current;
    stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  }

  async function loadOlder() {
    if (messages.loadingOlder || !messages.hasNext) return;
    const abort = new AbortController();
    olderController.current = abort;
    setMessages((old) => ({ ...old, loadingOlder: true, error: "" }));
    try {
      const page = await fetchMessages(roomId, { cursor: messages.cursor, signal: abort.signal });
      if (abort.signal.aborted) return;
      restoreFrom.current = scroller.current ? scroller.current.scrollHeight - scroller.current.scrollTop : null;
      setMessages((old) => ({ ...old, items: mergeById(old.items, page.content), cursor: page.nextCursor, hasNext: page.hasNext, loadingOlder: false }));
    } catch (error) {
      if (!abort.signal.aborted) setMessages((old) => ({ ...old, loadingOlder: false, error: error.message }));
    }
  }

  async function submit(event) {
    event?.preventDefault();
    const content = draft;
    if (!content.trim() || sendingRef.current) return;
    sendingRef.current = true; setSending(true); setSendError("");
    try {
      const message = await sendMessage(roomId, content);
      if (!alive.current) return;
      stickToBottom.current = true;
      setMessages((old) => ({ ...old, items: mergeById(old.items, [message]) }));
      // 전송 중에 더 입력했다면 지우지 않는다.
      setDraft((current) => current === content ? "" : current);
      // 나간 상대에게 보내면 서버가 상대 목록에 방을 되살린다.
      setInfo((old) => old.data ? { ...old, data: { ...old.data, opponentLeft: false } } : old);
    } catch (error) {
      if (alive.current) setSendError(error.message);
    } finally {
      sendingRef.current = false;
      if (alive.current) setSending(false);
    }
  }

  function onKeyDown(event) {
    // 한글 입력 중 Enter 는 글자 조합을 끝내는 키다. 여기서 보내면 마지막 글자가 빠지거나 두 번 전송된다.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  }

  async function tradeAction(kind) {
    if (tradeBusy.current) return;
    const confirmText = {
      complete: "거래완료로 바꿀까요? 상품이 판매완료가 되고 되돌릴 수 없어요.",
      cancel: "예약을 취소할까요? 상품이 다시 판매중이 돼요.",
    }[kind];
    if (confirmText && !window.confirm(confirmText)) return;
    tradeBusy.current = true; setTradePending(true); setTradeError("");
    try {
      const call = { reserve: reserveTrade, cancel: cancelReservation, complete: completeTrade }[kind];
      const data = await call(roomId);
      if (alive.current) setInfo({ data, loading: false, error: "" });
    } catch (error) {
      if (alive.current) setTradeError(error.message);
    } finally {
      tradeBusy.current = false;
      if (alive.current) setTradePending(false);
    }
  }

  async function leave() {
    if (leaving || !window.confirm("채팅방을 나갈까요? 내 채팅 목록에서 사라집니다.")) return;
    setLeaving(true); setSendError("");
    try {
      await leaveChatRoom(roomId);
      if (alive.current) { onLeft(); toast.show("채팅방에서 나갔어요."); }
    } catch (error) {
      if (alive.current) { setSendError(error.message); setLeaving(false); }
    }
  }

  const room = info.data;
  if (info.error && !room) {
    return <div className={styles.room}>
      <div className={styles.error} role="alert">{info.error}
        <div className={styles.errorActions}>
          <button onClick={() => setReload((value) => value + 1)}>다시 시도</button>
          <button onClick={onBack}>목록으로</button>
        </div>
      </div>
    </div>;
  }

  // 탈퇴한 상대에게는 보낼 수 없고(서버도 거부한다) 프로필도 없다. 대화 기록은 그대로 보여준다.
  const withdrawn = !!room?.opponent.withdrawn;

  return <div className={styles.room}>
    <header className={styles.header}>
      <button className={styles.back} onClick={onBack} aria-label="채팅 목록으로">←</button>
      {room && <Avatar url={room.opponent.profileImageUrl} name={room.opponent.nickname} size={40} />}
      <div className={styles.who}>
        <button onClick={() => onOpenProfile(room.opponent.id)} disabled={!room || withdrawn} aria-label="상대 프로필 보기">
          <strong>{room?.opponent.nickname ?? "…"}</strong></button>
        {room && <span>매너온도 {Number(room.opponent.mannerTemp).toFixed(1)}°C</span>}
      </div>
      <button className={styles.leave} onClick={leave} disabled={leaving || !room}>{leaving ? "나가는 중…" : "나가기"}</button>
    </header>

    {room && <button className={styles.product} disabled={room.product.deleted}
      onClick={() => onOpenProduct(room.product.id)} aria-label={`상품 보기: ${room.product.title}`}>
      <span className={styles.thumb}>{room.product.thumbnailUrl && !failedImage
        ? <img src={room.product.thumbnailUrl} alt="" onError={() => setFailedImage(true)} /> : null}</span>
      <span className={styles.productBody}>
        <span className={styles.productTitle}>{room.product.deleted ? "삭제된 상품이에요" : room.product.title}</span>
        <span className={styles.productMeta}>
          <em>{statusLabel(room.product.status)}</em> {formatPrice(room.product.price)}
        </span>
      </span>
    </button>}

    {room && (room.trade || room.tradeActions.reserve) && <section className={styles.tradeBar} aria-label="거래">
      <span className={styles.tradeStatus}>
        {room.trade ? tradeStatusLabel(room.trade.status) : "이 구매자와 거래를 시작할 수 있어요"}
      </span>
      <span className={styles.tradeButtons}>
        {room.tradeActions.review && <button className={styles.tradePrimary} onClick={() => setReviewing(true)}>후기 남기기</button>}
        {room.tradeActions.reserve && <button className={styles.tradePrimary} disabled={tradePending} onClick={() => tradeAction("reserve")}>예약하기</button>}
        {room.tradeActions.complete && <button className={styles.tradePrimary} disabled={tradePending} onClick={() => tradeAction("complete")}>거래완료</button>}
        {room.tradeActions.cancel && <button className={styles.tradeSecondary} disabled={tradePending} onClick={() => tradeAction("cancel")}>예약 취소</button>}
      </span>
      {tradeError && <p className={styles.tradeError} role="alert">{tradeError}</p>}
    </section>}

    {reviewing && room && <ReviewForm tradeId={room.trade.id} nickname={room.opponent.nickname}
      onClose={() => setReviewing(false)} onSaved={() => { setReviewing(false); setInfoReload((n) => n + 1); }} />}
    <div className={styles.messages} ref={scroller} onScroll={onScroll} aria-live="polite">
      {messages.hasNext && <button className={styles.older} onClick={loadOlder} disabled={messages.loadingOlder}>
        {messages.loadingOlder ? "불러오는 중…" : "이전 메시지 보기"}</button>}
      {messages.loading && <p className={styles.notice} role="status">대화를 불러오고 있어요…</p>}
      {messages.error && <div className={styles.error} role="alert">{messages.error}
        <div className={styles.errorActions}>
          <button onClick={() => (messages.items.length ? loadOlder() : setReload((value) => value + 1))}>다시 시도</button>
        </div></div>}
      {!messages.loading && !messages.error && messages.items.length === 0 &&
        <p className={styles.notice} role="status">첫 메시지를 보내 대화를 시작해 보세요.</p>}
      {messages.items.map((message, index) => {
        const mine = message.senderId === me;
        const newDay = dayOf(message.createdAt) !== dayOf(messages.items[index - 1]?.createdAt);
        if (message.type === "SYSTEM") {
          return <div key={message.id}>
            {newDay && <p className={styles.day}>{formatChatDay(message.createdAt)}</p>}
            <p className={styles.system}>{message.content} <time dateTime={message.createdAt}>{formatChatTime(message.createdAt)}</time></p>
          </div>;
        }
        return <div key={message.id}>
          {newDay && <p className={styles.day}>{formatChatDay(message.createdAt)}</p>}
          <div className={styles.row + (mine ? " " + styles.mine : "")}>
            <p className={styles.bubble}>{message.content}</p>
            <span className={styles.meta}>
              {mine && message.read && <span className={styles.read}>읽음</span>}
              <time dateTime={message.createdAt}>{formatChatTime(message.createdAt)}</time>
            </span>
          </div>
        </div>;
      })}
      {withdrawn
        ? <p className={styles.notice}>탈퇴한 사용자예요. 대화 기록은 볼 수 있지만 메시지를 보내거나 거래할 수 없어요.</p>
        : room?.opponentLeft && <p className={styles.notice}>상대방이 채팅방을 나갔어요. 메시지를 보내면 상대에게 다시 보여요.</p>}
    </div>

    <form className={styles.composer} onSubmit={submit}>
      {sendError && <p className={styles.sendError} role="alert">{sendError}</p>}
      <div className={styles.inputRow}>
        <textarea aria-label="메시지 입력" placeholder={withdrawn ? "탈퇴한 사용자에게는 보낼 수 없어요" : "메시지를 입력하세요"}
          rows={1} maxLength={MAX_LENGTH}
          value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown}
          onFocus={() => {
            // iOS 는 입력창을 화면에 넣으려고 페이지를 스크롤해 상단 헤더를 밀어낸다.
            // 방 높이는 이미 보이는 높이에 맞춰져 있으므로 맨 위로 되돌리면 헤더가 계속 보인다.
            setTimeout(() => window.scrollTo(0, 0), 300);
          }}
          disabled={!room || withdrawn} />
        <button type="submit" className={styles.send} disabled={sending || !draft.trim() || !room || withdrawn}>
          {sending ? "전송 중" : "전송"}</button>
      </div>
      {draft.length > MAX_LENGTH - 100 && <p className={styles.count}>{draft.length} / {MAX_LENGTH}</p>}
    </form>
  </div>;
}
