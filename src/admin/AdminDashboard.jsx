import { useEffect, useState } from "react";
import { Link } from "react-router";
import { fetchSummary, isAdminDenied } from "../api/adminApi.js";
import { paths } from "../routes.js";
import styles from "./AdminList.module.css";

/**
 * 관리자 현황판(/admin). 들어오자마자 "지금 처리할 것이 있는지"를 본다. 숫자를 누르면 그 목록으로 간다.
 * "오늘"은 한국 시각 자정부터다(서버 기준).
 */
export default function AdminDashboard({ onNotFound }) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    setState((old) => ({ ...old, loading: true, error: "" }));
    fetchSummary(abort.signal)
      .then((data) => { if (!abort.signal.aborted) setState({ data, loading: false, error: "" }); })
      .catch((error) => {
        if (abort.signal.aborted) return;
        if (isAdminDenied(error)) { onNotFound(); return; }
        setState({ data: null, loading: false, error: error.message });
      });
    return () => abort.abort();
  }, [retry]);

  const summary = state.data;
  const cards = summary ? [
    // 처리할 일이 남아 있으면 먼저 눈에 띄게 한다(색과 함께 "처리 필요" 글자로도 알린다).
    { label: "처리 전 신고", value: summary.pendingReports, to: paths.adminReports, urgent: summary.pendingReports > 0 },
    { label: "정지된 회원", value: summary.suspendedUsers, to: `${paths.adminUsers}?status=SUSPENDED` },
    { label: "오늘 가입", value: summary.newUsersToday, to: paths.adminUsers },
    { label: "오늘 등록 상품", value: summary.newProductsToday, to: paths.adminProducts },
    { label: "최근 7일 거래 완료", value: summary.completedTradesLast7Days },
  ] : [];

  return <main className={styles.shell} id="main" tabIndex={-1}>
    <header className={styles.head}>
      <h1 className={styles.title}>현황</h1>
      <p className={styles.note}>숫자를 누르면 해당 목록으로 가요.</p>
    </header>

    {state.error && <div className="alert alert-danger" role="alert">{state.error}
      <button className="btn btn-outline btn-sm" onClick={() => setRetry((value) => value + 1)}>다시 시도</button></div>}
    {state.loading && <p className={styles.note} role="status">현황을 불러오고 있어요…</p>}

    {summary && <ul className={styles.cards}>
      {cards.map((card) => {
        const body = <>
          <span className={styles.cardLabel}>{card.label}</span>
          <strong className={styles.cardValue}>{card.value.toLocaleString("ko-KR")}</strong>
          {card.urgent && <span className={styles.cardUrgent}>처리 필요</span>}
        </>;
        return <li key={card.label}>
          {card.to ? <Link className={styles.card + (card.urgent ? " " + styles.cardAlert : "")} to={card.to}>{body}</Link>
            : <div className={styles.card}>{body}</div>}
        </li>;
      })}
    </ul>}
  </main>;
}
