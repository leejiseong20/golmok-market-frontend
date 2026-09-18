import { useCallback, useEffect, useRef, useState } from "react";
import ProductCard from "./ProductCard.jsx";
import PurchaseCard from "./PurchaseCard.jsx";
import MyRegions from "./MyRegions.jsx";
import ReviewForm from "./ReviewForm.jsx";
import ReviewList from "./ReviewList.jsx";
import Avatar from "./Avatar.jsx";
import ProfileForm from "./ProfileForm.jsx";
import WithdrawForm from "./WithdrawForm.jsx";
import EmptyState from "./EmptyState.jsx";
import { BlockListSkeleton, ProductListSkeleton } from "./Skeleton.jsx";
import { client } from "../api/client.js";
import { toast } from "../toast.js";
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
const emptyList = { tab: null, items: [], cursor: null, hasNext: false, loading: true, loadingMore: false, error: "" };

/**
 * 마이페이지: 내 정보 + 찜한 상품 / 구매내역 / 판매내역 / 받은 후기.
 *
 * 탭은 주소(/my, /my/purchases …)가 정한다. 새로고침·뒤로가기·알림 링크가 같은 탭을 연다.
 * 탭을 바꿀 때마다 서버에서 다시 받는다. 다른 기기에서 찜하거나 거래 상태가 바뀐 것까지 반영된다.
 *
 * 목록에 어느 탭의 데이터인지(list.tab)를 함께 둔다. 뒤로가기로 탭이 바뀌면 effect 가 새 데이터를 받기 전에
 * 한 번 렌더링되는데, 이때 이전 탭 항목을 새 탭의 카드로 그리면 형태가 달라 터진다. 탭이 다르면 비어 있는 것으로 본다.
 */
