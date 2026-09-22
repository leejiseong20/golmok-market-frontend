import { useId, useRef, useState } from "react";
import { login, signup } from "../api/authApi.js";
import Modal from "./Modal.jsx";
import styles from "./Modal.module.css";

export default function AuthModal({ onClose }) {
  const [mode, setMode] = useState("login");
  const [fields, setFields] = useState({ email: "", password: "", nickname: "" });
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  /**
   * 로그인 상태 유지. 켜면 localStorage 에, 끄면 sessionStorage 에 세션을 둔다(탭을 닫으면 사라진다).
   * 기본값을 켬으로 둔다. 대부분 개인 기기에서 쓰고, 매번 다시 로그인하는 마찰이 컸다.
   * 공용 PC 에서는 끄면 된다.
   */
  const [remember, setRemember] = useState(true);
  const isSignup = mode === "signup";
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    setError(""); setErrors({}); setMessage("");
    if (isSignup && !/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9])[!-~]{8,64}$/.test(fields.password)) {
      setErrors({ password: "영문·숫자·특수문자를 포함한 8~64자로 입력해 주세요. 공백·한글은 사용할 수 없습니다." });
      return;
    }
    pending.current = true; setBusy(true);
    try {
      const email = fields.email.trim();
      if (isSignup) {
        await signup({ ...fields, email, nickname: fields.nickname.trim() });
        setMode("login"); setFields((old) => ({ ...old, password: "" }));
        setMessage("가입이 완료됐습니다. 로그인해 주세요.");
      } else {
        await login({ email, password: fields.password }, { remember });
        onClose();
      }
    } catch (failure) {
      setError(failure.message);
      const fieldErrors = Object.fromEntries((failure.errors ?? []).map(({ field, reason }) => [field, reason]));
      if (failure.code === "DUPLICATE_EMAIL") fieldErrors.email = failure.message;
      if (failure.code === "DUPLICATE_NICKNAME") fieldErrors.nickname = failure.message;
      setErrors(fieldErrors);
    } finally { pending.current = false; setBusy(false); }
  }
  /**
   * 라벨에는 항목 이름만 둔다. 오류는 라벨 밖에 두고 aria-describedby 로 잇는다(2026-09-22).
   * 라벨 안에 두면 오류가 뜨는 순간 칸 이름이 "이메일 이미 사용 중인 이메일입니다"로 바뀌고, 보조기기는 오류를 두 번 읽었다.
   */
  const uid = useId();
  function field(name, label, props) {
    const id = `${uid}-${name}`;
    return <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} value={fields[name]} onChange={(e) => setFields({ ...fields, [name]: e.target.value })}
        disabled={busy} required aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `${id}-error` : undefined} {...props} />
      {errors[name] && <span className={styles.fieldError} id={`${id}-error`}>{errors[name]}</span>}
    </div>;
  }
  return <Modal title={isSignup ? "회원가입" : "로그인"} onClose={onClose} busy={busy}>
    <p className={styles.note}>가까운 이웃과 골목마켓을 시작해 보세요.</p>
    {message && <p className={styles.success} role="status">{message}</p>}
    <form className={styles.form} onSubmit={submit}>
      {field("email", "이메일", { type: "email", maxLength: 100, autoComplete: "username" })}
      {field("password", "비밀번호", { type: "password", maxLength: 64, autoComplete: isSignup ? "new-password" : "current-password" })}
      {isSignup && field("nickname", "닉네임", { minLength: 2, maxLength: 30, autoComplete: "nickname" })}
      {!isSignup && <label className={styles.remember}>
        <input type="checkbox" checked={remember} disabled={busy} onChange={(event) => setRemember(event.target.checked)} />
        로그인 상태 유지
        <span className={styles.rememberNote}>공용 PC 에서는 꺼 주세요</span>
      </label>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.primary} disabled={busy}>{busy ? "처리 중…" : isSignup ? "가입하기" : "로그인하기"}</button>
    </form>
    <button className={styles.switch} disabled={busy} onClick={() => {
      setMode(isSignup ? "login" : "signup"); setError(""); setErrors({}); setMessage("");
    }}>{isSignup ? "이미 계정이 있어요 · 로그인" : "처음 오셨나요? 회원가입"}</button>
  </Modal>;
}
