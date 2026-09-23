import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { deleteProductByAdmin, fetchAdminProduct, fetchAdminProducts, restoreProduct } from "../api/adminApi.js";
import { formatPrice, relativeTime, statusLabel } from "../data/format.js";
import EmptyState from "../components/EmptyState.jsx";
import Modal from "../components/Modal.jsx";
import { parseId, paths } from "../routes.js";
import { toast } from "../toast.js";
import AdminHistory from "./AdminHistory.jsx";
import AdminReasonForm from "./AdminReasonForm.jsx";
import useAdminList, { useOpenRequest, useSearchFilters } from "./useAdminList.js";
import styles from "./AdminList.module.css";

/**
 * 상품 관리(관리자). 삭제한 상품도 보인다.
 *
 * 되살리기는 관리자가 내린 상품에만 보인다(서버도 같은 규칙으로 막는다). 판매자가 직접 지운 상품을 되돌리면 판매자의 뜻을 뒤집는다.
 */
const DELETED_TABS = [
  { value: "", label: "전체" },
  { value: "false", label: "보이는 상품" },
  { value: "true", label: "삭제됨" },
];

export default function AdminProducts({ onNotFound, onOpenProduct }) {
  const [params, setFilters] = useSearchFilters();
  const q = params.get("q") ?? "";
  const deleted = DELETED_TABS.some((tab) => tab.value === params.get("deleted")) ? params.get("deleted") : "";
  const sellerId = parseId(params.get("sellerId"));
  const [draft, setDraft] = useState(q);
  const [openId, setOpenId] = useState(null);
  useOpenRequest(setOpenId);
  useEffect(() => { setDraft(q); }, [q]);

  const { list, more, reload } = useAdminList(
    (cursor, signal) => fetchAdminProducts({ q, sellerId, deleted, cursor }, signal),
    `${q}|${deleted}|${sellerId}`, onNotFound);

  return <main className={styles.shell} id="main" tabIndex={-1}>
    <header className={styles.head}>
      <h1 className={styles.title}>상품</h1>
      <p className={styles.note}>제목으로 찾아요. 삭제한 상품도 보여요.</p>
    </header>

    <form className={styles.search} role="search" onSubmit={(event) => { event.preventDefault(); setFilters({ q: draft.trim() }); }}>
      <input type="search" aria-label="상품 검색" placeholder="상품 제목" value={draft} maxLength={100}
        onChange={(event) => setDraft(event.target.value)} />
      <button type="submit" className="btn btn-outline btn-sm">찾기</button>
    </form>

    <div className="seg" role="group" aria-label="삭제 여부">
      {DELETED_TABS.map((tab) => <button key={tab.value || "all"} type="button" className="seg-item"
        aria-pressed={deleted === tab.value} onClick={() => setFilters({ deleted: tab.value })}>{tab.label}</button>)}
    </div>
    {sellerId && <p className={styles.filterNote}>회원 #{sellerId}의 상품만 보는 중
      <button type="button" className={styles.inlineLink} onClick={() => setFilters({ sellerId: "" })}>모든 판매자 보기</button></p>}

    {list.error && <div className="alert alert-danger" role="alert">{list.error}
      <button className="btn btn-outline btn-sm" onClick={reload}>다시 시도</button></div>}
    {list.loading && <p className={styles.note} role="status">상품을 불러오고 있어요…</p>}
    {!list.loading && !list.error && list.items.length === 0 &&
      <EmptyState title="맞는 상품이 없어요" description="검색어나 조건을 바꿔 보세요." />}

    <ul className={styles.list}>
      {list.items.map((product) => <li key={product.id}>
        <button className={styles.row + " " + styles.rowThumb} onClick={() => setOpenId(product.id)}>
          <Thumb url={product.thumbnailUrl} />
          <span className={styles.rowBody}>
            <span className={styles.rowTop}>
              <strong>{product.title}</strong>
              <ProductBadges product={product} />
            </span>
            <span className={styles.rowMeta}>
              #{product.id} · {formatPrice(product.price)} · {product.sellerNickname} · {relativeTime(product.createdAt)}
            </span>
          </span>
        </button>
      </li>)}
    </ul>
    {list.hasNext && <button className="btn btn-outline btn-block" onClick={more}>더 보기</button>}

    {openId && <ProductDetail id={openId} onClose={() => setOpenId(null)} onChanged={reload} onOpenProduct={onOpenProduct} />}
  </main>;
}

