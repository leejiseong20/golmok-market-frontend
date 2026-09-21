import { useEffect, useRef, useState } from "react";
import { fetchProfile } from "../api/userApi.js";
import Avatar from "./Avatar.jsx";
import Modal from "./Modal.jsx";
import ReviewList from "./ReviewList.jsx";
import styles from "./UserProfile.module.css";

/**
 * 이웃 프로필.
 *
 * 신고·차단은 여기서 한다. 채팅방·상품 상세에서도 이름을 누르면 이 창이 열려 모든 진입점이 한 곳으로 모인다.
 * 차단 여부는 서버가 준 blockedByMe 로 시작하고, 차단·해제가 성공하면 그 결과로 바꾼다(서버 확인 뒤에만).
 * 내 프로필에는 두 버튼을 두지 않는다(서버도 막는다).
 */
export default function UserProfile({ userId, me, onClose, onReport, onBlock, onUnblock }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    const abort = new AbortController(); setError(""); setProfile(null);
    fetchProfile(userId, abort.signal).then((data) => {
      if (abort.signal.aborted) return;
      setProfile(data); setBlocked(!!data.blockedByMe);
    }).catch((error) => { if (!abort.signal.aborted) setError(error.message); });
    return () => abort.abort();
  }, [userId, retry, me]);

  async function toggleBlock() {
    if (busy.current || !profile) return;
    busy.current = true; setPending(true);
    try {
      const person = { id: profile.id, nickname: profile.nickname };
      const done = blocked ? await onUnblock(person) : await onBlock(person);
      if (done) setBlocked(!blocked);
    } finally {
      busy.current = false; setPending(false);
    }
  }

  const mine = profile && me === profile.id;

  return <Modal title="이웃 프로필" onClose={onClose}>
    {error ? <p role="alert">{error} <button onClick={() => setRetry((n) => n + 1)}>다시 시도</button></p>
      : !profile ? <p role="status">프로필을 불러오고 있어요…</p> : <>
        <div className={styles.profile}>
          <span className={styles.avatar}><Avatar url={profile.profileImageUrl} name={profile.nickname} size={64} /></span>
          <h3>{profile.nickname}</h3>
          <strong>매너온도 {Number(profile.mannerTemp).toFixed(1)}℃</strong>
          <p>등록 상품 {profile.productCount}개 · 받은 후기 {profile.reviewCount}개</p>
          {blocked && <p className={styles.blockedNote} role="status">차단한 사용자예요. 서로 채팅할 수 없고, 이 사람의 상품은 목록에 보이지 않아요.</p>}
        </div>
        <ReviewList key={userId} userId={userId} />
        {!mine && <div className={styles.actions}>
          <button className="btn btn-ghost btn-sm" onClick={() => onReport({ id: profile.id, nickname: profile.nickname })}>
            신고하기</button>
          <button className="btn btn-ghost btn-sm" onClick={toggleBlock} disabled={pending} aria-pressed={blocked}>
            {pending ? "처리 중…" : blocked ? "차단 해제" : "차단하기"}</button>
        </div>}
      </>}
  </Modal>;
}
