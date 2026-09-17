import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Header from "./components/Header.jsx";
import CategoryBar from "./components/CategoryBar.jsx";
import ProductCard from "./components/ProductCard.jsx";
import Sidebar from "./components/Sidebar.jsx";
import BottomNav from "./components/BottomNav.jsx";
import AuthModal from "./components/AuthModal.jsx";
import RegionPicker from "./components/RegionPicker.jsx";
import ProductDetail from "./components/ProductDetail.jsx";
import ProductForm from "./components/ProductForm.jsx";
import MyPage from "./components/MyPage.jsx";
import ChatPage from "./components/ChatPage.jsx";
import UserProfile from "./components/UserProfile.jsx";
import NotificationPanel from "./components/NotificationPanel.jsx";
import { client } from "./api/client.js";
import { chatSocket } from "./api/chatSocket.js";
import { openChatRoom } from "./api/chatApi.js";
import { fetchUnreadCount, resolveTarget } from "./api/notificationApi.js";
import { logout } from "./api/authApi.js";
import { addFavorite, fetchCategories, fetchProduct, fetchProducts, removeFavorite } from "./api/productApi.js";
import styles from "./App.module.css";

function savedRegion() {
  try {
    const region = JSON.parse(localStorage.getItem("golmok.region"));
    return Number.isSafeInteger(region?.id) && region.id > 0 && typeof region.dong === "string" ? region : null;
  } catch { return null; }
}
const emptyFeed = { items: [], cursor: null, hasNext: false, loading: false, loadingMore: false, error: "" };

