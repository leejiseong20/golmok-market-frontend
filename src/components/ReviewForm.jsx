import { useId, useRef, useState } from "react";
import { createReview } from "../api/reviewApi.js";
import Modal from "./Modal.jsx";
import styles from "./ReviewForm.module.css";

export default function ReviewForm({ tradeId, nickname, onClose, onSaved }) {
  const id = useId();
  const [score, setScore] = useState("");
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);
  const busy = useRef(false);

  async function submit(event) {
    event.preventDefault();
    if (busy.current || finished) return;
    busy.current = true; setPending(true); setError("");
    try {
      await createReview(tradeId, { score: Number(score), content: content.trim() || null });
      setFinished(true);
    } catch (error) {
      if (error.code === "ALREADY_REVIEWED") setFinished(true);
      else setError(error.message);
    } finally {
      busy.current = false; setPending(false);
    }
  }

  return <Modal title="후기 남기기" busy={pending} onClose={finished ? onSaved : onClose}>
    {finished ? <div className={styles.form}>
      <p role="status">후기가 등록되어 있어요. 상대방의 매너온도에 반영됐습니다.</p>
      <button className={styles.submit} onClick={onSaved}>확인</button>
    </div> : <form className={styles.form} onSubmit={submit}>
      <p><strong>{nickname}</strong>님과의 거래는 어땠나요?</p>
      <div className={styles.field}><label htmlFor={`${id}-score`}>평점</label><select id={`${id}-score`} value={score} onChange={(event) => setScore(event.target.value)} required disabled={pending}>
        <option value="" disabled>평점을 선택해 주세요</option>
        <option value="5">5점 · 매우 좋았어요</option><option value="4">4점 · 좋았어요</option>
        <option value="3">3점 · 보통이에요</option><option value="2">2점 · 아쉬웠어요</option>
        <option value="1">1점 · 매우 아쉬웠어요</option>
      </select></div>
      <label>후기 (선택)<textarea value={content} maxLength={500} rows={5} disabled={pending}
        onChange={(event) => setContent(event.target.value)} placeholder="거래 경험을 이웃에게 알려 주세요." /></label>
      <span className={styles.hint}>{content.length}/500자</span>
      <p className={styles.hint}>등록 즉시 공개되며 수정하거나 삭제할 수 없어요. 개인정보는 적지 말아 주세요.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.submit} disabled={pending || !score}>{pending ? "등록 중…" : "후기 등록"}</button>
    </form>}
  </Modal>;
}
