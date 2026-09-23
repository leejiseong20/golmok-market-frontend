import EmptyState from "../components/EmptyState.jsx";
import ErrorBoundary from "../components/ErrorBoundary.jsx";
import InfiniteTrigger from "../components/InfiniteTrigger.jsx";
import ProductCard from "../components/ProductCard.jsx";
import Sidebar from "../components/Sidebar.jsx";
import { ProductListSkeleton } from "../components/Skeleton.jsx";
import styles from "../App.module.css";

/**
 * 홈(동네 상품 목록 + PC 사이드바). 목록 상태는 App 의 useHomeFeed 가 들고, 여기서는 그리기만 한다.
 *
 * 데모 서버가 꺼져 있으면(serverDown) 카테고리·목록의 오류 줄과 스켈레톤을 숨긴다 — 안내 띠(ServerDownBanner)가
 * 이유를 한 번에 말한다.
 */
export default function HomePage({ region, keyword, sort, serverDown, categoryError, onCategoryRetry,
  feed, onMore, onReload, onQueryChange, onRegionClick, onOpenProduct }) {
  return <main className={styles.shell} id="main" tabIndex={-1}>
    <section aria-label="상품 목록">
      {categoryError && !serverDown && <div className={styles.error} role="alert">{categoryError}<button className="btn btn-outline btn-sm" onClick={onCategoryRetry}>카테고리 다시 시도</button></div>}
      <div className={styles.feedHead}>
        <div>
          <h1 className={styles.title}>{region ? region.dong + "의 이웃 물건" : "우리 동네에서 발견하는 좋은 물건"}</h1>
          {/* 동네를 안 고른 상태의 안내는 아래 빈 상태가 하므로 여기서 또 적지 않는다. */}
          {/* 불러온 개수는 무한 스크롤에서 계속 바뀌어 뜻이 없다. 검색 중일 때만 무엇을 찾는지 알린다. */}
          {region && keyword && <p className={styles.sub}>"{keyword}" 검색 결과</p>}
        </div>
        <label className={styles.sortLabel}>정렬<select className={styles.sortBtn} value={sort} onChange={(e) => onQueryChange({ sort: e.target.value })} aria-label="상품 정렬">
          <option value="LATEST">최신순</option><option value="PRICE_ASC">낮은 가격순</option>
        </select></label>
      </div>
      {!region && <EmptyState title="먼저 둘러볼 동네를 선택해 주세요" description="동네를 고르면 근처 이웃이 올린 물건을 보여드려요."
        actionLabel="동네 선택하기" onAction={onRegionClick} />}
      {feed.loading && !serverDown && <ProductListSkeleton />}
      {feed.error && !serverDown && <div className={styles.error} role="alert">{feed.error}<button className="btn btn-outline btn-sm" onClick={() => feed.items.length ? onMore() : onReload()}>다시 시도</button></div>}
      {region && !feed.loading && !feed.error && feed.items.length === 0 &&
        <EmptyState title={keyword ? `"${keyword}" 검색 결과가 없어요` : "아직 이 동네에 올라온 물건이 없어요"}
          description="다른 동네나 검색어로 찾아보거나, 첫 물건을 올려보세요." />}
      <div className={styles.feed}>{feed.items.map((product) => <ProductCard key={product.id} product={product}
        onOpen={() => onOpenProduct(product.id)} />)}</div>
      {feed.loadingMore && <div className={styles.more}><ProductListSkeleton count={3} label="상품을 더 불러오는 중" /></div>}
      {/* 이 줄이 화면 가까이 오면 다음 페이지를 부른다. 실패하면 멈추고 위의 "다시 시도"를 기다린다(자동 재시도는 요청을 쏟아낸다). */}
      {feed.hasNext && !feed.loading && !feed.loadingMore && !feed.error && <InfiniteTrigger onReach={onMore} />}
    </section>
    <ErrorBoundary name="사이드바">
      <Sidebar onRegionClick={onRegionClick} onKeyword={(value) => onQueryChange({ keyword: value })} />
    </ErrorBoundary>
  </main>;
}
