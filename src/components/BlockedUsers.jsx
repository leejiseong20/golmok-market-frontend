import { useEffect, useRef, useState } from "react";
import { fetchMyBlocks, unblockUser } from "../api/blockApi.js";
import { toast } from "../toast.js";
import Avatar from "./Avatar.jsx";
import EmptyState from "./EmptyState.jsx";
import Modal from "./Modal.jsx";
import styles from "./BlockedUsers.module.css";

/**
 * 차단한 사용자 목록(마이페이지 맨 아래에서 연다).
 *
 * 탭이 아니라 창인 이유: 탭이 다섯 개가 되면 좁은 휴대폰 화면에서 넘친다. 그리고 차단 목록은
 * 로그아웃·탈퇴처럼 가끔 여는 설정이라 그 옆이 자연스럽다.
 *
 * 해제하면 목록에서 바로 뺀다(서버가 확인한 뒤에). 찜과 같은 이유로 낙관적 갱신은 하지 않는다.
 */
export default function BlockedUsers({ onClose, onChanged }) {
  const [list, setList] = useState({ items: [], cursor: null, hasNext: false, loading: true, error: "" });
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState(null);
  const moreController = useRef(null);

  useEffect(() => {
    const abort = new AbortController();
    setList((old) => ({ ...old, loading: true, error: "" }));
    fetchMyBlocks({ signal: abort.signal })
      .then((page) => { if (!abort.signal.aborted) setList({ items: page.content, cursor: page.nextCursor, hasNext: page.hasNext, loading: false, error: "" }); })
      .catch((error) => { if (!abort.signal.aborted) setList((old) => ({ ...old, loading: false, error: error.message })); });
    return () => { abort.abort(); moreController.current?.abort(); };
  }, [retry]);

  async function more() {
    if (list.loading || !list.hasNext) return;
    const abort = new AbortController();
    moreController.current = abort;
    setList((old) => ({ ...old, loading: true }));
    try {
      const page = await fetchMyBlocks({ cursor: list.cursor, signal: abort.signal });
      // 해제로 목록이 바뀐 사이 같은 사람이 다시 올 수 있어 id 로 거른다.
      setList((old) => {
        const seen = new Set(old.items.map((item) => item.userId));
        return { items: [...old.items, ...page.content.filter((item) => !seen.has(item.userId))],
          cursor: page.nextCursor, hasNext: page.hasNext, loading: false, error: "" };
      });
    } catch (error) {
      if (error.name !== "AbortError") setList((old) => ({ ...old, loading: false, error: error.message }));
    }
  }

  async function unblock(item) {
    if (pending) return;
    setPending(item.userId);
    try {
      await unblockUser(item.userId);
      setList((old) => ({ ...old, items: old.items.filter((each) => each.userId !== item.userId) }));
      toast.show(`${item.nickname}님 차단을 해제했어요.`);
      onChanged?.();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setPending(null);
    }
  }

  return <Modal title="차단한 사용자" onClose={onClose}>
    <p className={styles.note}>차단한 사람과는 채팅할 수 없고, 그 사람의 상품은 목록에 보이지 않아요. 상대는 차단 사실을 알 수 없어요.</p>
    {list.error && <div className="alert alert-danger" role="alert">{list.error}
      <button className="btn btn-outline btn-sm" onClick={() => setRetry((n) => n + 1)}>다시 시도</button></div>}
    {!list.error && !list.loading && list.items.length === 0 &&
      <EmptyState compact title="차단한 사용자가 없어요" description="프로필이나 채팅방에서 차단할 수 있어요." />}
    {list.items.length > 0 && <ul className={styles.list}>
      {list.items.map((item) => <li key={item.userId} className={styles.row}>
        <Avatar url={item.profileImageUrl} name={item.nickname} size={40} />
        <span className={styles.name}>{item.nickname}</span>
        <button className="btn btn-outline btn-sm" disabled={pending === item.userId}
          onClick={() => unblock(item)}>{pending === item.userId ? "해제 중…" : "차단 해제"}</button>
      </li>)}
    </ul>}
    {list.loading && <p role="status" className={styles.note}>불러오고 있어요…</p>}
    {list.hasNext && !list.loading && <button className="btn btn-ghost btn-block" onClick={more}>더 보기</button>}
  </Modal>;
}
