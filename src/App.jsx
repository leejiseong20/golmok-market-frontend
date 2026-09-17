import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { matchPath, Route, Routes, useLocation, useNavigate, useParams } from "react-router";
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
import NotFound from "./components/NotFound.jsx";
import PopularKeywords from "./components/PopularKeywords.jsx";
import { client } from "./api/client.js";
import { chatSocket } from "./api/chatSocket.js";
import { fetchChatUnreadCount, openChatRoom } from "./api/chatApi.js";
import { fetchUnreadCount } from "./api/notificationApi.js";
import { logout } from "./api/authApi.js";
import { addFavorite, fetchCategories, fetchProduct, fetchProducts, removeFavorite } from "./api/productApi.js";
import { homeSearch, isAppPath, MY_TABS, parseHomeQuery, parseId, paths } from "./routes.js";
import styles from "./App.module.css";

function savedRegion() {
  try {
    const region = JSON.parse(localStorage.getItem("golmok.region"));
    return Number.isSafeInteger(region?.id) && region.id > 0 && typeof region.dong === "string" ? region : null;
  } catch { return null; }
}
const emptyFeed = { items: [], cursor: null, hasNext: false, loading: false, loadingMore: false, error: "" };
/** 상세 응답을 기억해 둘 기록 수. 뒤로가기로 돌아온 상세를 다시 요청(조회수 증가)하지 않기 위한 것이라 많을 필요가 없다. */
const DETAIL_CACHE_SIZE = 30;

/** 경로의 id 가 올바를 때만 화면을 그린다. /products/abc 같은 주소는 없는 페이지다. */
function RequireId({ name, onHome, children }) {
  const params = useParams();
  return parseId(params[name]) ? children : <NotFound onHome={onHome} />;
}

function ChatScreen(props) {
  const { roomId } = useParams();
  if (roomId !== undefined && !parseId(roomId)) return <NotFound onHome={props.onHome} />;
  return <ChatPage key={props.user?.id ?? "guest"} {...props} roomId={parseId(roomId)} />;
}

function MyScreen(props) {
  const { tab = "favorites" } = useParams();
  if (!MY_TABS.includes(tab)) return <NotFound onHome={props.onHome} />;
  return <MyPage key={props.user?.id ?? "guest"} {...props} tab={tab} />;
}

/**
 * 화면 조립.
 *
 * 주소가 화면을 정한다(routes.js). 새로고침·뒤로가기·링크 공유·알림 이동이 모두 같은 규칙을 따른다.
 *
 * 상품 상세·이웃 프로필은 "보던 화면 위의 모달"이다. 열 때 보던 화면의 location 을 state.background 로 넘기고,
 * 페이지는 background 로, 모달은 실제 주소로 그린다. 그래서 모달을 열고 닫아도 아래 화면(목록·스크롤)이 유지된다.
 * 주소로 바로 들어와 background 가 없으면 홈 위에 띄운다.
 *
 * 로그인·동네 선택·알림함·상품 등록/수정 창은 주소에 넣지 않는다. 공유할 대상이 아니고,
 * 작성 중 뒤로가기로 입력이 날아가면 안 되기 때문이다.
 */
