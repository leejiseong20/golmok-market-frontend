import { useCallback, useEffect, useRef, useState } from "react";
import ProductCard from "./ProductCard.jsx";
import PurchaseCard from "./PurchaseCard.jsx";
import { fetchMe, fetchMyFavorites } from "../api/userApi.js";
import { confirmPurchase, fetchMyPurchases } from "../api/tradeApi.js";
import styles from "./MyPage.module.css";

const TABS = [
  { id: "favorites", label: "찜한 상품" },
  { id: "purchases", label: "구매내역" },
];
const emptyList = { items: [], cursor: null, hasNext: false, loading: true, loadingMore: false, error: "" };

/**
 * 마이페이지: 내 정보 + 찜한 상품 / 구매내역.
 *
 * 탭을 바꿀 때마다 서버에서 다시 받는다. 다른 기기에서 찜하거나 거래 상태가 바뀐 것까지 반영된다.
 * 판매내역 탭은 GET /api/products/me 가 생기면 TABS 에 한 줄 추가하면 된다.
 */
export default function MyPage({ user, onOpenProduct, onToggleFavorite, onLogin }) {
  const [tab, setTab] = useState("favorites");
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [list, setList] = useState(emptyList);
  const [retry, setRetry] = useState(0);
  const [actionError, setActionError] = useState("");
  const moreController = useRef(null);
  const morePending = useRef(false);

  const load = useCallback((options) => tab === "favorites" ? fetchMyFavorites(options) : fetchMyPurchases(options), [tab]);
  const keyOf = (item) => tab === "favorites" ? item.id : item.tradeId;

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
    setActionError("");
    setList({ ...emptyList, loading: true });
    load({ signal: abort.signal })
      .then((page) => {
        if (!abort.signal.aborted) {
          setList({ ...emptyList, loading: false, items: page.content, cursor: page.nextCursor, hasNext: page.hasNext });
        }
      })
      .catch((error) => { if (!abort.signal.aborted) setList({ ...emptyList, loading: false, error: error.message }); });
    return () => { abort.abort(); moreController.current?.abort(); };
  }, [user?.id, retry, load]);

  async function more() {
    if (morePending.current || list.loading || !list.hasNext) return;
    morePending.current = true;
    const abort = new AbortController();
    moreController.current = abort;
    setList((old) => ({ ...old, loadingMore: true, error: "" }));
    try {
      const page = await load({ cursor: list.cursor, signal: abort.signal });
      if (!abort.signal.aborted) {
        setList((old) => {
          const known = new Set(old.items.map(keyOf));
          return { ...old, items: [...old.items, ...page.content.filter((item) => !known.has(keyOf(item)))],
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

  /** 확정한 거래는 목록에서 빼지 않는다. 구매내역은 기록이라 상태만 바뀐다. */
  async function confirm(purchase) {
    setActionError("");
    try {
      const updated = await confirmPurchase(purchase.tradeId);
      setList((old) => ({ ...old, items: old.items.map((item) => item.tradeId === updated.tradeId ? updated : item) }));
    } catch (error) {
      setActionError(error.message);
    }
  }

  if (!user) {
    return <main className={styles.shell}>
      <section className={styles.guest}>
        <h1 className={styles.title}>나의 골목</h1>
        <p className={styles.sub}>로그인하면 찜한 상품과 구매내역을 볼 수 있어요.</p>
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

    <div className={styles.tabs} role="tablist" aria-label="마이페이지 메뉴">
      {TABS.map(({ id, label }) => <button key={id} role="tab" aria-selected={tab === id}
        className={styles.tab + (tab === id ? " " + styles.tabOn : "")}
        // 목록도 같이 비운다. 비우지 않으면 effect 가 새 데이터를 받기 전에
        // 이전 탭의 항목이 새 탭의 카드로 한 번 렌더링돼 형태가 달라 터진다.
        onClick={() => { setTab(id); setList({ ...emptyList, loading: true }); }}>{label}</button>)}
    </div>

    <section aria-label={TABS.find((item) => item.id === tab).label}>
      {actionError && <div className={styles.error} role="alert">{actionError}</div>}
      {list.loading && <p className={styles.empty} role="status">불러오고 있어요…</p>}
      {list.error && <div className={styles.error} role="alert">{list.error}
        <button onClick={() => (list.items.length ? more() : setRetry((value) => value + 1))}>다시 시도</button></div>}
      {!list.loading && !list.error && list.items.length === 0 && <p className={styles.empty} role="status">
        {tab === "favorites"
          ? "아직 찜한 상품이 없어요. 마음에 드는 물건의 하트를 눌러보세요."
          : "아직 구매한 상품이 없어요."}</p>}

      {tab === "favorites"
        ? <div className={styles.feed}>
            {list.items.map((product) => <ProductCard key={product.id} product={product}
              onOpen={() => onOpenProduct(product.id)} onToggleFavorite={toggle} />)}
          </div>
        : <div className={styles.purchases}>
            {list.items.map((purchase) => <PurchaseCard key={purchase.tradeId} purchase={purchase}
              onOpenProduct={onOpenProduct} onConfirm={confirm} />)}
          </div>}

      {list.hasNext && <button className={styles.more} onClick={more} disabled={list.loadingMore}>
        {list.loadingMore ? "불러오는 중…" : "더 보기"}</button>}
    </section>
  </main>;
}
