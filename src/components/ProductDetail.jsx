import { useEffect, useRef, useState } from "react";
import { bumpProduct, changeProductStatus, deleteProduct } from "../api/productApi.js";
import { formatPrice, relativeTime, statusLabel } from "../data/format.js";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import Lightbox from "./Lightbox.jsx";
import Modal from "./Modal.jsx";
import { toast } from "../toast.js";
import styles from "./Modal.module.css";

const STATUS_OPTIONS = [
  { value: "ON_SALE", label: "판매중" },
  { value: "RESERVED", label: "예약중" },
  { value: "SOLD", label: "판매완료" },
];

export default function ProductDetail({ detail, onClose, onRetry, onEdit, onChanged, onDeleted, onStartChat, onOpenProfile, onToggleFavorite, onReport }) {
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [failedImages, setFailedImages] = useState(() => new Set());
  const track = useRef(null);
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
  const count = product?.images.length ?? 0;

  /**
   * 사진은 가로 한 줄(스크롤 스냅)이다. 모바일은 손가락으로 넘기고(브라우저 기본 스크롤이라 관성·되돌아옴이 자연스럽다),
   * PC 는 가로 스크롤을 막고 ← → 버튼으로 옮긴다. 몇 번째인지는 어느 쪽이든 스크롤 위치에서 읽는다.
   */
  const frame = useRef(0);
  const settleTimer = useRef(0);
  const touching = useRef(false);
  useEffect(() => () => { cancelAnimationFrame(frame.current); clearTimeout(settleTimer.current); }, []);

  function nearest(node) {
    return Math.min(count - 1, Math.max(0, Math.round(node.scrollLeft / node.clientWidth)));
  }
  /**
   * PC 화살표. 부드러운 이동은 여기서만 한다 — CSS 의 scroll-behavior: smooth 를 줄 전체에 걸면
   * 모바일에서 손을 뗀 뒤 스냅까지 그 애니메이션이 가로채 뚝뚝 끊겼다.
   */
  function showPhoto(next) {
    const node = track.current;
    if (node) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      node.scrollTo({ left: next * node.clientWidth, behavior: reduce ? "auto" : "smooth" });
    }
    setIndex(next);
  }
  /**
   * 스크롤이 멈췄는데 사진 경계에 맞지 않으면 가장 가까운 사진으로 맞춘다.
   * iOS 는 스크롤되는 창(모달) 안의 가로 스냅을 대각선 스와이프 등에서 가끔 놓쳐, 앞 사진이 걸친 채 멈췄다(실제 아이폰 캡처).
   * 손가락이 닿아 있는 동안에는 건드리지 않는다.
   */
  function settle() {
    const node = track.current;
    if (!node || !node.clientWidth || touching.current) return;
    const target = nearest(node) * node.clientWidth;
    if (Math.abs(node.scrollLeft - target) > 1) node.scrollTo({ left: target, behavior: "smooth" });
  }
  // 몇 번째 사진인지는 한 프레임에 한 번만 계산한다(스크롤 이벤트는 그보다 자주 온다).
  function onTrackScroll() {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const node = track.current;
      if (!node || !node.clientWidth) return;
      const current = nearest(node);
      setIndex((old) => old === current ? old : current);
    });
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(settle, 150);
  }
  // 크게 보기에서 넘긴 사진으로 돌아왔을 때 줄도 그 사진에 맞춘다.
  useEffect(() => {
    const node = track.current;
    if (node && Math.round(node.scrollLeft / (node.clientWidth || 1)) !== index) node.scrollTo({ left: index * node.clientWidth, behavior: "instant" });
  }, [zoomed]);
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
      {count === 0
        ? <div className={styles.gallery}><span>사진을 표시할 수 없습니다</span></div>
        : <div className={styles.track} ref={track} onScroll={onTrackScroll}
            onTouchStart={() => { touching.current = true; }}
            onTouchEnd={() => { touching.current = false; clearTimeout(settleTimer.current); settleTimer.current = setTimeout(settle, 150); }}
            onTouchCancel={() => { touching.current = false; }}>
            {product.images.map((photo, photoIndex) => failedImages.has(photo.id)
              ? <div key={photo.id} className={styles.gallery}><span>사진을 표시할 수 없습니다</span></div>
              : <button key={photo.id} type="button" className={styles.gallery} tabIndex={photoIndex === index ? 0 : -1}
                  onClick={() => { setIndex(photoIndex); setZoomed(true); }} aria-label={`사진 ${photoIndex + 1} 크게 보기`}>
                  {/* 모두 처음부터 받는다(최대 10장). 넘기는 도중에 받기 시작하면 빈 칸이 지나가고 큰 사진 해독이 스와이프와 겹친다. */}
                  <img src={photo.imageUrl} alt={`${product.title} 사진 ${photoIndex + 1}`} decoding="async"
                    onError={() => setFailedImages((old) => new Set(old).add(photo.id))} />
                </button>)}
          </div>}
      {count > 1 && <div className={styles.pager}>
        <button className={styles.pagerArrow} onClick={() => showPhoto(index - 1)} disabled={index === 0} aria-label="이전 사진">←</button>
        {/* 몇 번째 사진인지 점으로 보인다. 지금 사진의 점은 색과 길이로 구분한다(색각 차이). */}
        <span className={styles.dots} aria-hidden="true">
          {product.images.map((photo, photoIndex) => <span key={photo.id} className={styles.dot + (photoIndex === index ? " " + styles.dotOn : "")} />)}
        </span>
        <span className="sr-only" aria-live="polite">{count}장 중 {index + 1}번째 사진</span>
        <button className={styles.pagerArrow} onClick={() => showPhoto(index + 1)} disabled={index === count - 1} aria-label="다음 사진">→</button>
      </div>}
      {/* 누가 파는지를 먼저 본다. 판매자는 사진 바로 아래다. */}
      <div className={styles.seller}>
        <Avatar url={product.seller.profileImageUrl} name={product.seller.nickname} size={44} />
        <div className={styles.sellerInfo}>
          <button onClick={() => onOpenProfile(product.seller.id)} aria-label="판매자 프로필 보기"><strong>{product.seller.nickname}</strong></button>
          <span>매너온도 {Number(product.seller.mannerTemp).toFixed(1)}°C</span>
        </div>
      </div>
      <h3 className={styles.productTitle}>{product.title}</h3>
      <p className={styles.detailMeta}>{product.categoryName} · {product.regionName} · {relativeTime(product.bumpedAt ?? product.createdAt)}</p>
      {/* 판매중은 기본 상태라 목록 카드처럼 표시하지 않는다. */}
      <p className={styles.tags}>
        {product.status !== "ON_SALE" && <span className={styles.tag + " " + styles.tagStrong}>{statusLabel(product.status)}</span>}
        <span className={styles.tag}>{product.tradeType === "DIRECT" ? "직거래" : "택배거래"}</span>
      </p>
      {/* 사는 사람은 가격을 아래 고정 바에서 본다. 내 상품에는 바가 없어 여기 둔다. */}
      {product.isMine && <p className={styles.price}><span>{formatPrice(product.price)}</span>
        {product.isNegotiable && <small className={styles.negotiable}>가격 제안 가능</small>}</p>}
      <p className={styles.description}>{product.description}</p>
      <p className={styles.detailMeta}>조회 {product.viewCount} · 채팅 {product.chatCount} · 관심 {product.favoriteCount}</p>
      {/* 신고는 드문 동작이라 조용한 글자 링크로 둔다. 판매자 신고·차단은 프로필에서 한다. */}
      {!product.isMine && <button type="button" className={styles.reportLink} onClick={() => onReport(product)}>
        이 게시글 신고하기</button>}

      {product.isMine && <section className={styles.manage} aria-label="내 상품 관리">
        {error && <p className={styles.error} role="alert">{error}</p>}
        {/* 상태는 셋 중 하나를 고르는 것이라 버튼 셋 대신 한 줄 선택이다. 판매완료는 되돌릴 수 없어 확인을 받는다. */}
        <div className="seg" role="group" aria-label="판매 상태">
          {STATUS_OPTIONS.map((option) => <button key={option.value} type="button" className="seg-item"
            aria-pressed={product.status === option.value}
            disabled={pending !== "" || product.status === "SOLD" || product.status === option.value}
            onClick={() => {
              if (option.value === "SOLD" && !window.confirm("판매완료로 변경할까요? 판매중으로 되돌릴 수 없습니다.")) return;
              act("status", option.value);
            }}>{option.label}</button>)}
        </div>
        {product.status !== "SOLD" && <>
          <div className={styles.actions}>
            <button className={styles.secondary} disabled={pending !== ""} onClick={() => onEdit(product)}>수정하기</button>
            <button className={styles.secondary} disabled={pending !== ""} onClick={() => act("bump")}>끌어올리기</button>
          </div>
          <p className={styles.note}>끌어올리기는 등록 또는 마지막 끌어올리기 후 24시간마다 가능해요.</p>
        </>}
        {/* 삭제는 드물고 되돌릴 수 없어 버튼 줄에서 빼 맨 아래 위험 색 글자로 둔다. */}
        <button type="button" className={styles.deleteLink} disabled={pending !== ""} onClick={() => act("delete")}>상품 삭제하기</button>
      </section>}

      {/* 사는 사람이 할 일은 찜과 채팅 둘이다. 설명이 길어도 늘 보이게 화면 아래에 붙인다. */}
      {!product.isMine && <div className={styles.buyBar}>
        {error && <p className={styles.buyError} role="alert">{error}</p>}
        <button className={styles.buyLike + (product.isLiked ? " " + styles.buyLikeOn : "")}
          disabled={pending === "favorite"} onClick={favorite} aria-pressed={product.isLiked}
          aria-label={`관심 ${product.favoriteCount}`}>
          <Icon name="heart" size={22} filled={product.isLiked} />
        </button>
        <div className={styles.buyPrice}>
          <strong>{formatPrice(product.price)}</strong>
          <span>{product.isNegotiable ? "가격 제안 가능" : "가격 제안 불가"}</span>
        </div>
        <button className={styles.primary} disabled={pending === "chat"} onClick={startChat}>{pending === "chat" ? "여는 중…" : "채팅하기"}</button>
      </div>}
      {zoomed && image && <Lightbox images={product.images} index={index} title={product.title}
        onMove={setIndex} onClose={() => setZoomed(false)} />}
    </>}
  </Modal>;
}
