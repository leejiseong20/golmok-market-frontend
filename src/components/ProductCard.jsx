import { useState } from "react";
import { formatPrice, relativeTime, statusLabel } from "../data/format.js";
import Icon from "./Icon.jsx";
import { thumbnailUrl } from "../api/imageUrl.js";
import styles from "./ProductCard.module.css";

/**
 * 상품 카드.
 *
 * 홈 목록에서는 찜 버튼을 두지 않는다. 찜 수는 하트 아이콘 옆 숫자로 보여 주기만 하고,
 * 찜하기·해제는 상품을 열어 상세에서 한다(목록에서는 카드 전체가 하나의 클릭 대상이 된다).
 * 마이페이지 "찜한 상품" 탭만 예외로 onToggleFavorite 를 받아 바로 해제할 수 있다.
 */
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
          ? <img src={thumbnailUrl(product.thumbnailUrl)} alt="" loading="lazy" onError={() => setFailed(true)} />
          : <span className={styles.slot}>사진 없음</span>}
      </div>
      <div className={styles.body}>
        <h2 className={styles.title}>{product.title}</h2><p className={styles.price}>{formatPrice(product.price)}</p>
        {/* 판매중은 기본 상태라 표시하지 않는다. 예약중·판매완료만 눈에 띄면 된다. */}
        <p className={styles.meta}>
          {product.status !== "ON_SALE" && <span className={styles.badge}>{statusLabel(product.status)}</span>}
          {product.regionName} · {relativeTime(product.bumpedAt)}
        </p>
        <div className={styles.counts}>
          <span className={styles.count + (product.isLiked ? " " + styles.liked : "")}>
            <Icon name="heart" size={14} filled={product.isLiked} />
            <span className="sr-only">관심 </span>{product.favoriteCount}
          </span>
          <span className={styles.count}>
            <Icon name="chat" size={14} />
            <span className="sr-only">채팅 </span>{product.chatCount}
          </span>
        </div>
      </div>
    </button>
    {onToggleFavorite && <button type="button" onClick={toggle} disabled={pending}
      className={styles.like + (product.isLiked ? " " + styles.liked : "")}
      aria-pressed={product.isLiked}
      aria-label={product.title + (product.isLiked ? " 관심 해제" : " 관심 등록")}>
      <Icon name="heart" size={17} filled={product.isLiked} />
    </button>}
  </article>;
}
