import { useCallback, useEffect, useRef, useState } from "react";
import ProductCard from "./ProductCard.jsx";
import PurchaseCard from "./PurchaseCard.jsx";
import MyRegions from "./MyRegions.jsx";
import ReviewForm from "./ReviewForm.jsx";
import ReviewList from "./ReviewList.jsx";
import { fetchMe, fetchMyFavorites } from "../api/userApi.js";
import { confirmPurchase, fetchMyPurchases } from "../api/tradeApi.js";
import { fetchMyProducts } from "../api/productApi.js";
import styles from "./MyPage.module.css";

const TABS = [
  { id: "favorites", label: "찜한 상품" },
  { id: "purchases", label: "구매내역" },
  { id: "sales", label: "판매내역" },
  { id: "reviews", label: "받은 후기" },
];
const emptyList = { items: [], cursor: null, hasNext: false, loading: true, loadingMore: false, error: "" };

/**
 * 마이페이지: 내 정보 + 찜한 상품 / 구매내역.
 *
 * 탭을 바꿀 때마다 서버에서 다시 받는다. 다른 기기에서 찜하거나 거래 상태가 바뀐 것까지 반영된다.
 * 판매내역은 상품 카드와 생성 시각 커서를 사용한다. 탭 변경 시 이전 목록을 즉시 비운다.
 */
export default function MyPage({ user, onOpenProduct, onToggleFavorite, onLogin, onRegionsChange, refreshKey = 0 }) {
  const [tab, setTab] = useState("favorites");
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [list, setList] = useState(emptyList);
  const [retry, setRetry] = useState(0);
  const [actionError, setActionError] = useState("");
  const [saleStatus, setSaleStatus] = useState("");
  const [review, setReview] = useState(null);
  const moreController = useRef(null);
  const morePending = useRef(false);

  const load = useCallback((options) => {
    if (tab === "favorites") return fetchMyFavorites(options);
    if (tab === "sales") return fetchMyProducts({ ...options, status: saleStatus });
    return fetchMyPurchases(options);
  }, [tab, saleStatus]);
  const keyOf = (item) => tab === "purchases" ? item.tradeId : item.id;

  useEffect(() => {
    if (!user) return undefined;
    const abort = new AbortController();
    setProfileError("");
    fetchMe(abort.signal)
      .then((data) => { if (!abort.signal.aborted) setProfile(data); })
      .catch((error) => { if (!abort.signal.aborted) setProfileError(error.message); });
    return () => abort.abort();
  }, [user?.id, retry, refreshKey]);

  useEffect(() => {
    if (!user) return undefined;
    const abort = new AbortController();
    moreController.current?.abort();
    morePending.current = false;
    if (tab === "reviews") return () => abort.abort();
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
  }, [user?.id, retry, load, refreshKey]);

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
      if (moreController.current === abort) morePending.current = false;
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

    {profile && <MyRegions regions={profile.regions} onChange={(regions) => {
      setProfile((old) => ({ ...old, regions }));
      onRegionsChange(regions);
    }} />}

    <div className={styles.tabs} role="tablist" aria-label="마이페이지 메뉴">
      {TABS.map(({ id, label }) => <button key={id} role="tab" aria-selected={tab === id}
        className={styles.tab + (tab === id ? " " + styles.tabOn : "")}
        // 목록도 같이 비운다. 비우지 않으면 effect 가 새 데이터를 받기 전에
        // 이전 탭의 항목이 새 탭의 카드로 한 번 렌더링돼 형태가 달라 터진다.
        onClick={() => { setTab(id); setList({ ...emptyList, loading: true }); }}>{label}</button>)}
    </div>

    {tab === "reviews" ? <ReviewList key={`${user.id}-${retry}`} userId={user.id} /> : <section aria-label={TABS.find((item) => item.id === tab).label}>
      {tab === "sales" && <label className={styles.filter}>판매 상태 <select aria-label="판매 상태" value={saleStatus} onChange={(e) => {
        moreController.current?.abort(); setSaleStatus(e.target.value); setList({ ...emptyList, loading: true });
      }}><option value="">전체</option><option value="ON_SALE">판매중</option><option value="RESERVED">예약중</option><option value="SOLD">판매완료</option></select></label>}
      {actionError && <div className={styles.error} role="alert">{actionError}</div>}
      {list.loading && <p className={styles.empty} role="status">불러오고 있어요…</p>}
      {list.error && <div className={styles.error} role="alert">{list.error}
        <button onClick={() => (list.items.length ? more() : setRetry((value) => value + 1))}>다시 시도</button></div>}
      {!list.loading && !list.error && list.items.length === 0 && <p className={styles.empty} role="status">
        {tab === "favorites"
          ? "아직 찜한 상품이 없어요. 마음에 드는 물건의 하트를 눌러보세요."
          : tab === "sales" ? "조건에 맞는 판매 상품이 없어요." : "아직 구매한 상품이 없어요."}</p>}

      {tab !== "purchases"
        ? <div className={styles.feed}>
            {list.items.map((product) => <ProductCard key={product.id} product={product}
              onOpen={() => onOpenProduct(product.id)} onToggleFavorite={tab === "favorites" ? toggle : undefined} />)}
          </div>
        : <div className={styles.purchases}>
            {list.items.map((purchase) => <PurchaseCard key={purchase.tradeId} purchase={purchase}
              onOpenProduct={onOpenProduct} onConfirm={confirm} onReview={setReview} />)}
          </div>}

      {list.hasNext && <button className={styles.more} onClick={more} disabled={list.loadingMore}>
        {list.loadingMore ? "불러오는 중…" : "더 보기"}</button>}
    </section>}
    {review && <ReviewForm tradeId={review.tradeId} nickname={review.seller.nickname}
      onClose={() => setReview(null)} onSaved={() => { setReview(null); setRetry((n) => n + 1); }} />}
  </main>;
}
