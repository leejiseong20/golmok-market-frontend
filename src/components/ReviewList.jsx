import { useEffect, useRef, useState } from "react";
import { fetchReviews } from "../api/reviewApi.js";
import { formatDate } from "../data/format.js";
import styles from "./ReviewList.module.css";

const empty = { items: [], cursor: null, hasNext: false, loading: true, error: "" };

/** 부모에서 userId 를 key 로 사용한다. 다른 사람의 후기가 잠깐 보이지 않도록 목록을 분리한다. */
export default function ReviewList({ userId }) {
  const [state, setState] = useState(empty);
  const [retry, setRetry] = useState(0);
  const [morePending, setMorePending] = useState(false);
  const controller = useRef(null);
  const busy = useRef(false);

  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    setState(empty);
    fetchReviews(userId, { signal: abort.signal }).then((page) => {
      if (!abort.signal.aborted) setState({ items: page.content, cursor: page.nextCursor, hasNext: page.hasNext, loading: false, error: "" });
    }).catch((error) => { if (!abort.signal.aborted) setState({ ...empty, loading: false, error: error.message }); });
    return () => controller.current?.abort();
  }, [userId, retry]);

  async function more() {
    if (busy.current || !state.hasNext) return;
    busy.current = true; setMorePending(true);
    const abort = new AbortController(); controller.current = abort;
    try {
      const page = await fetchReviews(userId, { cursor: state.cursor, signal: abort.signal });
      if (!abort.signal.aborted) setState((old) => {
        const known = new Set(old.items.map((item) => item.id));
        return { ...old, items: [...old.items, ...page.content.filter((item) => !known.has(item.id))],
          cursor: page.nextCursor, hasNext: page.hasNext, error: "" };
      });
    } catch (error) {
      if (!abort.signal.aborted) setState((old) => ({ ...old, error: error.message }));
    } finally {
      busy.current = false;
      if (!abort.signal.aborted) setMorePending(false);
    }
  }

  return <section className={styles.list} aria-label="받은 후기">
    {state.loading && <p role="status">후기를 불러오고 있어요…</p>}
    {!state.loading && !state.error && !state.items.length && <p>아직 받은 후기가 없어요.</p>}
    {state.error && <p role="alert">{state.error} <button onClick={() => state.items.length ? more() : setRetry((n) => n + 1)}>다시 시도</button></p>}
    {state.items.map((review) => <article className={styles.card} key={review.id}>
      <header><strong>{review.reviewer.nickname}</strong><span>{review.score}점 / 5점</span></header>
      {review.content && <p>{review.content}</p>}
      <time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
    </article>)}
    {state.hasNext && <button className={styles.more} disabled={morePending} onClick={more}>{morePending ? "불러오는 중…" : "후기 더 보기"}</button>}
  </section>;
}
