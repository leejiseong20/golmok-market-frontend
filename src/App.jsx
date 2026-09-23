import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { matchPath, Route, Routes, useLocation, useNavigate } from "react-router";
import Header from "./components/Header.jsx";
import CategoryBar from "./components/CategoryBar.jsx";
import BottomNav from "./components/BottomNav.jsx";
import AuthModal from "./components/AuthModal.jsx";
import RegionPicker from "./components/RegionPicker.jsx";
import ProductDetail from "./components/ProductDetail.jsx";
import ProductForm from "./components/ProductForm.jsx";
import SettingsPage from "./components/SettingsPage.jsx";
import UserProfile from "./components/UserProfile.jsx";
import ReportForm from "./components/ReportForm.jsx";
import NotificationPanel from "./components/NotificationPanel.jsx";
import NotFound from "./components/NotFound.jsx";
import ErrorBoundary, { CrashDialog, CrashNotice } from "./components/ErrorBoundary.jsx";
import ServerDownBanner from "./components/ServerDownBanner.jsx";
import Toaster from "./components/Toaster.jsx";
import PopularKeywords from "./components/PopularKeywords.jsx";
import HomePage from "./app/HomePage.jsx";
import { ChatScreen, MyScreen, RequireId } from "./app/routeScreens.jsx";
import useAdminAccess from "./app/useAdminAccess.js";
import useBadges from "./app/useBadges.js";
import useCategories from "./app/useCategories.js";
import useHomeFeed from "./app/useHomeFeed.js";
import useProductDetail from "./app/useProductDetail.js";
import useScrollRestoration from "./app/useScrollRestoration.js";
import { client } from "./api/client.js";
import { openChatRoom } from "./api/chatApi.js";
import { logout } from "./api/authApi.js";
import { blockConfirmText, blockUser, unblockUser } from "./api/blockApi.js";
import { deletePushSubscription } from "./api/pushApi.js";
import { disablePush } from "./push.js";
import { addFavorite, removeFavorite } from "./api/productApi.js";
import { homeSearch, isAppPath, parseHomeQuery, parseId, paths } from "./routes.js";
import { toast } from "./toast.js";
import { serverStatus } from "./serverStatus.js";
import styles from "./App.module.css";

// 관리자 영역은 관리자만 쓴다. 일반 사용자의 첫 화면 용량에 넣지 않도록 들어갈 때 불러온다.
const AdminApp = lazy(() => import("./admin/AdminApp.jsx"));

