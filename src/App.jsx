import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Header from "./components/Header.jsx";
import CategoryBar from "./components/CategoryBar.jsx";
import ProductCard from "./components/ProductCard.jsx";
import Sidebar from "./components/Sidebar.jsx";
import BottomNav from "./components/BottomNav.jsx";
import AuthModal from "./components/AuthModal.jsx";
import RegionPicker from "./components/RegionPicker.jsx";
import ProductDetail from "./components/ProductDetail.jsx";
import MyPage from "./components/MyPage.jsx";
import { client } from "./api/client.js";
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
  const [detail, setDetail] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [accountError, setAccountError] = useState("");
  const feedVersion = useRef(0);
  const moreController = useRef(null);
  const morePending = useRef(false);
  const detailController = useRef(null);
  const logoutPending = useRef(false);

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

  useEffect(() => {
    detailController.current?.abort(); setDetail(null);
    return () => detailController.current?.abort();
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

  function selectRegion(value) {
    setRegion(value); setModal(null);
    try { localStorage.setItem("golmok.region", JSON.stringify(value)); } catch { /* 메모리에서 선택 유지 */ }
  }
  function home() {
    detailController.current?.abort(); setDetail(null); setModal(null); setView("home");
    setKeyword(""); setSearch(""); setCategoryId(null); setSort("LATEST"); setRetry((value) => value + 1);
  }
  function myPage() {
    detailController.current?.abort(); setDetail(null); setModal(null); setAccountError(""); setView("my");
  }
  async function signOut() {
    if (logoutPending.current) return;
    logoutPending.current = true; setLoggingOut(true); setAccountError("");
    try { await logout(); } catch (error) { setAccountError(error.message); }
    finally { logoutPending.current = false; setLoggingOut(false); }
  }
  const navigation = { user, onHome: home, onRegionClick: () => setModal("region"), onMyPage: myPage, view,
    onLogin: () => { setAccountError(""); setModal("auth"); }, onLogout: signOut, loggingOut };
  const categoryBar = <CategoryBar categories={categories} value={categoryId} onChange={setCategoryId} />;

  return <>
    <Header {...navigation} region={region} search={search} onSearchChange={setSearch}
      onSearch={(event) => { event.preventDefault(); setKeyword(search.trim()); setRetry((value) => value + 1); }}>
      {categoryBar}
    </Header>
    {view === "home" && <div className={styles.mobileOnly}>{categoryBar}</div>}
    {view === "my"
      ? <MyPage user={user} onOpenProduct={openProduct} onToggleFavorite={toggleFavorite}
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
    <footer className={styles.footer + " " + styles.pcOnly}><div className={styles.footerInner}><span>골목마켓 · 동네 기반 중고거래 플랫폼</span><span>이웃의 물건에 새로운 일상을</span></div></footer>
    {modal === "auth" && <AuthModal onClose={() => setModal(null)} />}
    {modal === "region" && <RegionPicker onClose={() => setModal(null)} onSelect={selectRegion} />}
    {detail && <ProductDetail key={detail.id} detail={detail} onClose={() => { detailController.current?.abort(); setDetail(null); }} onRetry={() => openProduct(detail.id)} />}
  </>;
}
