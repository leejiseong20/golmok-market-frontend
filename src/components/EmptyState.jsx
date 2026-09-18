import styles from "./EmptyState.module.css";

/**
 * 비어 있는 목록 안내.
 *
 * 화면마다 회색 상자에 문장 하나씩 다르게 넣고 있었다. 형태를 하나로 모으고,
 * 다음에 할 일이 분명한 곳(동네 미선택 등)에만 버튼을 둔다.
 *
 * 아이콘은 장식이라 보조기기에서 숨기고, 문구만 읽히게 한다.
 */
export default function EmptyState({ title, description, actionLabel, onAction, compact = false }) {
  return <div className={styles.empty + (compact ? " " + styles.compact : "")} role="status">
    <svg className={styles.icon} viewBox="0 0 48 48" width="40" height="40" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 18 24 8l16 10v20a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z" />
      <path d="M18 40V26h12v14" />
    </svg>
    <p className={styles.title}>{title}</p>
    {description && <p className={styles.description}>{description}</p>}
    {actionLabel && onAction && <button className="btn btn-primary" onClick={onAction}>{actionLabel}</button>}
  </div>;
}
