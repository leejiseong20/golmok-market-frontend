import { useNavigate } from "react-router";
import { ACTION_LABELS, actionLabel, fetchActions } from "../api/adminApi.js";
import { formatDate } from "../data/format.js";
import EmptyState from "../components/EmptyState.jsx";
import { paths } from "../routes.js";
import useAdminList, { useSearchFilters } from "./useAdminList.js";
import styles from "./AdminList.module.css";

/**
 * 조치 기록(감사 로그). 누가 언제 무엇을 왜 했는지를 최신순으로 본다. 읽기만 한다 — 기록은 고치거나 지울 수 없다.
 * 대상을 누르면 그 대상의 관리 화면 상세로 간다.
 */
const TARGET_PATHS = { USER: paths.adminUsers, PRODUCT: paths.adminProducts, REPORT: paths.adminReports };

export default function AdminActions({ onNotFound }) {
  const navigate = useNavigate();
  const [params, setFilters] = useSearchFilters();
  const action = ACTION_LABELS[params.get("action")] ? params.get("action") : "";
  const { list, more, reload } = useAdminList(
    (cursor, signal) => fetchActions({ action, cursor }, signal), action, onNotFound);

  return <main className={styles.shell} id="main" tabIndex={-1}>
    <header className={styles.head}>
      <h1 className={styles.title}>조치 기록</h1>
      <p className={styles.note}>관리자가 한 조치와 그 이유예요. 기록은 고치거나 지울 수 없어요.</p>
    </header>

    <label className={styles.selectField}>조치 종류
      <select value={action} onChange={(event) => setFilters({ action: event.target.value })}>
        <option value="">전체</option>
        {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>

    {list.error && <div className="alert alert-danger" role="alert">{list.error}
      <button className="btn btn-outline btn-sm" onClick={reload}>다시 시도</button></div>}
    {list.loading && <p className={styles.note} role="status">기록을 불러오고 있어요…</p>}
    {!list.loading && !list.error && list.items.length === 0 &&
      <EmptyState title="아직 조치 기록이 없어요" description="정지·상품 내리기·신고 처리를 하면 여기에 남아요." />}

    <ul className={styles.list}>
      {list.items.map((log) => <li key={log.id} className={styles.logRow}>
        <span className={styles.rowTop}>
          <button type="button" className={styles.inlineLink + " " + styles.logTarget}
            onClick={() => navigate(TARGET_PATHS[log.targetType], { state: { open: log.targetId } })}>{log.targetName}</button>
          <span className={styles.badges}>
            <span className={styles.count}>{actionLabel(log.action)}</span>
            <span className={styles.status}>{log.reportId ? "신고 처리" : "직접 조치"}</span>
          </span>
        </span>
        <span className={styles.rowMeta}>{log.adminNickname} · {formatDate(log.createdAt)}</span>
        <span className={styles.detail}>{log.reason}</span>
      </li>)}
    </ul>
    {list.hasNext && <button className="btn btn-outline btn-block" onClick={more}>더 보기</button>}
  </main>;
}
