import { useEffect, useId, useRef, useState } from "react";
import { withdrawMe } from "../api/userApi.js";
import Modal from "./Modal.jsx";
import styles from "./WithdrawForm.module.css";

/**
 * 회원 탈퇴 창. 되돌릴 수 없으므로 무엇이 사라지는지 먼저 보여주고, 비밀번호와 동의를 모두 받아야 버튼이 열린다.
 *
 * 비밀번호 오류는 입력칸 옆에, 진행 중 거래(409) 같은 나머지 오류는 아래에 서버 문구 그대로 보여준다.
 * 요청 중에는 닫기와 중복 제출을 막는다.
 */
export default function WithdrawForm({ onClose, onWithdrawn }) {
  const id = useId();
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const alive = useRef(true);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function submit(event) {
    event.preventDefault();
    if (pending.current || !password || !agreed) return;
    pending.current = true; setBusy(true); setError(""); setPasswordError("");
    try {
      await withdrawMe(password);
      if (alive.current) onWithdrawn();
    } catch (e) {
      if (!alive.current) return;
      if (e.code === "PASSWORD_MISMATCH") setPasswordError(e.message);
      else setError(e.message);
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return <Modal title="회원 탈퇴" busy={busy} onClose={onClose}>
    <form className={styles.form} onSubmit={submit}>
      <p className={styles.lead}>탈퇴하면 되돌릴 수 없어요. 아래 내용을 확인해 주세요.</p>
      <ul className={styles.list}>
        <li>판매 중인 상품이 모두 삭제돼요.</li>
        <li>찜한 상품·알림·인증한 동네가 지워져요.</li>
        <li>모든 채팅방에서 나가요. 상대에게는 대화가 남고 더는 메시지를 받을 수 없어요.</li>
        <li>거래·후기 기록은 이름 없이 "탈퇴한사용자"로 남아요.</li>
        <li>예약 중인 거래가 있으면 먼저 채팅방에서 취소하거나 완료해야 해요.</li>
      </ul>

      <div className={styles.field}>
        <label htmlFor={`${id}-password`}>비밀번호 확인</label>
        <input id={`${id}-password`} type="password" autoComplete="current-password" value={password} disabled={busy}
          aria-invalid={passwordError ? "true" : undefined} aria-describedby={passwordError ? `${id}-password-error` : undefined}
          onChange={(event) => { setPassword(event.target.value); setPasswordError(""); }} />
        {passwordError && <span id={`${id}-password-error`} className={styles.fieldError} role="alert">{passwordError}</span>}
      </div>

      <label className={styles.agree}>
        <input type="checkbox" checked={agreed} disabled={busy} onChange={(event) => setAgreed(event.target.checked)} />
        위 내용을 확인했고, 탈퇴에 동의해요.
      </label>

      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onClose} disabled={busy}>취소</button>
        <button className={styles.danger} disabled={busy || !password || !agreed}>{busy ? "처리 중…" : "탈퇴하기"}</button>
      </div>
    </form>
  </Modal>;
}
