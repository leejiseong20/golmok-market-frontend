import { actionLabel } from "../api/adminApi.js";
import { relativeTime } from "../data/format.js";
import styles from "./AdminList.module.css";

/** 한 대상에 있었던 관리자 조치. 회원·상품 상세가 함께 쓴다. */
export default function AdminHistory({ actions }) {
  return <section aria-label="조치 이력">
    <h3 className={styles.sectionTitle}>조치 이력</h3>
    {actions.length === 0
      ? <p className={styles.note}>아직 조치한 적이 없어요.</p>
      : <ul className={styles.others}>
          {actions.map((item) => <li key={item.id}>
            <span>{actionLabel(item.action)} · {item.adminNickname} · {relativeTime(item.createdAt)}</span>
            <span className={styles.otherDetail}>{item.reason}</span>
          </li>)}
        </ul>}
  </section>;
}