export default function App() {
  const session = useSyncExternalStore(client.subscribe, client.getSession);
  const user = session?.user;
  const location = useLocation();
  const navigate = useNavigate();
  const pageLocation = location.state?.background ?? location;
  const { keyword, categoryId, sort } = parseHomeQuery(pageLocation.search);
  const productMatch = matchPath("/products/:id", location.pathname);
  const userMatch = matchPath("/users/:id", location.pathname);
  const productId = parseId(productMatch?.params.id);
  const profileId = parseId(userMatch?.params.id);
  const view = pageLocation.pathname.startsWith("/chat") ? "chat" : pageLocation.pathname.startsWith("/my") ? "my" : "home";

  const [region, setRegion] = useState(savedRegion);
  const [categories, setCategories] = useState([]);
  const [categoryError, setCategoryError] = useState("");
  const [categoryRetry, setCategoryRetry] = useState(0);
  const [search, setSearch] = useState(keyword);
  const [retry, setRetry] = useState(0);
  const [feed, setFeed] = useState(emptyFeed);
  const [modal, setModal] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [detail, setDetail] = useState(null);
  const [detailRetry, setDetailRetry] = useState(0);
  const [editor, setEditor] = useState(null);
  const [productRevision, setProductRevision] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [accountError, setAccountError] = useState("");
  const feedVersion = useRef(0);
  const moreController = useRef(null);
  const morePending = useRef(false);
  const detailCache = useRef(new Map());
  const logoutPending = useRef(false);
  const lastUserId = useRef(null);
  // 상세를 받아 둔 사용자. 처음 값을 현재 사용자로 둬야 새로고침 직후(세션 복원)를 "사용자 변경"으로 오인해 상세를 두 번 받지 않는다.
  const detailUserId = useRef(user?.id ?? null);
  const reloadChatUnread = useRef(() => {});
  const chatUnreadPath = useRef(location.pathname);

  useEffect(() => {
    const abort = new AbortController();
    setCategoryError("");
    fetchCategories(abort.signal).then((rows) => { if (!abort.signal.aborted) setCategories(rows); })
      .catch((error) => { if (!abort.signal.aborted) setCategoryError(error.message); });
    return () => abort.abort();
  }, [categoryRetry, user?.id]);

  // 뒤로가기로 검색 조건이 바뀌면 입력창도 주소를 따라간다.
  useEffect(() => { setSearch(keyword); }, [keyword]);

  // 다른 페이지로 옮기면 맨 위에서 시작하고, 페이지에 딸린 창은 닫는다. 모달을 열고 닫을 때는 페이지가 그대로라 해당하지 않는다.
  useEffect(() => { window.scrollTo(0, 0); setModal(null); }, [pageLocation.pathname, pageLocation.search]);

  useEffect(() => {
    if (view !== "home") return undefined;
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
  }, [view, region?.id, categoryId, sort, keyword, retry, user?.id]);

  /**
   * 상품 상세. 주소가 곧 "상세 열기"라 effect 에서 불러올 수밖에 없는데, 상세 조회는 조회수를 올린다.
   * 같은 기록 항목(location.key)의 요청은 한 번만 보내고 결과를 기억한다.
   * - StrictMode 가 effect 를 두 번 실행해도 두 번째는 첫 요청을 기다린다(그래서 요청을 abort 하지 않는다).
   * - 프로필을 열었다가 뒤로가기로 돌아온 상세도 다시 세지 않는다.
   * 다른 곳에 갔다가 새로 들어오면 새 기록 항목이라 새 조회로 센다. 실패한 응답은 기억하지 않는다(다시 시도 가능).
   */
  useEffect(() => {
    if (!productId) { setDetail(null); return undefined; }
    const key = `${location.key}:${productId}`;
    const cache = detailCache.current;
    let entry = cache.get(key);
    if (!entry) {
      const initial = location.state?.product;
      entry = { promise: initial?.id === productId ? Promise.resolve(initial) : fetchProduct(productId) };
      cache.set(key, entry);
      if (cache.size > DETAIL_CACHE_SIZE) cache.delete(cache.keys().next().value);
    }
    let active = true;
    setDetail({ key, id: productId, loading: true, data: null, error: "" });
    entry.promise
      .then((data) => { if (active) setDetail({ key, id: productId, loading: false, data, error: "" }); })
      .catch((error) => {
        if (cache.get(key) === entry) cache.delete(key);
        if (active) setDetail({ key, id: productId, loading: false, data: null, error: error.message });
      });
    return () => { active = false; };
  }, [productId, location.key, detailRetry]);

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

  /**
   * 채팅 뱃지(안 읽은 메시지 합계). 알림 뱃지와 달리 +1 로 세지 않고 서버에 다시 묻는다.
   * 보고 있는 방의 메시지는 곧바로 읽음 처리되고, 방에 들어가 읽으면 여러 개가 한 번에 줄어서
   * 화면에서 더하고 빼면 어긋나기 쉽다. 대신 이벤트가 몰려도 요청은 300ms 에 한 번만 보낸다.
   * 다시 묻는 때: 로그인, 소켓 (재)연결, 상대의 새 메시지, 내가 읽음, 페이지 이동(나가기는 이벤트 없이 읽음 처리된다).
   */
  useEffect(() => {
    setChatUnreadCount(0);
    if (!user) return undefined;
    const me = user.id;
    let abort = new AbortController();
    let timer = null;
    const load = () => {
      clearTimeout(timer); timer = null;
      abort.abort(); abort = new AbortController();
      const signal = abort.signal;
      fetchChatUnreadCount(signal).then((data) => { if (!signal.aborted) setChatUnreadCount(data.count); })
        .catch(() => { /* 뱃지는 부가 정보다. 다음 이벤트·이동 때 다시 맞춘다. */ });
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(load, 300); };
    reloadChatUnread.current = schedule;
    load();
    const offConnected = chatSocket.onConnected(load);
    const offEvent = chatSocket.onEvent((event) => {
      if ((event.type === "MESSAGE" && event.message.senderId !== me) || (event.type === "READ" && event.readerId === me)) schedule();
    });
    return () => {
      clearTimeout(timer); abort.abort(); offConnected(); offEvent();
      reloadChatUnread.current = () => {};
    };
  }, [user?.id]);

  // 처음 렌더링은 위 effect 가 이미 불러오므로 건너뛴다.
  useEffect(() => {
    if (chatUnreadPath.current === location.pathname) return;
    chatUnreadPath.current = location.pathname;
    reloadChatUnread.current();
  }, [location.pathname]);

  // 사용자가 바뀌면(로그인·로그아웃) 이전 사용자 기준의 상세(isLiked·isMine)를 다시 받아야 한다.
  useEffect(() => {
    if (detailUserId.current === (user?.id ?? null)) return;
    detailUserId.current = user?.id ?? null;
    setEditor(null);
    detailCache.current.clear();
    setDetailRetry((value) => value + 1);
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

  // ---------- 이동 ----------

  /** 페이지 이동. 보고 있는 페이지를 다시 누르면 기록을 쌓지 않고 새로 불러온다. */
  function go(to) {
    setEditor(null); setModal(null); setAccountError("");
    const current = pageLocation.pathname + pageLocation.search;
    if (current === to && !location.state?.background) { setRetry((value) => value + 1); return; }
    navigate(to);
  }
  function openProduct(id, product) {
    navigate(paths.product(id), { state: { background: pageLocation, product } });
  }
  function openProfile(id) {
    navigate(paths.user(id), { state: { background: pageLocation } });
  }
  /** 모달 닫기. 앱 안에서 열었으면 뒤로가기(아래 화면이 그대로 남는다), 주소로 바로 들어왔으면 홈으로 바꿔치기. */
  function closeModal() {
    if (location.state?.background) navigate(-1);
    else navigate(paths.home, { replace: true });
  }
  function changeHomeQuery(changes) {
    setEditor(null);
    navigate({ pathname: paths.home, search: homeSearch({ keyword, categoryId, sort, ...changes }) });
  }
  function submitSearch(event) {
    event.preventDefault();
    if (search.trim() === keyword && view === "home") { setRetry((value) => value + 1); return; }
    changeHomeQuery({ keyword: search.trim() });
  }
  /** 알림 이동. 앱 화면 허용 목록에 있는 경로만 따른다(외부 주소로의 열린 리다이렉트 방지). */
  function openNotificationTarget(targetUrl) {
    setModal(null);
    if (!isAppPath(targetUrl)) return;
    const product = matchPath("/products/:id", targetUrl);
    const profile = matchPath("/users/:id", targetUrl);
    if (product) openProduct(parseId(product.params.id));
    else if (profile) openProfile(parseId(profile.params.id));
    else navigate(targetUrl);
  }

  // ---------- 동작 ----------

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
      patchDetail((data) => apply(data));
      return result;
    } catch (error) {
      setAccountError(error.message);
      return null;
    }
  }

  /** 열린 상세를 서버 응답으로 바꾸고, 기억해 둔 응답도 같이 바꾼다(뒤로가기로 돌아와도 최신 값). */
  function patchDetail(mapper) {
    setDetail((old) => {
      if (!old?.data) return old;
      const data = mapper(old.data);
      const entry = detailCache.current.get(old.key);
      if (entry) entry.promise = Promise.resolve(data);
      return { ...old, data };
    });
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

  /**
   * 상품 상세의 채팅하기. 서버가 기존 방이 있으면 그 방을 돌려주므로 여기서 중복을 판단하지 않는다.
   * 실패 메시지는 상세 화면이 보여준다.
   */
  async function startChat(product) {
    if (!user) { setAccountError(""); setModal("auth"); return; }
    const room = await openChatRoom(product.id);
    navigate(paths.chatRoom(room.roomId));
  }
  async function signOut() {
    if (logoutPending.current) return;
    logoutPending.current = true; setLoggingOut(true); setAccountError("");
    try { await logout(); } catch (error) { setAccountError(error.message); }
    finally { logoutPending.current = false; setLoggingOut(false); }
  }
  const login = () => { setAccountError(""); setModal("auth"); };
  const goHome = () => go(paths.home);
  const navigation = { user, view, loggingOut, chatUnreadCount, onLogin: login, onLogout: signOut,
    onHome: goHome, onMyPage: () => go(paths.my()), onChat: () => go(paths.chat),
    onRegionClick: () => setModal("region") };
  const categoryBar = <CategoryBar categories={categories} value={categoryId} onChange={(value) => changeHomeQuery({ categoryId: value })} />;
  const selectRoom = (id, options) => navigate(id ? paths.chatRoom(id) : paths.chat, options);

  /** 상세 안에서 상태 변경·끌어올리기를 했다. 같은 상세에 머물며 목록만 새로 받는다. */
  function detailChanged(product) {
    setProductRevision((value) => value + 1);
    setRetry((value) => value + 1);
    patchDetail(() => product);
  }
  /** 등록·수정 창에서 저장했다. 저장 응답으로 상세를 연다(상세를 다시 요청하지 않아 조회수가 오르지 않는다). */
  function productSaved(product) {
    setEditor(null);
    setProductRevision((value) => value + 1);
    setRetry((value) => value + 1);
    openProduct(product.id, product);
  }
  function writeProduct() {
    if (!user) { setModal("auth"); return; }
    setEditor({ product: null });
  }

  const homePage = <main className={styles.shell}>
    <section aria-label="상품 목록">
      {accountError && <p className={styles.error} role="alert">{accountError}</p>}
      {categoryError && <div className={styles.error} role="alert">{categoryError}<button onClick={() => setCategoryRetry((value) => value + 1)}>카테고리 다시 시도</button></div>}
      <div className={styles.feedHead}>
        <div>
          <h1 className={styles.title}>{region ? region.dong + "의 이웃 물건" : "우리 동네에서 발견하는 좋은 물건"}</h1>
          <p className={styles.sub}>{keyword ? keyword + " 검색 · " : ""}{region ? "불러온 상품 " + feed.items.length + "개" : "먼저 둘러볼 동네를 선택해 주세요."}</p>
        </div>
        <label className={styles.sortLabel}>정렬<select className={styles.sortBtn} value={sort} onChange={(e) => changeHomeQuery({ sort: e.target.value })} aria-label="상품 정렬">
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
    <Sidebar onRegionClick={navigation.onRegionClick} onKeyword={(value) => changeHomeQuery({ keyword: value })} />
  </main>;
  const chatScreen = <ChatScreen user={user} onHome={goHome} onLogin={login} onSelectRoom={selectRoom}
    onOpenProduct={openProduct} onOpenProfile={openProfile} />;
  const myScreen = <MyScreen user={user} onHome={goHome} onTabChange={(tab) => navigate(paths.my(tab))}
    refreshKey={productRevision} onOpenProduct={openProduct} onToggleFavorite={toggleFavorite}
    onRegionsChange={applyPrimaryRegion} onLogin={login} />;

  return <>
    <Header {...navigation} region={region} search={search} onSearchChange={setSearch} onSearch={submitSearch}
      unreadCount={unreadCount} onNotifications={() => { setAccountError(""); setModal("notifications"); }}>
      {categoryBar}
    </Header>
    {view === "home" && <div className={styles.mobileOnly}>{categoryBar}
      {/* 검색 중에는 결과에 집중하도록 인기 검색어를 숨긴다. */}
      {!keyword && <PopularKeywords variant="chips" onSelect={(value) => changeHomeQuery({ keyword: value })} />}</div>}
    <Routes location={pageLocation}>
      <Route path="/" element={homePage} />
      {/* 상세·프로필 주소로 바로 들어오면 홈 위에 모달을 띄운다. */}
      <Route path="/products/:id" element={<RequireId name="id" onHome={goHome}>{homePage}</RequireId>} />
      <Route path="/users/:id" element={<RequireId name="id" onHome={goHome}>{homePage}</RequireId>} />
      <Route path="/chat" element={chatScreen} />
      <Route path="/chat-rooms/:roomId" element={chatScreen} />
      <Route path="/my" element={myScreen} />
      <Route path="/my/:tab" element={myScreen} />
      <Route path="*" element={<NotFound onHome={goHome} />} />
    </Routes>
    <BottomNav {...navigation} />
    {/* 채팅 화면에서는 떠 있는 등록 버튼이 입력창의 전송 버튼을 가린다. */}
    {view !== "chat" && <button className={styles.writeButton} onClick={writeProduct}>＋ 상품 등록</button>}
    <footer className={styles.footer + " " + styles.pcOnly}><div className={styles.footerInner}><span>골목마켓 · 동네 기반 중고거래 플랫폼</span><span>이웃의 물건에 새로운 일상을</span></div></footer>
    {modal === "auth" && <AuthModal onClose={() => setModal(null)} />}
    {modal === "region" && <RegionPicker onClose={() => setModal(null)} onSelect={selectRegion} />}
    {modal === "notifications" && user && <NotificationPanel onClose={() => setModal(null)} onNavigate={openNotificationTarget}
      onRead={() => setUnreadCount((value) => Math.max(0, value - 1))} onAllRead={() => setUnreadCount(0)} />}
    {detail && <ProductDetail key={detail.key} detail={detail} onClose={closeModal}
      onRetry={() => setDetailRetry((value) => value + 1)}
      onEdit={(product) => { setEditor({ product }); closeModal(); }} onChanged={detailChanged} onStartChat={startChat}
      onOpenProfile={openProfile}
      onDeleted={() => { setProductRevision((v) => v + 1); setRetry((v) => v + 1); closeModal(); }} />}
    {editor && <ProductForm key={editor.product?.id ?? "new"} product={editor.product} categories={categories}
      onClose={() => setEditor(null)} onVerifyRegion={() => go(paths.my())} onSaved={productSaved} />}
    {profileId && <UserProfile key={profileId} userId={profileId} onClose={closeModal} />}
  </>;
}