function Thumb({ url }) {
  return url ? <img className={styles.thumb} src={url} alt="" loading="lazy" />
    : <span className={styles.thumb} aria-hidden="true" />;
}

/** 삭제 여부는 색만으로 알리지 않고 글자로 적는다. */
function ProductBadges({ product }) {
  return <span className={styles.badges}>
    {product.reportCount > 0 && <span className={styles.count}>신고 {product.reportCount}건</span>}
    {product.deleted
      ? <span className={styles.status + " " + styles.statusDELETED}>{product.deletedByAdmin ? "관리자가 내림" : "삭제됨"}</span>
      : <span className={styles.status}>{statusLabel(product.status)}</span>}
  </span>;
}

function ProductDetail({ id, onClose, onChanged, onOpenProduct }) {
  const navigate = useNavigate();
  const [state, setState] = useState({ data: null, loading: true, error: "" });

  useEffect(() => {
    const abort = new AbortController();
    fetchAdminProduct(id, abort.signal)
      .then((data) => { if (!abort.signal.aborted) setState({ data, loading: false, error: "" }); })
      .catch((error) => { if (!abort.signal.aborted) setState({ data: null, loading: false, error: error.message }); });
    return () => abort.abort();
  }, [id]);

  const detail = state.data;
  const product = detail?.product;

  async function apply(request, message) {
    const data = await request;
    setState({ data, loading: false, error: "" });
    toast.success(message);
    onChanged();
  }

  return <Modal title="상품 상세" onClose={onClose}>
    {state.loading && <p role="status">불러오고 있어요…</p>}
    {state.error && <p className="alert alert-danger" role="alert">{state.error}</p>}
    {product && <>
      <section className={styles.target} aria-label="상품">
        <Thumb url={product.thumbnailUrl} />
        <p className={styles.targetName}>{product.title}</p>
        {/* 삭제한 상품은 일반 상세로 열리지 않는다. */}
        {!product.deleted && <button className="btn btn-outline btn-sm" onClick={() => onOpenProduct(product.id)}>상품 보기</button>}
      </section>

      <dl className={styles.facts}>
        <div><dt>번호</dt><dd>#{product.id}</dd></div>
        <div><dt>가격</dt><dd>{formatPrice(product.price)}</dd></div>
        <div><dt>상태</dt><dd><ProductBadges product={product} /></dd></div>
        <div><dt>판매자</dt><dd>{product.sellerNickname}
          <button type="button" className={styles.inlineLink}
            onClick={() => navigate(paths.adminUsers, { state: { open: product.sellerId } })}>회원 관리에서 보기</button></dd></div>
        <div><dt>등록</dt><dd>{relativeTime(product.createdAt)}</dd></div>
      </dl>
      <p className={styles.detailBox}>{detail.description}</p>

      <AdminHistory actions={detail.actions} />

      {!product.deleted
        ? <AdminReasonForm key="delete" title="상품 내리기"
            hint="목록과 검색에서 사라져요. 대화와 거래 기록은 남고, 나중에 되살릴 수 있어요."
            action={{ label: "내리기", busyLabel: "내리는 중…", danger: true }}
            onSubmit={(reason) => apply(deleteProductByAdmin(product.id, reason), "상품을 내렸어요.")} />
        : product.deletedByAdmin
          ? <AdminReasonForm key="restore" title="되살리기" hint="목록과 검색에 다시 보여요."
              action={{ label: "되살리기", busyLabel: "되살리는 중…" }}
              onSubmit={(reason) => apply(restoreProduct(product.id, reason), "상품을 되살렸어요.")} />
          : <p className={styles.note + " " + styles.handleNote}>판매자가 직접 지운 상품이라 되살릴 수 없어요.</p>}
    </>}
  </Modal>;
}