export default function App() {
  const session = useSyncExternalStore(client.subscribe, client.getSession);
  const user = session?.user;
  const [region, setRegion] = useState(savedRegion);
  const [categories, setCategories] = useState([]);
  const [categoryError, setCategoryError] = useState("");
  const [categoryRetry, setCategoryRetry] = useState(0);
  const [categoryId, setCategoryId] = useState(null);
  const [sort, setSort] = useState("LATEST");
  const [search, setSearch] = useState("");
  const [keyword, setKeyword] = useState("");
  const [retry, setRetry] = useState(0);
  const [feed, setFeed] = useState(emptyFeed);
  const [modal, setModal] = useState(null);
  const [view, setView] = useState("home");
  const [chatRoomId, setChatRoomId] = useState(null);
  const [chatEntry, setChatEntry] = useState(0);
  const [myTab, setMyTab] = useState("favorites");
  const [myEntry, setMyEntry] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [detail, setDetail] = useState(null);
  const [editor, setEditor] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [productRevision, setProductRevision] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [accountError, setAccountError] = useState("");
  const feedVersion = useRef(0);
  const moreController = useRef(null);
  const morePending = useRef(false);
  const detailController = useRef(null);
  const logoutPending = useRef(false);
  const lastUserId = useRef(null);

  useEffect(() => {
    const abort = new AbortController();
    setCategoryError("");
    fetchCategories(abort.signal).then((rows) => { if (!abort.signal.aborted) setCategories(rows); })
      .catch((error) => { if (!abort.signal.aborted) setCategoryError(error.message); });
    return () => abort.abort();
  }, [categoryRetry, user?.id]);

  useEffect(() => {
    const version = ++feedVersion.current;
    const abort = new AbortController();
    moreController.current?.abort(); morePending.current = false;
    setFeed({ ...emptyFeed, loading: !!region });
    if (region) fetchProducts({ regionId: region.id, categoryId, sort, keyword, signal: abort.signal })
      .then((page) => {
        if (!abort.signal.aborted && version === feedVersion.current)
          setFeed({ ...emptyFeed, items: page.content, cursor: page.nextCursor, hasNext: page.hasNext });
      }).catch((error) => {
        if (!abort.signal.aborted && version === feedVersion.current) setFeed({ ...emptyFeed, error: error.message });
      });
    return () => { abort.abort(); moreController.current?.abort(); };
  }, [region?.id, categoryId, sort, keyword, retry, user?.id]);

  // 로그인한 동안만 채팅 실시간 연결을 유지한다. 사용자가 바뀌면 이전 연결을 끊고 새 토큰으로 다시 연결한다.
  useEffect(() => {
    if (!user) return undefined;
    chatSocket.start();
    return () => chatSocket.stop();
  }, [user?.id]);

  // 알림 뱃지. 로그인 시·소켓 (재)연결 시 서버 값으로 맞추고, 그 사이에는 실시간 알림 이벤트로 1씩 올린다.
  // 끊긴 동안 온 알림은 이벤트로 다시 오지 않으므로 재연결 때 다시 센다.
  useEffect(() => {
    setUnreadCount(0);
    if (!user) return undefined;
    let abort = new AbortController();
    const load = () => {
      abort.abort(); abort = new AbortController();
      const signal = abort.signal;
      fetchUnreadCount(signal).then((data) => { if (!signal.aborted) setUnreadCount(data.count); })
        .catch(() => { /* 뱃지는 부가 정보다. 다음 연결·알림 때 다시 맞춘다. */ });
    };
    load();
    const offConnected = chatSocket.onConnected(load);
    const offEvent = chatSocket.onEvent((event) => {
      if (event.type === "NOTIFICATION") setUnreadCount((value) => value + 1);
    });
    return () => { abort.abort(); offConnected(); offEvent(); };
  }, [user?.id]);

  useEffect(() => {
    detailController.current?.abort(); setDetail(null); setEditor(null); setProfileId(null);
    return () => detailController.current?.abort();
  }, [user?.id]);

  // 로그인하는 순간에만 대표 동네를 홈에 적용한다. 매 렌더마다 적용하면
  // 로그인한 사용자가 홈에서 다른 동네를 골라볼 수 없다.
  useEffect(() => {
    if (user && lastUserId.current !== user.id && user.primaryRegion) {
      selectRegion({ id: user.primaryRegion.id, dong: user.primaryRegion.name });
    }
    lastUserId.current = user?.id ?? null;
  }, [user?.id]);

  async function more() {
    if (morePending.current || feed.loading || !feed.hasNext) return;
    morePending.current = true;
    const version = feedVersion.current;
    const abort = new AbortController(); moreController.current = abort;
    setFeed((old) => ({ ...old, loadingMore: true, error: "" }));
    try {
      const page = await fetchProducts({ regionId: region.id, categoryId, sort, keyword, cursor: feed.cursor, signal: abort.signal });
      if (!abort.signal.aborted && version === feedVersion.current) setFeed((old) => {
        const known = new Set(old.items.map((item) => item.id));
        return { ...old, items: [...old.items, ...page.content.filter((item) => !known.has(item.id))],
          cursor: page.nextCursor, hasNext: page.hasNext, loadingMore: false };
      });
    } catch (error) {
      if (!abort.signal.aborted && version === feedVersion.current) setFeed((old) => ({ ...old, error: error.message, loadingMore: false }));
    } finally { if (version === feedVersion.current) morePending.current = false; }
  }

  async function openProduct(id) {
    detailController.current?.abort();
    const abort = new AbortController(); detailController.current = abort;
    setDetail({ id, loading: true, data: null, error: "" });
    // 상세 GET은 조회수를 올리므로 StrictMode의 effect 재실행 대신 사용자 동작에서 한 번 호출한다.
    try {
      const product = await fetchProduct(id, abort.signal);
      if (!abort.signal.aborted) setDetail({ id, loading: false, data: product, error: "" });
    } catch (error) {
      if (!abort.signal.aborted) setDetail({ id, loading: false, data: null, error: error.message });
    }
  }

  /**
   * 찜 토글. 서버가 돌려준 { isLiked, favoriteCount } 로 화면을 맞춘다.
   * 낙관적 갱신을 하지 않는 이유: 하트와 찜 수가 어긋난 채 남는 것보다,
   * 잠깐 늦더라도 서버 값만 반영하는 편이 헷갈리지 않는다.
   *
   * @returns 성공하면 { isLiked, favoriteCount }, 실패·비로그인이면 null
   */
  async function toggleFavorite(product) {
    if (!user) { setAccountError(""); setModal("auth"); return null; }
    try {
      const result = product.isLiked ? await removeFavorite(product.id) : await addFavorite(product.id);
      const apply = (item) => item.id === product.id
        ? { ...item, isLiked: result.isLiked, favoriteCount: result.favoriteCount } : item;
      setFeed((old) => ({ ...old, items: old.items.map(apply) }));
      setDetail((old) => old?.data?.id === product.id
        ? { ...old, data: { ...old.data, isLiked: result.isLiked, favoriteCount: result.favoriteCount } } : old);
      return result;
    } catch (error) {
      setAccountError(error.message);
      return null;
    }
  }

  /**
   * 동네 인증 결과를 홈 목록에 반영한다.
   * 대표 동네를 인증해 두고도 홈에서 다시 고르게 하면 인증한 의미가 없다.
   */
  function applyPrimaryRegion(regions) {
    const primary = regions.find((region) => region.isPrimary);
    if (primary) selectRegion({ id: primary.id, dong: primary.name });
  }

  function selectRegion(value) {
    setRegion(value); setModal(null);
    try { localStorage.setItem("golmok.region", JSON.stringify(value)); } catch { /* 메모리에서 선택 유지 */ }
  }
  function home() {
    setEditor(null);
    detailController.current?.abort(); setDetail(null); setModal(null); setView("home");
    setKeyword(""); setSearch(""); setCategoryId(null); setSort("LATEST"); setRetry((value) => value + 1);
  }
  /** 마이페이지로. tab 을 주면 그 탭으로 연다(알림에서 받은 후기로 이동할 때). */
  function myPage(tab = "favorites") {
    setEditor(null);
    detailController.current?.abort(); setDetail(null); setModal(null); setAccountError("");
    setMyTab(typeof tab === "string" ? tab : "favorites"); setMyEntry((value) => value + 1); setView("my");
  }
  /** 채팅 화면으로. roomId 가 있으면 그 방을 연다. 같은 방을 다시 눌러도 화면을 새로 그리도록 진입 번호를 올린다. */
  function chat(roomId = null) {
    setEditor(null);
    detailController.current?.abort(); setDetail(null); setModal(null); setAccountError("");
    setChatRoomId(roomId); setChatEntry((value) => value + 1); setView("chat");
  }

  /**
   * 상품 상세의 채팅하기. 서버가 기존 방이 있으면 그 방을 돌려주므로 여기서 중복을 판단하지 않는다.
   * 실패 메시지는 상세 화면이 보여준다.
   */
  async function startChat(product) {
    if (!user) { setAccountError(""); setModal("auth"); return; }
    const room = await openChatRoom(product.id);
    chat(room.roomId);
  }
  /** 알림의 이동 경로를 화면으로 연다. 모르는 경로면 알림함만 닫는다. */
  function openNotificationTarget(targetUrl) {
    const target = resolveTarget(targetUrl);
    setModal(null);
    if (target?.kind === "product") openProduct(target.id);
    else if (target?.kind === "chat") chat(target.id);
    else if (target?.kind === "myReviews") myPage("reviews");
  }
  async function signOut() {
    if (logoutPending.current) return;
    logoutPending.current = true; setLoggingOut(true); setAccountError("");
    try { await logout(); } catch (error) { setAccountError(error.message); }
    finally { logoutPending.current = false; setLoggingOut(false); }
  }
  const navigation = { user, onHome: home, onRegionClick: () => setModal("region"), onMyPage: () => myPage(), onChat: () => chat(), view,
    onLogin: () => { setAccountError(""); setModal("auth"); }, onLogout: signOut, loggingOut };
  const categoryBar = <CategoryBar categories={categories} value={categoryId} onChange={setCategoryId} />;

  function productChanged(product) {
    setProductRevision((value) => value + 1);
    setRetry((value) => value + 1);
    setDetail({ id: product.id, data: product, loading: false, error: "" });
  }
  function writeProduct() {
    if (!user) { setModal("auth"); return; }
    detailController.current?.abort(); setDetail(null); setEditor({ product: null });
  }

  return <>
    <Header {...navigation} region={region} search={search} onSearchChange={setSearch}
      unreadCount={unreadCount} onNotifications={() => { setAccountError(""); setModal("notifications"); }}
      onSearch={(event) => { event.preventDefault(); setKeyword(search.trim()); setRetry((value) => value + 1); }}>
      {categoryBar}
    </Header>
    {view === "home" && <div className={styles.mobileOnly}>{categoryBar}</div>}
    {view === "chat"
      ? <ChatPage key={`${user?.id ?? "guest"}-${chatEntry}`} user={user} initialRoomId={chatRoomId}
          onOpenProduct={openProduct} onOpenProfile={setProfileId} onLogin={() => { setAccountError(""); setModal("auth"); }} />
      : view === "my"
      ? <MyPage key={`${user?.id ?? "guest"}-${myEntry}`} user={user} initialTab={myTab} refreshKey={productRevision} onOpenProduct={openProduct} onToggleFavorite={toggleFavorite} onRegionsChange={applyPrimaryRegion}
          onLogin={() => { setAccountError(""); setModal("auth"); }} />
      : <main className={styles.shell}>
      <section aria-label="상품 목록">
        {accountError && <p className={styles.error} role="alert">{accountError}</p>}
        {categoryError && <div className={styles.error} role="alert">{categoryError}<button onClick={() => setCategoryRetry((value) => value + 1)}>카테고리 다시 시도</button></div>}
        <div className={styles.feedHead}>
          <div>
            <h1 className={styles.title}>{region ? region.dong + "의 이웃 물건" : "우리 동네에서 발견하는 좋은 물건"}</h1>
            <p className={styles.sub}>{keyword ? keyword + " 검색 · " : ""}{region ? "불러온 상품 " + feed.items.length + "개" : "먼저 둘러볼 동네를 선택해 주세요."}</p>
          </div>
          <label className={styles.sortLabel}>정렬<select className={styles.sortBtn} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="상품 정렬">
            <option value="LATEST">최신순</option><option value="PRICE_ASC">낮은 가격순</option>
          </select></label>
        </div>
        {!region && <div className={styles.empty}><p>가까운 이웃의 물건을 찾아보세요.</p><button onClick={() => setModal("region")}>동네 선택하기</button></div>}
        {feed.loading && <p className={styles.empty} role="status">상품을 불러오고 있어요…</p>}
        {feed.error && <div className={styles.error} role="alert">{feed.error}<button onClick={() => feed.items.length ? more() : setRetry((value) => value + 1)}>다시 시도</button></div>}
        {region && !feed.loading && !feed.error && feed.items.length === 0 && <p className={styles.empty} role="status">아직 조건에 맞는 상품이 없어요. 다른 동네나 검색어로 찾아보세요.</p>}
        <div className={styles.feed}>{feed.items.map((product) => <ProductCard key={product.id} product={product}
          onOpen={() => openProduct(product.id)} onToggleFavorite={toggleFavorite} />)}</div>
        {feed.hasNext && <button className={styles.more} onClick={more} disabled={feed.loadingMore}>{feed.loadingMore ? "불러오는 중…" : "더 보기"}</button>}
      </section>
      <Sidebar onRegionClick={navigation.onRegionClick} />
    </main>}
    <BottomNav {...navigation} />
    {/* 채팅 화면에서는 떠 있는 등록 버튼이 입력창의 전송 버튼을 가린다. */}
    {view !== "chat" && <button className={styles.writeButton} onClick={writeProduct}>＋ 상품 등록</button>}
    <footer className={styles.footer + " " + styles.pcOnly}><div className={styles.footerInner}><span>골목마켓 · 동네 기반 중고거래 플랫폼</span><span>이웃의 물건에 새로운 일상을</span></div></footer>
    {modal === "auth" && <AuthModal onClose={() => setModal(null)} />}
    {modal === "region" && <RegionPicker onClose={() => setModal(null)} onSelect={selectRegion} />}
    {modal === "notifications" && user && <NotificationPanel onClose={() => setModal(null)} onNavigate={openNotificationTarget}
      onRead={() => setUnreadCount((value) => Math.max(0, value - 1))} onAllRead={() => setUnreadCount(0)} />}
    {detail && <ProductDetail key={detail.id} detail={detail} onClose={() => { detailController.current?.abort(); setDetail(null); }} onRetry={() => openProduct(detail.id)}
      onEdit={(product) => { setDetail(null); setEditor({ product }); }} onChanged={productChanged} onStartChat={startChat} onOpenProfile={setProfileId}
      onDeleted={() => { setDetail(null); setProductRevision((v) => v + 1); setRetry((v) => v + 1); }} />}
    {editor && <ProductForm key={editor.product?.id ?? "new"} product={editor.product} categories={categories}
      onClose={() => setEditor(null)} onVerifyRegion={myPage} onSaved={(product) => { setEditor(null); productChanged(product); }} />}
    {profileId && <UserProfile key={profileId} userId={profileId} onClose={() => setProfileId(null)} />}
  </>;
}
