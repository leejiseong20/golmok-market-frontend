import { useEffect, useRef, useState } from "react";
import ProductCard from "./ProductCard.jsx";
import { fetchMe, fetchMyFavorites } from "../api/userApi.js";
import styles from "./MyPage.module.css";

const emptyList = { items: [], cursor: null, hasNext: false, loading: true, loadingMore: false, error: "" };

/**
 * 마이페이지: 내 정보 + 내가 찜한 상품.
 *
 * 홈 피드와 목록 상태를 공유하지 않는다. 진입할 때마다 서버에서 다시 받아
 * 다른 기기에서 찜한 것까지 반영되게 한다.
 */
export default function MyPage({ user, onOpenProduct, onToggleFavorite, onLogin }) {
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [list, setList] = useState(emptyList);
  const [retry, setRetry] = useState(0);
  const moreController = useRef(null);
  const morePending = useRef(false);

  useEffect(() => {
    if (!user) return undefined;
    const abort = new AbortController();
    setProfileError("");
    fetchMe(abort.signal)
      .then((data) => { if (!abort.signal.aborted) setProfile(data); })
      .catch((error) => { if (!abort.signal.aborted) setProfileError(error.message); });
    return () => abort.abort();
  }, [user?.id, retry]);

  useEffect(() => {
    if (!user) return undefined;
    const abort = new AbortController();
    moreController.current?.abort();
    morePending.current = false;
    setList({ ...emptyList, loading: true });
    fetchMyFavorites({ signal: abort.signal })
      .then((page) => {
        if (!abort.signal.aborted) {
          setList({ ...emptyList, loading: false, items: page.content, cursor: page.nextCursor, hasNext: page.hasNext });
        }
      })
      .catch((error) => { if (!abort.signal.aborted) setList({ ...emptyList, loading: false, error: error.message }); });
    return () => { abort.abort(); moreController.current?.abort(); };
  }, [user?.id, retry]);

  async function more() {
    if (morePending.current || list.loading || !list.hasNext) return;
    morePending.current = true;
    const abort = new AbortController();
    moreController.current = abort;
    setList((old) => ({ ...old, loadingMore: true, error: "" }));
    try {
      const page = await fetchMyFavorites({ cursor: list.cursor, signal: abort.signal });
      if (!abort.signal.aborted) {
        setList((old) => {
          const known = new Set(old.items.map((item) => item.id));
          return { ...old, items: [...old.items, ...page.content.filter((item) => !known.has(item.id))],
            cursor: page.nextCursor, hasNext: page.hasNext, loadingMore: false };
        });
      }
    } catch (error) {
      if (!abort.signal.aborted) setList((old) => ({ ...old, error: error.message, loadingMore: false }));
    } finally {
      morePending.current = false;
    }
  }

  // 찜을 해제하면 이 목록에서는 사라지는 게 맞다. 찜 목록이기 때문이다.
  async function toggle(product) {
    const result = await onToggleFavorite(product);
    if (!result) return;
    setList((old) => ({ ...old, items: result.isLiked ? old.items : old.items.filter((item) => item.id !== product.id) }));
  }

  if (!user) {
    return <main className={styles.shell}>
      <section className={styles.guest}>
        <h1 className={styles.title}>나의 골목</h1>
        <p className={styles.sub}>로그인하면 찜한 상품을 모아서 볼 수 있어요.</p>
        <button className={styles.primary} onClick={onLogin}>로그인하기</button>
      </section>
    </main>;
  }

  return <main className={styles.shell}>
    <section aria-label="내 정보" className={styles.profile}>
      <div className={styles.avatar} aria-hidden="true">{(profile?.nickname ?? user.nickname).slice(0, 1)}</div>
      <div>
        <h1 className={styles.title}>{profile?.nickname ?? user.nickname}</h1>
        {profileError
          ? <p className={styles.error} role="alert">{profileError}
              <button onClick={() => setRetry((value) => value + 1)}>다시 시도</button></p>
          : <p className={styles.temp}>매너온도 <strong>{profile ? `${profile.mannerTemp}℃` : "…"}</strong></p>}
      </div>
    </section>

    <section aria-label="찜한 상품">
      <div className={styles.listHead}>
        <h2 className={styles.h2}>찜한 상품</h2>
        <span className={styles.count}>{list.items.length}개</span>
      </div>
      {list.loading && <p className={styles.empty} role="status">찜한 상품을 불러오고 있어요…</p>}
      {list.error && <div className={styles.error} role="alert">{list.error}
        <button onClick={() => (list.items.length ? more() : setRetry((value) => value + 1))}>다시 시도</button></div>}
      {!list.loading && !list.error && list.items.length === 0 &&
        <p className={styles.empty} role="status">아직 찜한 상품이 없어요. 마음에 드는 물건의 하트를 눌러보세요.</p>}
      <div className={styles.feed}>
        {list.items.map((product) => <ProductCard key={product.id} product={product}
          onOpen={() => onOpenProduct(product.id)} onToggleFavorite={toggle} />)}
      </div>
      {list.hasNext && <button className={styles.more} onClick={more} disabled={list.loadingMore}>
        {list.loadingMore ? "불러오는 중…" : "더 보기"}</button>}
    </section>
  </main>;
}
