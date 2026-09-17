import styles from "./NotificationBell.module.css";

/** 헤더의 알림 버튼. 숫자는 App 이 서버 값과 실시간 이벤트로 맞춘다. */
export default function NotificationBell({ count, onClick }) {
  const label = count > 0 ? `알림, 읽지 않은 알림 ${count}개` : "알림";
  return <button type="button" className={styles.bell} onClick={onClick} aria-label={label}>
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
    {count > 0 && <span className={styles.badge} aria-hidden="true">{count > 99 ? "99+" : count}</span>}
  </button>;
}
