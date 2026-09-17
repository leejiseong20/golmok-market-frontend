import { useEffect, useId, useRef, useState } from "react";
import { uploadImages } from "../api/imageApi.js";
import { updateMyProfile } from "../api/userApi.js";
import Avatar from "./Avatar.jsx";
import Modal from "./Modal.jsx";
import styles from "./ProfileForm.module.css";

const MIN = 2;
const MAX = 30;

/**
 * 프로필 수정 창. 사진은 고르는 즉시 업로드하고(상품 사진과 같은 방식), 저장 때 닉네임과 함께 보낸다.
 *
 * 저장 실패 시 입력은 그대로 둔다. 닉네임 오류(중복·길이)는 입력칸 옆에, 그 밖의 오류는 아래에 서버 문구 그대로 보여준다.
 * 업로드·저장 중에는 닫기와 중복 제출을 막는다.
 */
export default function ProfileForm({ profile, onClose, onSaved }) {
  const id = useId();
  const [nickname, setNickname] = useState(profile.nickname);
  const [imageUrl, setImageUrl] = useState(profile.profileImageUrl);
  const [busy, setBusy] = useState(null);
  const [nicknameError, setNicknameError] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const alive = useRef(true);
  const uploadController = useRef(null);

  useEffect(() => { alive.current = true; return () => { alive.current = false; uploadController.current?.abort(); }; }, []);

  const trimmed = nickname.trim();
  const tooShort = trimmed.length < MIN;
  const unchanged = trimmed === profile.nickname && imageUrl === profile.profileImageUrl;

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || pending.current) return;
    pending.current = true; setBusy("upload"); setError("");
    const abort = new AbortController(); uploadController.current = abort;
    try {
      const result = await uploadImages([file], abort.signal);
      if (alive.current) { setImageUrl(result.imageUrls[0]); }
    } catch (e) {
      if (alive.current && e.name !== "AbortError") setError(e.message);
    } finally {
      pending.current = false;
      if (alive.current) setBusy(null);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (pending.current || tooShort) return;
    pending.current = true; setBusy("save"); setError(""); setNicknameError("");
    try {
      const updated = await updateMyProfile({ nickname: trimmed, profileImageUrl: imageUrl });
      if (alive.current) onSaved(updated);
    } catch (e) {
      if (!alive.current) return;
      const fieldError = e.errors?.find((item) => item.field === "nickname");
      if (e.code === "DUPLICATE_NICKNAME" || fieldError) setNicknameError(fieldError?.reason ?? e.message);
      else setError(e.message);
    } finally {
      pending.current = false;
      if (alive.current) setBusy(null);
    }
  }

  return <Modal title="프로필 수정" busy={busy !== null} onClose={onClose}>
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.photoRow}>
        <Avatar url={imageUrl} name={trimmed || profile.nickname} size={72} />
        <div className={styles.photoActions}>
          <label className={styles.secondary}>
            사진 선택
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} disabled={busy !== null} />
          </label>
          {imageUrl && <button type="button" className={styles.secondary} onClick={() => setImageUrl(null)} disabled={busy !== null}>
            사진 삭제</button>}
        </div>
      </div>
      {busy === "upload" && <p className={styles.hint} role="status">사진을 업로드하고 있어요…</p>}

      <div className={styles.field}>
        <label htmlFor={`${id}-nickname`}>닉네임</label>
        <input id={`${id}-nickname`} name="nickname" value={nickname} maxLength={MAX} disabled={busy === "save"}
          aria-invalid={nicknameError ? "true" : undefined} aria-describedby={`${id}-nickname-help`}
          onChange={(event) => { setNickname(event.target.value); setNicknameError(""); }} />
        <span id={`${id}-nickname-help`} className={nicknameError ? styles.fieldError : styles.hint} role={nicknameError ? "alert" : undefined}>
          {nicknameError || `${MIN}~${MAX}자 · 앞뒤 공백은 빠져요`}</span>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.primary} disabled={busy !== null || tooShort || unchanged}>
        {busy === "save" ? "저장 중…" : "저장"}</button>
    </form>
  </Modal>;
}