function savedRegion() {
  try {
    const region = JSON.parse(localStorage.getItem("golmok.region"));
    return Number.isSafeInteger(region?.id) && region.id > 0 && typeof region.dong === "string" ? region : null;
  } catch { return null; }
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
 *
 * 서로 상태를 나누지 않는 덩어리는 src/app/ 의 훅으로 뗐다(홈 목록·카테고리·상세·뱃지·관리자 여부·스크롤 복원).
 * 여기에는 주소 해석, 이동, 여러 덩어리를 잇는 동작(찜·차단·저장·로그아웃), 창 목록, 오류 경계 배치만 남긴다.
 */
export default function App() {
  const session = useSyncExternalStore(client.subscribe, client.getSession);
  // 데모 서버가 꺼져 있으면 안내 띠 하나로 설명하고, 같은 이유의 오류 줄·스켈레톤은 숨긴다.
  const serverState = useSyncExternalStore(serverStatus.subscribe, serverStatus.getState);
  const serverDown = serverState === "down";
  // 화면 모드. 고른 값이 없으면 시스템 설정을 따르므로 effective() 를 그대로 읽는다.
  const user = session?.user;
  const location = useLocation();
  const navigate = useNavigate();
  const pageLocation = location.state?.background ?? location;
  const { keyword, categoryId, sort } = parseHomeQuery(pageLocation.search);
  const productMatch = matchPath("/products/:id", location.pathname);
  const userMatch = matchPath("/users/:id", location.pathname);
  const productId = parseId(productMatch?.params.id);
  const profileId = parseId(userMatch?.params.id);
  // 설정은 나의 골목에서 들어가는 화면이라 하단 탭도 "나의 골목"을 켠다.
  // 관리자 화면(/admin)은 홈이 아니다. 홈으로 보면 카테고리 줄과 "상품 등록" 버튼이 함께 뜨고 하단 탭도 홈이 켜진다.
  const view = pageLocation.pathname.startsWith("/chat") ? "chat"
    : pageLocation.pathname.startsWith("/my") || pageLocation.pathname.startsWith("/settings") ? "my"
    : pageLocation.pathname.startsWith("/admin") ? "admin" : "home";
  const pageKey = pageLocation.pathname + pageLocation.search;

  const [region, setRegion] = useState(savedRegion);
  const [search, setSearch] = useState(keyword);
  const [modal, setModal] = useState(null);
  const [editor, setEditor] = useState(null);
  const [productRevision, setProductRevision] = useState(0);
  // 신고 창에 넘길 대상. 상세·프로필·채팅방 어디서 열든 창은 하나다.
  const [reporting, setReporting] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutPending = useRef(false);
  const lastUserId = useRef(null);

  const { admin, denied: adminDenied, deny: denyAdmin } = useAdminAccess(user?.id);
  const categoriesState = useCategories(user?.id);
  const { categories } = categoriesState;
  const homeFeed = useHomeFeed({ enabled: view === "home", region, categoryId, sort, keyword, userId: user?.id });
  const { feed } = homeFeed;
  const productDetail = useProductDetail({ productId, location, userId: user?.id, onUserChanged: () => setEditor(null) });
  const { detail } = productDetail;
  const badges = useBadges(user?.id, location.pathname);
  const rememberScroll = useScrollRestoration(pageKey, feed.items.length);

  // 데모 서버가 다시 켜지면 홈의 카테고리·목록을 다시 부른다. 꺼진 동안 숨겨 둔 오류가 그대로 드러나지 않게 한다.
  useEffect(() => {
    if (serverState !== "recovered") return;
    categoriesState.retry();
    homeFeed.reload();
  }, [serverState]);

  // 뒤로가기로 검색 조건이 바뀌면 입력창도 주소를 따라간다.
  useEffect(() => { setSearch(keyword); }, [keyword]);

  // 페이지를 옮기면 창을 닫는다(스크롤은 useScrollRestoration 이 옮긴다). 모달을 열고 닫을 때는 아래 페이지가 그대로다.
  useEffect(() => { setModal(null); }, [pageKey]);

  // 로그인하는 순간에만 대표 동네를 홈에 적용한다. 매 렌더마다 적용하면
  // 로그인한 사용자가 홈에서 다른 동네를 골라볼 수 없다.
  useEffect(() => {
    if (user && lastUserId.current !== user.id && user.primaryRegion) {
      selectRegion({ id: user.primaryRegion.id, dong: user.primaryRegion.name });
    }
    lastUserId.current = user?.id ?? null;
  }, [user?.id]);

  // ---------- 이동 ----------

  /** 이동은 모두 이 함수를 지난다(위치를 적고 옮긴다). 뒤로가기는 popstate 가 맡는다. */
  function goTo(to, options) {
    rememberScroll();
    navigate(to, options);
  }

  /** 페이지 이동. 보고 있는 페이지를 다시 누르면 기록을 쌓지 않고 새로 불러온다. */
  function go(to) {
    setEditor(null); setModal(null);
    const current = pageLocation.pathname + pageLocation.search;
    if (current === to && !location.state?.background) { homeFeed.reload(); return; }
    goTo(to);
  }
  function openProduct(id, product) {
    goTo(paths.product(id), { state: { background: pageLocation, product } });
  }
  function openProfile(id) {
    goTo(paths.user(id), { state: { background: pageLocation } });
  }
  /** 창 경계가 잡았을 때: 떠 있는 창을 모두 닫는다. 어느 창이 망가졌는지 가리지 않는다(다시 열면 된다). */
  function closeAllWindows() {
    setModal(null);
    setEditor(null);
    setReporting(null);
    if (productId || profileId) closeModal();
  }

  /** 모달 닫기. 앱 안에서 열었으면 뒤로가기(아래 화면이 그대로 남는다), 주소로 바로 들어왔으면 홈으로 바꿔치기. */
  function closeModal() {
    if (location.state?.background) navigate(-1);
    else goTo(paths.home, { replace: true });
  }
  function changeHomeQuery(changes) {
    setEditor(null);
    goTo({ pathname: paths.home, search: homeSearch({ keyword, categoryId, sort, ...changes }) });
  }
  function submitSearch(event) {
    event.preventDefault();
    if (search.trim() === keyword && view === "home") { homeFeed.reload(); return; }
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
    else goTo(targetUrl);
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
    if (!user) { setModal("auth"); return null; }
    try {
      const result = product.isLiked ? await removeFavorite(product.id) : await addFavorite(product.id);
      const apply = (item) => item.id === product.id
        ? { ...item, isLiked: result.isLiked, favoriteCount: result.favoriteCount } : item;
      homeFeed.patchItems(apply);
      productDetail.patch((data) => apply(data));
      return result;
    } catch (error) {
      toast.error(error.message);
      return null;
    }
  }

  /**
   * 상세 모달에서 찜을 눌렀다. 목록·상세는 toggleFavorite 이 이미 맞추고,
   * 여기서는 마이페이지만 다시 불러온다. 찜한 상품 탭은 해제한 항목이 목록에서 빠져야 하는데
   * 그 목록은 서버가 주는 것이라 화면에서 지울 수 없다.
   */
  async function favoriteFromDetail(product) {
    const result = await toggleFavorite(product);
    if (result) setProductRevision((value) => value + 1);
    return result;
  }

  /**
   * 동네 인증 결과를 홈 목록에 반영한다.
   * 대표 동네를 인증해 두고도 홈에서 다시 고르게 하면 인증한 의미가 없다.
   */
  function applyPrimaryRegion(regions) {
    const primary = regions.find((item) => item.isPrimary);
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
    if (!user) { setModal("auth"); return; }
    const room = await openChatRoom(product.id);
    goTo(paths.chatRoom(room.roomId));
  }
  /**
   * 로그아웃하면 이 기기로 오던 이 계정의 알림을 끊는다. 끊지 않으면 다른 사람이 이 기기를 써도
   * 앞사람의 채팅 알림이 계속 뜬다. 인증이 필요한 요청이라 로그아웃보다 먼저 한다.
   * 브라우저 해제를 먼저 끝내고 서버 삭제는 제한 시간만 기다린다.
   * 브라우저 해제 자체가 실패하면 로그아웃을 완료한 것처럼 보이지 않는다.
   */
  async function releasePush() {
    await disablePush({ container: navigator.serviceWorker, api: { remove: deletePushSubscription } });
  }
  async function signOut() {
    if (logoutPending.current) return;
    logoutPending.current = true; setLoggingOut(true);
    try { await releasePush(); await logout(); toast.show("로그아웃했어요."); return true; }
    catch (error) { toast.error(error.message); return false; }
    finally { logoutPending.current = false; setLoggingOut(false); }
  }
  const login = () => setModal("auth");

  /** 신고 창을 연다. 로그인해야 신고할 수 있다(누가 신고했는지 기록해야 중복을 막는다). */
  function openReport(target) {
    if (!user) { setModal("auth"); return; }
    setReporting(target);
  }
  /**
   * 차단·해제 뒤에는 목록과 뱃지가 달라진다(그 사람 상품·그 사람과의 방이 빠지거나 돌아온다).
   * 화면에서 항목을 직접 지우지 않고 서버에 다시 묻는다(찜과 같은 이유).
   */
  function blocksChanged() {
    homeFeed.reload();
    setProductRevision((value) => value + 1);
    badges.reloadChatUnread();
  }
  /** 차단. 되돌릴 수 있지만 채팅이 바로 끊기므로 한 번 묻는다. 성공하면 true. */
  async function blockPerson({ id, nickname }) {
    if (!user) { setModal("auth"); return false; }
    if (!window.confirm(blockConfirmText(nickname))) return false;
    try {
      await blockUser(id);
      toast.success(`${nickname}님을 차단했어요.`);
    } catch (error) {
      // 다른 기기에서 이미 차단했다면 바라던 결과는 이미 있다.
      if (error.code !== "ALREADY_BLOCKED") { toast.error(error.message); return false; }
    }
    blocksChanged();
    return true;
  }
  async function unblockPerson({ id, nickname }) {
    try {
      await unblockUser(id);
      toast.show(`${nickname}님 차단을 해제했어요.`);
      blocksChanged();
      return true;
    } catch (error) {
      toast.error(error.message);
      return false;
    }
  }
  const goHome = () => go(paths.home);
  // 로그아웃은 설정 화면에만 있다(헤더·하단 탭에는 없다).
  const navigation = { user, view, chatUnreadCount: badges.chatUnreadCount, onLogin: login,
    onHome: goHome, onMyPage: () => go(paths.my()), onChat: () => go(paths.chat),
    onRegionClick: () => setModal("region") };
  // 카테고리 줄·인기 검색어·사이드바는 부가 영역이다. 망가지면 조용히 숨기고 나머지 화면은 그대로 쓴다.
  const categoryBar = <ErrorBoundary name="카테고리" resetKey={categories}>
    <CategoryBar categories={categories} value={categoryId} onChange={(value) => changeHomeQuery({ categoryId: value })} />
  </ErrorBoundary>;
  const selectRoom = (id, options) => goTo(id ? paths.chatRoom(id) : paths.chat, options);

  /** 상세 안에서 상태 변경·끌어올리기를 했다. 같은 상세에 머물며 목록만 새로 받는다. */
  function detailChanged(product) {
    setProductRevision((value) => value + 1);
    homeFeed.reload();
    productDetail.patch(() => product);
  }
  /** 등록·수정 창에서 저장했다. 저장 응답으로 상세를 연다(상세를 다시 요청하지 않아 조회수가 오르지 않는다). */
  function productSaved(product) {
    setEditor(null);
    setProductRevision((value) => value + 1);
    homeFeed.reload();
    openProduct(product.id, product);
  }
  function writeProduct() {
    if (!user) { setModal("auth"); return; }
    setEditor({ product: null });
  }

  const homePage = <HomePage region={region} keyword={keyword} sort={sort} serverDown={serverDown}
    categoryError={categoriesState.error} onCategoryRetry={categoriesState.retry}
    feed={feed} onMore={homeFeed.more} onReload={homeFeed.reload}
    onQueryChange={changeHomeQuery} onRegionClick={navigation.onRegionClick} onOpenProduct={openProduct} />;
  const chatScreen = <ChatScreen user={user} onHome={goHome} onLogin={login} onSelectRoom={selectRoom}
    onOpenProduct={openProduct} onOpenProfile={openProfile}
    onReport={(person) => openReport({ targetType: "USER", targetId: person.id, targetName: person.nickname, blockTarget: person })}
    onBlock={blockPerson} />;
  const showWriteButton = view === "home";
  const myScreen = <MyScreen user={user} onHome={goHome} onTabChange={(tab) => goTo(paths.my(tab))}
    refreshKey={productRevision} onOpenProduct={openProduct} onToggleFavorite={toggleFavorite}
    onLogin={login} onOpenSettings={() => goTo(paths.settings)} />;
  /**
   * 설정의 뒤로 버튼. 앱 안에서 들어왔으면 기록을 한 칸 되돌린다(새 기록을 쌓으면 뒤로가기가 설정으로 되돌아온다).
   * 주소로 바로 들어왔으면 되돌릴 곳이 없어 나의 골목으로 바꿔치기한다. react-router 가 기록에 idx 를 남긴다.
   */
  const leaveSettings = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(paths.my(), { replace: true }));
  const settingsScreen = <SettingsPage key={user?.id ?? "guest"} user={user} onBack={leaveSettings} onLogin={login}
    // 로그아웃하면 설정에 남을 이유가 없다. 나의 골목(로그인 안내)으로 바꿔치기한다.
    onLogout={async () => { if (await signOut()) navigate(paths.my(), { replace: true }); }} loggingOut={loggingOut} onHome={goHome}
    onRegionsChange={applyPrimaryRegion} onBlocksChanged={blocksChanged} />;

  /**
   * 관리자 영역(/admin/*). 비로그인·관리자 아님·서버 404 면 일반 틀의 없는 페이지다.
   * 없는 페이지까지 관리자 틀로 보이면 "권한 없음"이라고 알리는 것과 같다(관리자 화면이 있다는 사실이 드러난다).
   * 관리자 여부를 묻는 동안(admin === null)은 어느 틀도 그리지 않는다. 틀이 한 번 바뀌어 번쩍이는 것을 막는다.
   */
  const inAdmin = view === "admin" && Boolean(user) && admin !== false && !adminDenied;
  const adminLoading = <main id="main" tabIndex={-1} aria-busy="true" />;
  const adminScreen = !inAdmin ? <NotFound onHome={goHome} />
    : admin === null ? adminLoading
    : <Suspense fallback={adminLoading}>
      <AdminApp onExit={goHome} onNotFound={denyAdmin}
        onOpenProduct={(id) => openProduct(id)} onOpenProfile={(id) => openProfile(id)} />
    </Suspense>;

  return <>
    <a className="skip-link btn btn-primary btn-sm" href="#main">본문 바로가기</a>
    {/* 관리자 영역은 자기 틀(메뉴·사이트로 돌아가기)을 쓴다. 일반 헤더·하단 탭·상품 등록·footer 를 모두 뺀다. */}
    {!inAdmin && <Header {...navigation} region={region} search={search} onSearchChange={setSearch} onSearch={submitSearch}
      unreadCount={badges.unreadCount} onNotifications={() => setModal("notifications")}
      admin={admin === true} onAdmin={() => goTo(paths.admin)}>
      {categoryBar}
    </Header>}
    {/* 관리자 영역은 자기 틀 안(관리자 메뉴 아래)에 같은 띠를 둔다. */}
    {!inAdmin && <ServerDownBanner />}
    {view === "home" && <div className={styles.mobileOnly}>{categoryBar}
      {/* 검색 중에는 결과에 집중하도록 인기 검색어를 숨긴다. */}
      {!keyword && <ErrorBoundary name="인기 검색어">
        <PopularKeywords variant="chips" onSelect={(value) => changeHomeQuery({ keyword: value })} />
      </ErrorBoundary>}</div>}
    {/* 본문 경계. 헤더·하단 탭은 밖에 있어 본문이 망가져도 다른 화면으로 갈 수 있다. 주소가 바뀌면 풀린다. */}
    <ErrorBoundary name="본문" resetKey={pageLocation.pathname}
      fallback={({ chunk, reset }) => <CrashNotice chunk={chunk} onRetry={reset} onHome={goHome} />}>
    <Routes location={pageLocation}>
      <Route path="/" element={homePage} />
      {/* 상세·프로필 주소로 바로 들어오면 홈 위에 모달을 띄운다. */}
      <Route path="/products/:id" element={<RequireId name="id" onHome={goHome}>{homePage}</RequireId>} />
      <Route path="/users/:id" element={<RequireId name="id" onHome={goHome}>{homePage}</RequireId>} />
      <Route path="/chat" element={chatScreen} />
      <Route path="/chat-rooms/:roomId" element={chatScreen} />
      <Route path="/my" element={myScreen} />
      <Route path="/my/:tab" element={myScreen} />
      <Route path="/settings" element={settingsScreen} />
      {/* 관리자 전용. 권한 판단은 서버가 하고(404), 화면은 그때 없는 페이지로 바꾼다. */}
      <Route path="/admin/*" element={adminScreen} />
      <Route path="*" element={<NotFound onHome={goHome} />} />
    </Routes>
    </ErrorBoundary>
    {!inAdmin && <BottomNav {...navigation} />}
    {/*
      상품 등록 버튼은 홈에서만 띄운다. 채팅에서는 전송 버튼을 가리고, 나의 골목·설정에서는 쓸 일이 없다.
      버튼이 뜬 화면에서는 footer 아래에 버튼 자리를 비워 둔다(맨 아래까지 내리면 footer 글자를 가렸다).
    */}
    {showWriteButton && <button className={styles.writeButton} onClick={writeProduct} aria-label="상품 등록">
      <span className={styles.writeIcon} aria-hidden="true">＋</span><span className={styles.writeLabel}>상품 등록</span></button>}
    {!inAdmin && <footer className={styles.footer + " " + styles.pcOnly + (showWriteButton ? " " + styles.footerClear : "")}><div className={styles.footerInner}><span>골목마켓 · 동네 기반 중고거래 플랫폼</span><span>이웃의 물건에 새로운 일상을</span></div></footer>}
    {/* 창 경계. 창 하나가 망가져도 밑의 화면은 그대로 두고, 그 창만 닫게 한다. 주소가 바뀌면(창을 닫으면) 풀린다. */}
    <ErrorBoundary name="창" resetKey={location.pathname}
      fallback={({ chunk, reset }) => <CrashDialog chunk={chunk} onClose={() => { closeAllWindows(); reset(); }} />}>
    {modal === "auth" && <AuthModal onClose={() => setModal(null)} />}
    {modal === "region" && <RegionPicker onClose={() => setModal(null)} onSelect={selectRegion} />}
    {modal === "notifications" && user && <NotificationPanel onClose={() => setModal(null)} onNavigate={openNotificationTarget}
      onRead={badges.markRead} onAllRead={badges.markAllRead} />}
    {detail && <ProductDetail key={detail.key} detail={detail} onClose={closeModal}
      onRetry={productDetail.retry}
      onEdit={(product) => { setEditor({ product }); closeModal(); }} onChanged={detailChanged} onStartChat={startChat}
      onToggleFavorite={favoriteFromDetail}
      onOpenProfile={openProfile}
      onReport={(product) => openReport({ targetType: "PRODUCT", targetId: product.id, targetName: product.title,
        blockTarget: { id: product.seller.id, nickname: product.seller.nickname } })}
      onDeleted={() => { setProductRevision((v) => v + 1); homeFeed.reload(); closeModal(); }} />}
    {editor && <ProductForm key={editor.product?.id ?? "new"} product={editor.product} categories={categories}
      onClose={() => setEditor(null)} onRegionsChange={applyPrimaryRegion} onSaved={productSaved} />}
    {profileId && <UserProfile key={profileId} userId={profileId} me={user?.id ?? null} onClose={closeModal}
      onReport={(person) => openReport({ targetType: "USER", targetId: person.id, targetName: person.nickname, blockTarget: person })}
      onBlock={blockPerson} onUnblock={unblockPerson} />}
    {reporting && <ReportForm key={`${reporting.targetType}-${reporting.targetId}`}
      targetType={reporting.targetType} targetId={reporting.targetId} targetName={reporting.targetName}
      onClose={() => setReporting(null)}
      onBlock={reporting.blockTarget && reporting.blockTarget.id !== user?.id
        ? async () => { if (await blockPerson(reporting.blockTarget)) setReporting(null); } : undefined} />}
    </ErrorBoundary>
    <Toaster />
  </>;
}
