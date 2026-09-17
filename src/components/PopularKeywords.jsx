import { useEffect, useState } from "react";
import { fetchPopularKeywords } from "../api/searchApi.js";
import styles from "./PopularKeywords.module.css";

/**
 * 인기 검색어. PC 안내 패널에는 순위 목록(list), 모바일 홈에는 가로 칩(chips)으로 보여준다.
 *
 * 부가 정보라 모바일 칩은 불러오지 못했거나 비었으면 자리를 차지하지 않게 숨긴다.
 * PC 패널은 제목이 있는 자리라 로딩·에러(다시 시도)·빈 상태를 모두 보여준다.
 */
export default function PopularKeywords({ variant = "list", onSelect }) {
  const [state, setState] = useState({ items: [], loading: true, error: "" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    setState((old) => ({ ...old, loading: true, error: "" }));
    fetchPopularKeywords(abort.signal)
      .then((items) => { if (!abort.signal.aborted) setState({ items, loading: false, error: "" }); })
      .catch((error) => { if (!abort.signal.aborted) setState({ items: [], loading: false, error: error.message }); });
    return () => abort.abort();
  }, [retry]);

  if (variant === "chips") {
    if (state.loading || state.error || state.items.length === 0) return null;
    return <nav className={styles.chips} aria-label="인기 검색어">
      {state.items.map((item) => <button key={item.keyword} className={styles.chip} onClick={() => onSelect(item.keyword)}>
        <span className={styles.rank}>{item.rank}</span>{item.keyword}</button>)}
    </nav>;
  }

  return <section aria-label="인기 검색어">
    <h2 className={styles.h2}>지금 인기 검색어</h2>
    {state.loading && <p className={styles.note} role="status">불러오고 있어요…</p>}
    {state.error && <p className={styles.note} role="alert">인기 검색어를 불러오지 못했어요.
      <button className={styles.retry} onClick={() => setRetry((value) => value + 1)}>다시 시도</button></p>}
    {!state.loading && !state.error && state.items.length === 0 && <p className={styles.note}>아직 모인 검색어가 없어요.</p>}
    {state.items.length > 0 && <ol className={styles.list}>
      {state.items.map((item) => <li key={item.keyword}>
        <button className={styles.row} onClick={() => onSelect(item.keyword)}>
          <span className={styles.rank}>{item.rank}</span>
          <span className={styles.word}>{item.keyword}</span>
        </button>
      </li>)}
    </ol>}
  </section>;
}
