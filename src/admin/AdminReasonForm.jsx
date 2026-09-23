import { useState } from "react";
import { toast } from "../toast.js";
import styles from "./AdminList.module.css";

/**
 * 이유를 적어야 누를 수 있는 조치(정지·해제·내리기·되살리기). 신고 처리와 같은 규칙이다 — 이유 없는 기록은 뜻이 없다.
 *
 * @param action  { label, busyLabel, danger } 누를 버튼 하나
 * @param onSubmit (reason) => Promise. 실패하면 던진다(오류 문구는 여기서 알린다)
 */
export default function AdminReasonForm({ title, hint, action, onSubmit }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!reason.trim()) { toast.error("조치 이유를 적어 주세요."); return; }
    setBusy(true);
    try {
      await onSubmit(reason);
      setReason("");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <form className={styles.handle} aria-label={title} onSubmit={submit}>
    <h3 className={styles.sectionTitle}>{title}</h3>
    {hint && <p className={styles.note}>{hint}</p>}
    <label className={styles.reason}>조치 이유
      <textarea value={reason} maxLength={500} rows={3} placeholder="왜 그렇게 판단했는지 적어 주세요. 기록으로 남습니다."
        onChange={(event) => setReason(event.target.value)} />
    </label>
    <div className={styles.buttons}>
      <button type="submit" className={"btn " + (action.danger ? "btn-danger" : "btn-primary")} disabled={busy}>
        {busy ? action.busyLabel : action.label}</button>
    </div>
  </form>;
}
