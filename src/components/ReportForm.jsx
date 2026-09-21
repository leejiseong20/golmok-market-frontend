import { useId, useRef, useState } from "react";
import { REPORT_REASONS, report } from "../api/reportApi.js";
import Modal from "./Modal.jsx";
import styles from "./ReportForm.module.css";

/**
 * 신고 창. 상품·사용자 모두 이 창 하나로 받는다.
 *
 * 접수만 한다(서버가 자동으로 숨기거나 정지하지 않는다). 그래서 완료 문구도 "조치하겠다"고 약속하지 않는다.
 * 신고당한 사람에게는 알리지 않는다는 것을 화면에서도 밝혀 둔다 — 보복이 걱정돼 신고를 망설이지 않게.
 *
 * 신고한 뒤 그 사람을 계속 마주치고 싶지 않을 수 있다. onBlock 을 넘기면 완료 화면에서 바로 차단할 수 있다.
 */
export default function ReportForm({ targetType, targetId, targetName, onClose, onBlock }) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState("");
  const busy = useRef(false);

  // "기타"는 사유만으로는 아무 정보가 없다. 서버도 설명을 요구하므로 보내기 전에 막는다.
  const needsDetail = reason === "OTHER" && !detail.trim();

  async function submit(event) {
    event.preventDefault();
    if (busy.current || needsDetail) return;
    busy.current = true; setPending(true); setError("");
    try {
      await report({ targetType, targetId, reason, detail });
      setFinished("신고를 접수했어요. 알려 주셔서 고마워요.");
    } catch (failure) {
      // 이미 신고한 대상이면 다시 신고하게 두지 않고 완료 화면으로 보낸다. 사용자가 바랐던 결과는 이미 있다.
      if (failure.code === "ALREADY_REPORTED") setFinished("이미 신고한 대상이에요.");
      else setError(failure.message);
    } finally {
      busy.current = false; setPending(false);
    }
  }

  const title = targetType === "PRODUCT" ? "게시글 신고" : "사용자 신고";

  return <Modal title={title} busy={pending} onClose={onClose}>
    {finished ? <div className={styles.form}>
      <p role="status">{finished}</p>
      <p className={styles.hint}>신고한 사실은 상대에게 알려지지 않아요.</p>
      {onBlock && <p className={styles.hint}>이 사람과 더 이상 마주치고 싶지 않다면 차단할 수 있어요.</p>}
      <div className={styles.actions}>
        {onBlock && <button className={styles.secondary} onClick={onBlock}>차단하기</button>}
        <button className={styles.submit} onClick={onClose}>확인</button>
      </div>
    </div> : <form className={styles.form} onSubmit={submit}>
      <p><strong>{targetName}</strong>{targetType === "PRODUCT" ? " 게시글을" : "님을"} 신고하는 이유를 골라 주세요.</p>
      <fieldset className={styles.reasons} disabled={pending}>
        <legend className="sr-only">신고 사유</legend>
        {REPORT_REASONS.map((item) => <label key={item.value} className={styles.reason}>
          <input type="radio" name={`${id}-reason`} value={item.value} checked={reason === item.value}
            onChange={() => setReason(item.value)} required />
          <span>{item.label}</span>
        </label>)}
      </fieldset>
      <label>
        {reason === "OTHER" ? "어떤 점이 문제인가요?" : "자세한 내용 (선택)"}
        <textarea value={detail} maxLength={500} rows={4} disabled={pending}
          onChange={(event) => setDetail(event.target.value)}
          aria-describedby={`${id}-count`}
          placeholder="상황을 적어 주시면 확인에 도움이 돼요." />
      </label>
      <span className={styles.hint} id={`${id}-count`}>{detail.length}/500자</span>
      <p className={styles.hint}>신고한 사실은 상대에게 알려지지 않아요.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.submit} disabled={pending || !reason || needsDetail}>
        {pending ? "접수 중…" : "신고하기"}</button>
    </form>}
  </Modal>;
}
