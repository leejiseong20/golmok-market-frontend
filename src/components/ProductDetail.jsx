import { useEffect, useRef, useState } from "react";
import { bumpProduct, changeProductStatus, deleteProduct } from "../api/productApi.js";
import { formatDate, formatPrice, statusLabel } from "../data/format.js";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import Lightbox from "./Lightbox.jsx";
import Modal from "./Modal.jsx";
import { toast } from "../toast.js";
import styles from "./Modal.module.css";

export default function ProductDetail({ detail, onClose, onRetry, onEdit, onChanged, onDeleted, onStartChat, onOpenProfile, onToggleFavorite }) {
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [failedImage, setFailedImage] = useState(null);
  /**
   * 지금 진행 중인 동작("chat" · "favorite" · "manage").
   * 하나의 불리언으로 두면 찜을 누른 동안에도 채팅 버튼 글자가 "채팅방 여는 중…"으로 바뀌어
   * 폭이 달라지고 옆의 찜 버튼이 밀렸다(누를 때 버튼이 튀는 현상).
   */
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const product = detail.data;
  const image = product?.images[index];
  async function act(kind, status) {
    if (busy.current) return;
    if (kind === "delete" && !window.confirm("상품을 삭제할까요? 삭제한 상품은 목록에서 사라집니다.")) return;
    busy.current = true; setPending("manage"); setError("");
    try {
      if (kind === "delete") { await deleteProduct(product.id); if (alive.current) onDeleted(product.id); }
      else if (kind === "status") {
        const updated = await changeProductStatus(product.id, status);
        if (alive.current) { onChanged(updated); toast.success("상품 상태를 변경했어요."); }
      } else {
        await bumpProduct(product.id);
        if (alive.current) { onChanged(product); toast.success("상품을 끌어올렸어요."); }
      }
    } catch (e) { if (alive.current) setError(e.message); }
    finally { busy.current = false; if (alive.current) setPending(""); }
  }
  /**
   * 찜하기·해제. 목록에서 버튼을 없애고 이 화면으로 옮겼다.
   * 서버가 돌려준 값만 반영하므로(App.toggleFavorite) 여기서는 중복 클릭만 막는다.
   * 비로그인이면 App 이 로그인 창을 연다.
   */
  async function favorite() {
    if (busy.current) return;
    busy.current = true; setPending("favorite"); setError("");
    try { await onToggleFavorite(product); }
    finally { busy.current = false; if (alive.current) setPending(""); }
  }

  // 성공하면 App 이 채팅 화면으로 옮기며 이 모달을 닫는다. 실패하면 서버 메시지를 여기서 보여준다.
  async function startChat() {
    if (busy.current) return;
    busy.current = true; setPending("chat"); setError("");
    try { await onStartChat(product); }
    catch (e) { if (alive.current) setError(e.message); }
    finally { busy.current = false; if (alive.current) setPending(""); }
  }
  // 찜은 한 번 더 누르면 되돌릴 수 있는 동작이라 요청 중에도 창을 닫을 수 있게 둔다.
  return <Modal title="상품 상세" busy={pending === "chat" || pending === "manage"} onClose={() => { if (!busy.current) onClose(); }}>
    {detail.loading && <p role="status">상품을 불러오고 있어요…</p>}
    {detail.error && <><p className={styles.error} role="alert">{detail.error}</p>
      <div className={styles.actions}><button className={styles.secondary} onClick={onRetry}>다시 시도</button></div></>}
    {product && <>
      {image && failedImage !== image.id
        ? <button type="button" className={styles.gallery} onClick={() => setZoomed(true)} aria-label="사진 크게 보기">
            <img src={image.imageUrl} alt={`${product.title} 사진 ${index + 1}`} onError={() => setFailedImage(image.id)} />
          </button>
        : <div className={styles.gallery}><span>사진을 표시할 수 없습니다</span></div>}
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
      {/* 관심 수는 아래 찜 버튼이 보여 주므로 여기서는 빼고 조회·채팅만 둔다. */}
      <p className={styles.note}>조회 {product.viewCount} · 채팅 {product.chatCount}</p>
      <p className={styles.note}>등록 {formatDate(product.createdAt)}</p>
      <div className={styles.seller}>
        <Avatar url={product.seller.profileImageUrl} name={product.seller.nickname} size={44} />
        <div className={styles.sellerInfo}>
          <button onClick={() => onOpenProfile(product.seller.id)} aria-label="판매자 프로필 보기"><strong>{product.seller.nickname}</strong></button>
          <span>매너온도 {Number(product.seller.mannerTemp).toFixed(1)}°C</span>
        </div>
      </div>
      {!product.isMine && <section aria-label="판매자와 대화">
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          <button className={styles.primary} disabled={pending === "chat"} onClick={startChat}>{pending === "chat" ? "채팅방 여는 중…" : "채팅하기"}</button>
          <button className={styles.favorite + (product.isLiked ? " " + styles.favoriteOn : "")}
            disabled={pending === "favorite"} onClick={favorite} aria-pressed={product.isLiked}>
            <Icon name="heart" size={17} filled={product.isLiked} /> 관심 {product.favoriteCount}
          </button>
        </div>
      </section>}
      {product.isMine && <p className={styles.note}>관심 {product.favoriteCount}</p>}
      {product.isMine && <section aria-label="내 상품 관리">
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          {product.status !== "SOLD" && <>
            <button className={styles.secondary} disabled={pending !== ""} onClick={() => onEdit(product)}>수정하기</button>
            <button className={styles.secondary} disabled={pending !== ""} onClick={() => act("bump")}>끌어올리기</button>
            <button className={styles.secondary} disabled={pending !== ""} onClick={() => act("status", product.status === "ON_SALE" ? "RESERVED" : "ON_SALE")}>{product.status === "ON_SALE" ? "예약중으로 변경" : "판매중으로 변경"}</button>
            <button className={styles.secondary} disabled={pending !== ""} onClick={() => {
              if (window.confirm("판매완료로 변경할까요? 판매중으로 되돌릴 수 없습니다.")) act("status", "SOLD");
            }}>판매완료로 변경</button>
          </>}
          <button className={styles.secondary} disabled={pending !== ""} onClick={() => act("delete")}>삭제하기</button>
        </div>
        {product.status !== "SOLD" && <p className={styles.note}>끌어올리기는 등록 또는 마지막 끌어올리기 후 24시간마다 가능해요.</p>}
      </section>}
      {zoomed && image && <Lightbox images={product.images} index={index} title={product.title}
        onMove={setIndex} onClose={() => setZoomed(false)} />}
    </>}
  </Modal>;
}
