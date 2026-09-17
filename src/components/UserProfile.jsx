import { useEffect, useState } from "react";
import { fetchProfile } from "../api/userApi.js";
import Modal from "./Modal.jsx";
import ReviewList from "./ReviewList.jsx";
import styles from "./UserProfile.module.css";

export default function UserProfile({ userId, onClose }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setError(""); setProfile(null);
    fetchProfile(userId, abort.signal).then((data) => { if (!abort.signal.aborted) setProfile(data); })
      .catch((error) => { if (!abort.signal.aborted) setError(error.message); });
    return () => abort.abort();
  }, [userId, retry]);
  return <Modal title="이웃 프로필" onClose={onClose}>
    {error ? <p role="alert">{error} <button onClick={() => setRetry((n) => n + 1)}>다시 시도</button></p>
      : !profile ? <p role="status">프로필을 불러오고 있어요…</p> : <>
        <div className={styles.profile}><h3>{profile.nickname}</h3>
          <strong>매너온도 {Number(profile.mannerTemp).toFixed(1)}℃</strong>
          <p>등록 상품 {profile.productCount}개 · 받은 후기 {profile.reviewCount}개</p></div>
        <ReviewList key={userId} userId={userId} />
      </>}
  </Modal>;
}
