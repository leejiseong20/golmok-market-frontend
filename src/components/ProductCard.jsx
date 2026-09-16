import { useState } from "react";
import { formatPrice, relativeTime, statusLabel } from "../data/format.js";
import styles from "./ProductCard.module.css";

export default function ProductCard({ product, onOpen, onToggleFavorite }) {
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    setPending(true);
    try {
      await onToggleFavorite(product);
    } finally {
      setPending(false);
    }
  }

  // 찜 버튼을 카드 버튼 밖에 둔다. button 안에 button 을 넣으면 유효하지 않은 HTML 이고
  // 브라우저마다 클릭 동작이 달라진다.
  return <article className={styles.wrap}>
    <button className={styles.card} onClick={onOpen} aria-label={product.title + " 상세 보기"}>
      <div className={styles.media}>
        {product.thumbnailUrl && !failed
          ? <img src={product.thumbnailUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
          : <span className={styles.slot}>사진 없음</span>}
      </div>
      <div className={styles.body}>
        <h3 className={styles.title}>{product.title}</h3><p className={styles.price}>{formatPrice(product.price)}</p>
        <p className={styles.meta}>{product.regionName} · {relativeTime(product.bumpedAt)}</p>
        <span className={styles.meta}>{statusLabel(product.status)}</span>
        <div className={styles.counts}><span>관심 {product.favoriteCount}</span><span>채팅 {product.chatCount}</span></div>
      </div>
    </button>
    <button type="button" onClick={toggle} disabled={pending}
      className={styles.like + (product.isLiked ? " " + styles.liked : "")}
      aria-pressed={product.isLiked}
      aria-label={product.title + (product.isLiked ? " 관심 해제" : " 관심 등록")}>
      {product.isLiked ? "♥" : "♡"}
    </button>
  </article>;
}
