import { useEffect, useRef, useState } from "react";
import { bumpProduct, changeProductStatus, deleteProduct } from "../api/productApi.js";
import { formatDate, formatPrice, statusLabel } from "../data/format.js";
import Modal from "./Modal.jsx";
import styles from "./Modal.module.css";

export default function ProductDetail({ detail, onClose, onRetry, onEdit, onChanged, onDeleted, onStartChat }) {
  const [index, setIndex] = useState(0);
  const [failedImage, setFailedImage] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const product = detail.data;
  const image = product?.images[index];
  async function act(kind, status) {
    if (busy.current) return;
    if (kind === "delete" && !window.confirm("상품을 삭제할까요? 삭제한 상품은 목록에서 사라집니다.")) return;
    busy.current = true; setPending(true); setError(""); setNotice("");
    try {
      if (kind === "delete") { await deleteProduct(product.id); if (alive.current) onDeleted(product.id); }
      else if (kind === "status") {
        const updated = await changeProductStatus(product.id, status);
        if (alive.current) { onChanged(updated); setNotice("상품 상태를 변경했어요."); }
      } else {
        await bumpProduct(product.id);
        if (alive.current) { onChanged(product); setNotice("상품을 끌어올렸어요."); }
      }
    } catch (e) { if (alive.current) setError(e.message); }
    finally { busy.current = false; if (alive.current) setPending(false); }
  }
  // 성공하면 App 이 채팅 화면으로 옮기며 이 모달을 닫는다. 실패하면 서버 메시지를 여기서 보여준다.
  async function startChat() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try { await onStartChat(product); }
    catch (e) { if (alive.current) setError(e.message); }
    finally { busy.current = false; if (alive.current) setPending(false); }
  }
  return <Modal title="상품 상세" busy={pending} onClose={() => { if (!busy.current) onClose(); }}>
    {detail.loading && <p role="status">상품을 불러오고 있어요…</p>}
    {detail.error && <><p className={styles.error} role="alert">{detail.error}</p>
      <div className={styles.actions}><button className={styles.secondary} onClick={onRetry}>다시 시도</button></div></>}
    {product && <>
      <div className={styles.gallery}>{image && failedImage !== image.id
        ? <img src={image.imageUrl} alt={`${product.title} 사진 ${index + 1}`} onError={() => setFailedImage(image.id)} />
        : <span>사진을 표시할 수 없습니다</span>}</div>
      {product.images.length > 1 && <div className={styles.pager}>
        <button className={styles.secondary} onClick={() => setIndex(index - 1)} disabled={index === 0} aria-label="이전 사진">←</button>
        <span>{index + 1} / {product.images.length}</span>
        <button className={styles.secondary} onClick={() => setIndex(index + 1)} disabled={index === product.images.length - 1} aria-label="다음 사진">→</button>
      </div>}
      <h3 className={styles.productTitle}>{product.title}</h3>
      <p className={styles.note}>{product.categoryName} · {product.regionName}</p>
      <span className={styles.tag}>{statusLabel(product.status)}</span>
      <span className={styles.tag}>{product.tradeType === "DIRECT" ? "직거래" : "택배거래"}</span>
      {product.isMine && <span className={styles.tag}>내 상품</span>}
      <p className={styles.price}>{formatPrice(product.price)}</p>
      {product.isNegotiable && <p className={styles.note}>가격 제안 가능</p>}
      <p className={styles.description}>{product.description}</p>
      <p className={styles.note}>조회 {product.viewCount} · 관심 {product.favoriteCount} · 채팅 {product.chatCount}
        {product.isLiked ? " · 관심 등록한 상품" : ""}</p>
      <p className={styles.note}>등록 {formatDate(product.createdAt)}</p>
      <div className={styles.seller}><strong>{product.seller.nickname}</strong><span>매너온도 {Number(product.seller.mannerTemp).toFixed(1)}°C</span></div>
      {!product.isMine && <section aria-label="판매자와 대화">
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          <button className={styles.primary} disabled={pending} onClick={startChat}>{pending ? "채팅방 여는 중…" : "채팅하기"}</button>
        </div>
      </section>}
      {product.isMine && <section aria-label="내 상품 관리">
        {error && <p className={styles.error} role="alert">{error}</p>}
        {notice && <p className={styles.success} role="status">{notice}</p>}
        <div className={styles.actions}>
          {product.status !== "SOLD" && <>
            <button className={styles.secondary} disabled={pending} onClick={() => onEdit(product)}>수정하기</button>
            <button className={styles.secondary} disabled={pending} onClick={() => act("bump")}>끌어올리기</button>
            <button className={styles.secondary} disabled={pending} onClick={() => act("status", product.status === "ON_SALE" ? "RESERVED" : "ON_SALE")}>{product.status === "ON_SALE" ? "예약중으로 변경" : "판매중으로 변경"}</button>
            <button className={styles.secondary} disabled={pending} onClick={() => {
              if (window.confirm("판매완료로 변경할까요? 판매중으로 되돌릴 수 없습니다.")) act("status", "SOLD");
            }}>판매완료로 변경</button>
          </>}
          <button className={styles.secondary} disabled={pending} onClick={() => act("delete")}>삭제하기</button>
        </div>
        {product.status !== "SOLD" && <p className={styles.note}>끌어올리기는 등록 또는 마지막 끌어올리기 후 24시간마다 가능해요.</p>}
      </section>}
    </>}
  </Modal>;
}