export default function MyPage({ user, tab, onTabChange, onOpenProduct, onToggleFavorite, onLogin, onLogout, loggingOut, onHome, onRegionsChange, refreshKey = 0 }) {
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [loaded, setList] = useState(emptyList);
  const [retry, setRetry] = useState(0);
  const [actionError, setActionError] = useState("");
  const [saleStatus, setSaleStatus] = useState("");
  const [review, setReview] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const moreController = useRef(null);
  const morePending = useRef(false);
  const list = loaded.tab === tab ? loaded : { ...emptyList, tab };

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
    setList({ ...emptyList, tab, loading: true });
    load({ signal: abort.signal })
      .then((page) => {
        if (!abort.signal.aborted) {
          setList({ ...emptyList, tab, loading: false, items: page.content, cursor: page.nextCursor, hasNext: page.hasNext });
        }
      })
      .catch((error) => { if (!abort.signal.aborted) setList({ ...emptyList, tab, loading: false, error: error.message }); });
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
    return <main className={styles.shell} id="main" tabIndex={-1}>
      <section className={styles.guest}>
        <h1 className={styles.title}>나의 골목</h1>
        <p className={styles.sub}>로그인하면 찜한 상품과 구매내역을 볼 수 있어요.</p>
        <button className={styles.primary} onClick={onLogin}>로그인하기</button>
      </section>
    </main>;
  }

  return <main className={styles.shell} id="main" tabIndex={-1}>
    <section aria-label="내 정보" className={styles.profile}>
      <Avatar url={profile?.profileImageUrl} name={profile?.nickname ?? user.nickname} size={52} />
      <div className={styles.profileBody}>
        <h1 className={styles.title}>{profile?.nickname ?? user.nickname}</h1>
        {profileError
          ? <p className={styles.error} role="alert">{profileError}
              <button className="btn btn-outline btn-sm" onClick={() => setRetry((value) => value + 1)}>다시 시도</button></p>
          : <p className={styles.temp}>매너온도 <strong>{profile ? `${profile.mannerTemp}℃` : "…"}</strong></p>}
      </div>
      {profile && <button className={styles.editProfile} onClick={() => setEditingProfile(true)}>프로필 수정</button>}
    </section>

    {profile && <MyRegions regions={profile.regions} onChange={(regions) => {
      setProfile((old) => ({ ...old, regions }));
      onRegionsChange(regions);
    }} />}

    <div className={styles.tabs} role="tablist" aria-label="마이페이지 메뉴">
      {TABS.map(({ id, label }) => <button key={id} role="tab" aria-selected={tab === id}
        className={styles.tab + (tab === id ? " " + styles.tabOn : "")}
        onClick={() => { if (id !== tab) onTabChange(id); }}>{label}</button>)}
    </div>

    {tab === "reviews" ? <ReviewList key={`${user.id}-${retry}`} userId={user.id} /> : <section aria-label={TABS.find((item) => item.id === tab).label}>
      {tab === "sales" && <label className={styles.filter}>판매 상태 <select aria-label="판매 상태" value={saleStatus} onChange={(e) => {
        moreController.current?.abort(); setSaleStatus(e.target.value); setList({ ...emptyList, tab, loading: true });
      }}><option value="">전체</option><option value="ON_SALE">판매중</option><option value="RESERVED">예약중</option><option value="SOLD">판매완료</option></select></label>}
      {actionError && <div className={styles.error} role="alert">{actionError}</div>}
      {list.loading && (tab === "purchases"
        ? <BlockListSkeleton label="구매내역을 불러오는 중" />
        : <ProductListSkeleton count={3} label="목록을 불러오는 중" />)}
      {list.error && <div className={styles.error} role="alert">{list.error}
        <button className="btn btn-outline btn-sm" onClick={() => (list.items.length ? more() : setRetry((value) => value + 1))}>다시 시도</button></div>}
      {!list.loading && !list.error && list.items.length === 0 && (tab === "favorites"
        ? <EmptyState compact title="아직 찜한 상품이 없어요" description="마음에 드는 물건의 하트를 누르면 여기에 모여요." />
        : tab === "sales"
          ? <EmptyState compact title="조건에 맞는 판매 상품이 없어요" description="판매 상태 필터를 바꾸거나 새 물건을 올려보세요." />
          : <EmptyState compact title="아직 구매한 상품이 없어요" description="채팅으로 거래를 마치면 구매내역에 남아요." />)}

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
    {/*
      계정 동작은 페이지 맨 아래에 둔다. 하단 탭에서 로그아웃을 뺀 뒤로 모바일의 로그아웃 자리이기도 하다.
      탈퇴는 되돌릴 수 없어 실수로 누르지 않게 조용한 글자 링크로 둔다.
    */}
    {profile && <div className={styles.account}>
      <button className="btn btn-outline btn-sm" onClick={onLogout} disabled={loggingOut}>
        {loggingOut ? "처리 중…" : "로그아웃"}</button>
      <button className={styles.withdraw} onClick={() => setWithdrawing(true)}>회원 탈퇴</button>
    </div>}
    {withdrawing && <WithdrawForm onClose={() => setWithdrawing(false)} onWithdrawn={() => {
      // 서버가 refresh token 을 모두 지웠으므로 이 기기의 세션만 지우면 된다. 홈으로 먼저 옮겨 빈 마이페이지를 거치지 않는다.
      onHome();
      client.clearSession();
      toast.show("탈퇴가 완료됐어요. 그동안 이용해 주셔서 고맙습니다.");
    }} />}
    {editingProfile && profile && <ProfileForm profile={profile} onClose={() => setEditingProfile(false)}
      onSaved={(updated) => {
        // 응답이 갱신된 내 정보라 다시 조회하지 않는다. 헤더 닉네임은 저장된 세션에서 읽으므로 세션도 바꾼다.
        setProfile(updated); setEditingProfile(false);
        client.updateUser(user.id, { nickname: updated.nickname });
        toast.success("프로필을 저장했어요.");
      }} />}
    {review && <ReviewForm tradeId={review.tradeId} nickname={review.seller.nickname}
      onClose={() => setReview(null)} onSaved={() => { setReview(null); setRetry((n) => n + 1); }} />}
  </main>;
}
