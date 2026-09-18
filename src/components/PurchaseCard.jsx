import { useState } from "react";
import { formatPrice, formatDate, tradeStatusLabel } from "../data/format.js";
import { thumbnailUrl } from "../api/imageUrl.js";
import styles from "./PurchaseCard.module.css";

export default function PurchaseCard({ purchase, onOpenProduct, onConfirm, onReview }) {
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const { product, seller } = purchase;

  async function confirm() {
    if (pending) return;
    setPending(true);
    try {
      await onConfirm(purchase);
    } finally {
      setPending(false);
    }
  }

  return <article className={styles.card}>
    <div className={styles.head}>
      <span className={styles.status + " " + (styles[purchase.status.toLowerCase()] ?? "")}>
        {tradeStatusLabel(purchase.status)}
      </span>
      <span className={styles.date}>{formatDate(purchase.createdAt)}</span>
    </div>

    <div className={styles.body}>
      {/* 삭제된 상품은 상세로 갈 수 없다. 기록은 남기되 링크만 막는다. */}
      <button className={styles.product} onClick={() => onOpenProduct(product.id)} disabled={product.deleted}
        aria-label={product.title + (product.deleted ? " (삭제된 상품)" : " 상세 보기")}>
        <div className={styles.media}>
          {product.thumbnailUrl && !failed
            ? <img src={thumbnailUrl(product.thumbnailUrl)} alt="" loading="lazy" onError={() => setFailed(true)} />
            : <span className={styles.slot}>사진 없음</span>}
        </div>
        <div className={styles.info}>
          <h2 className={styles.title}>{product.title}</h2>
          <p className={styles.price}>{formatPrice(purchase.amount)}</p>
          <p className={styles.meta}>{seller.nickname}{product.deleted && " · 삭제된 상품"}</p>
        </div>
      </button>
    </div>

    {(purchase.canConfirm || purchase.completedAt) && <div className={styles.foot}>
      {purchase.canReview && <button className={styles.confirm} onClick={() => onReview(purchase)}>후기 남기기</button>}
      {purchase.canConfirm
        ? <button className={styles.confirm} onClick={confirm} disabled={pending}>
            {pending ? "처리 중…" : "구매확정"}</button>
        : <span className={styles.done}>{formatDate(purchase.completedAt)} 확정</span>}
    </div>}
  </article>;
}
