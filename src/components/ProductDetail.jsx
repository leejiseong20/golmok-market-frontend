import { useState } from "react";
import { formatDate, formatPrice, statusLabel } from "../data/format.js";
import Modal from "./Modal.jsx";
import styles from "./Modal.module.css";

export default function ProductDetail({ detail, onClose, onRetry }) {
  const [index, setIndex] = useState(0);
  const [failedImage, setFailedImage] = useState(null);
  const product = detail.data;
  const image = product?.images[index];
  return <Modal title="상품 상세" onClose={onClose}>
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
    </>}
  </Modal>;
}
