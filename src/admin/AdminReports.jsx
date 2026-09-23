import { useEffect, useState } from "react";
import { ADMIN_ACTIONS, REPORT_STATUS_LABELS, fetchReport, fetchReports, rejectReport, resolveReport } from "../api/adminApi.js";
import { REPORT_REASONS } from "../api/reportApi.js";
import { relativeTime } from "../data/format.js";
import EmptyState from "../components/EmptyState.jsx";
import Icon from "../components/Icon.jsx";
import Modal from "../components/Modal.jsx";
import { toast } from "../toast.js";
import styles from "./AdminReports.module.css";

/**
 * 신고함(관리자).
 *
 * 권한 판단은 서버가 한다. 관리자가 아니면 목록 요청이 404 로 오고, 화면은 그때 "없는 페이지"를 보인다
 * (여기서 "권한 없음"이라고 알리면 관리자 화면의 존재가 드러난다).
 *
 * 조치는 사람이 판단한 뒤에만 한다. 그래서 목록에서 바로 누르는 버튼을 두지 않고,
 * 상세를 열어 대상과 같은 대상의 다른 신고를 본 뒤 조치하게 한다. 이유는 반드시 적어야 한다.
 */
const STATUS_TABS = [
  { value: "PENDING", label: "처리 전" },
  { value: "RESOLVED", label: "처리함" },
  { value: "REJECTED", label: "반려" },
  { value: "ALL", label: "전체" },
];

const reasonLabel = (value) => REPORT_REASONS.find((item) => item.value === value)?.label ?? value;

export default function AdminReports({ onNotFound, onOpenProduct, onOpenProfile }) {
  const [status, setStatus] = useState("PENDING");
  const [list, setList] = useState({ items: [], loading: true, error: "", cursor: null, hasNext: false });
  const [openId, setOpenId] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    setList((old) => ({ ...old, loading: true, error: "" }));
    fetchReports({ status }, abort.signal)
      .then((page) => {
        if (abort.signal.aborted) return;
        setList({ items: page.content, loading: false, error: "", cursor: page.nextCursor, hasNext: page.hasNext });
      })
      .catch((error) => {
        if (abort.signal.aborted) return;
        // 관리자가 아니면 서버가 404 를 준다. 없는 페이지로 보낸다.
        if (error.status === 404 || error.code === "RESOURCE_NOT_FOUND") { onNotFound(); return; }
        setList((old) => ({ ...old, loading: false, error: error.message }));
      });
    return () => abort.abort();
  }, [status, reload]);

  async function more() {
    if (!list.hasNext || list.loading) return;
    try {
      const page = await fetchReports({ status, cursor: list.cursor });
      setList((old) => {
        const known = new Set(old.items.map((item) => item.id));
        return { ...old, items: [...old.items, ...page.content.filter((item) => !known.has(item.id))],
          cursor: page.nextCursor, hasNext: page.hasNext };
      });
    } catch (error) {
      toast.error(error.message);
    }
  }

  return <main className={styles.shell} id="main" tabIndex={-1}>
    <header className={styles.head}>
      <h1 className={styles.title}>신고함</h1>
      <p className={styles.note}>신고는 쌓아 두기만 하고 자동으로 조치하지 않아요. 확인하고 직접 판단해 주세요.</p>
    </header>

    <div className="seg" role="group" aria-label="처리 상태">
      {STATUS_TABS.map((tab) => <button key={tab.value} type="button" className="seg-item"
        aria-pressed={status === tab.value} onClick={() => setStatus(tab.value)}>{tab.label}</button>)}
    </div>

    {list.error && <div className="alert alert-danger" role="alert">{list.error}
      <button className="btn btn-outline btn-sm" onClick={() => setReload((value) => value + 1)}>다시 시도</button></div>}
    {list.loading && <p className={styles.note} role="status">신고를 불러오고 있어요…</p>}
    {!list.loading && !list.error && list.items.length === 0 &&
      <EmptyState title="처리할 신고가 없어요" description="새 신고가 들어오면 여기에 모여요." />}

    <ul className={styles.list}>
      {list.items.map((report) => <li key={report.id}>
        <button className={styles.row} onClick={() => setOpenId(report.id)}>
          <span className={styles.rowTop}>
            <strong>{report.targetName}</strong>
            <span className={styles.badges}>
              {report.reportCount > 1 && <span className={styles.count}>신고 {report.reportCount}건</span>}
              <span className={styles.status + " " + styles["status" + report.status]}>
                {REPORT_STATUS_LABELS[report.status]}</span>
            </span>
          </span>
          <span className={styles.rowMeta}>
            {report.targetType === "PRODUCT" ? "상품" : "사용자"} · {reasonLabel(report.reason)}
            {" · "}{report.reporterNickname} · {relativeTime(report.createdAt)}
          </span>
          {report.detail && <span className={styles.detail}>{report.detail}</span>}
        </button>
      </li>)}
    </ul>
    {list.hasNext && <button className="btn btn-outline btn-block" onClick={more}>더 보기</button>}

    {openId && <ReportDetail id={openId} onClose={() => setOpenId(null)}
      onHandled={() => { setOpenId(null); setReload((value) => value + 1); }}
      onOpenProduct={onOpenProduct} onOpenProfile={onOpenProfile} />}
  </main>;
}

/** 신고 상세와 조치. 대상과 같은 대상의 다른 신고를 함께 보여 준 뒤에 조치하게 한다. */
function ReportDetail({ id, onClose, onHandled, onOpenProduct, onOpenProfile }) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const [action, setAction] = useState("NONE");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    const abort = new AbortController();
    fetchReport(id, abort.signal)
      .then((data) => { if (!abort.signal.aborted) setState({ data, loading: false, error: "" }); })
      .catch((error) => { if (!abort.signal.aborted) setState({ data: null, loading: false, error: error.message }); });
    return () => abort.abort();
  }, [id]);

  const report = state.data;
  const actions = ADMIN_ACTIONS.filter((item) => !item.only || item.only === report?.targetType);

  async function send(kind) {
    if (busy) return;
    if (!reason.trim()) { toast.error("처리 이유를 적어 주세요."); return; }
    setBusy(kind);
    try {
      if (kind === "resolve") await resolveReport(id, { action, reason });
      else await rejectReport(id, { reason });
      toast.success(kind === "resolve" ? "처리했어요." : "반려했어요.");
      onHandled();
    } catch (error) {
      toast.error(error.message);
      setBusy("");
    }
  }

  return <Modal title="신고 상세" busy={!!busy} onClose={() => { if (!busy) onClose(); }}>
    {state.loading && <p role="status">불러오고 있어요…</p>}
    {state.error && <p className="alert alert-danger" role="alert">{state.error}</p>}
    {report && <>
      <section className={styles.target} aria-label="신고 대상">
        <p className={styles.targetName}>{report.targetName}</p>
        <button className="btn btn-outline btn-sm" onClick={() => (report.targetType === "PRODUCT"
          ? onOpenProduct(report.targetId) : onOpenProfile(report.targetId))}>
          <Icon name="chevronRight" size={16} /> {report.targetType === "PRODUCT" ? "상품 보기" : "프로필 보기"}
        </button>
      </section>

      <dl className={styles.facts}>
        <div><dt>사유</dt><dd>{reasonLabel(report.reason)}</dd></div>
        <div><dt>신고자</dt><dd>{report.reporterNickname}</dd></div>
        <div><dt>신고 시각</dt><dd>{relativeTime(report.createdAt)}</dd></div>
        <div><dt>상태</dt><dd>{REPORT_STATUS_LABELS[report.status]}</dd></div>
      </dl>
      {report.detail && <p className={styles.detailBox}>{report.detail}</p>}

      {report.sameTarget.length > 0 && <section aria-label="같은 대상의 다른 신고">
        <h3 className={styles.sectionTitle}>같은 대상의 다른 신고 {report.sameTarget.length}건</h3>
        <ul className={styles.others}>
          {report.sameTarget.map((other) => <li key={other.id}>
            {reasonLabel(other.reason)} · {other.reporterNickname} · {relativeTime(other.createdAt)}
            {other.detail && <span className={styles.otherDetail}>{other.detail}</span>}
          </li>)}
        </ul>
      </section>}

      {report.actions.length > 0 && <section aria-label="지금까지의 조치">
        <h3 className={styles.sectionTitle}>지금까지의 조치</h3>
        <ul className={styles.others}>
          {report.actions.map((item) => <li key={item.id}>
            {item.action} · {item.adminNickname} · {relativeTime(item.createdAt)}
            <span className={styles.otherDetail}>{item.reason}</span>
          </li>)}
        </ul>
      </section>}

      {report.status === "PENDING"
        ? <section className={styles.handle} aria-label="처리">
            <h3 className={styles.sectionTitle}>처리</h3>
            <div className="seg" role="group" aria-label="조치">
              {actions.map((item) => <button key={item.value} type="button" className="seg-item"
                aria-pressed={action === item.value} onClick={() => setAction(item.value)}>{item.label}</button>)}
            </div>
            <p className={styles.note}>{actions.find((item) => item.value === action)?.hint}</p>
            <label className={styles.reason}>처리 이유
              <textarea value={reason} maxLength={500} rows={3} placeholder="왜 그렇게 판단했는지 적어 주세요. 기록으로 남습니다."
                onChange={(event) => setReason(event.target.value)} />
            </label>
            {/* 같은 대상의 대기 신고가 함께 닫힌다는 것을 미리 알린다(서버 규칙). */}
            {report.sameTarget.length > 0 && <p className={styles.note}>
              처리하면 같은 대상의 처리 전 신고 {report.sameTarget.length}건도 함께 닫혀요.</p>}
            <div className={styles.buttons}>
              <button className="btn btn-primary" disabled={!!busy} onClick={() => send("resolve")}>
                {busy === "resolve" ? "처리 중…" : "신고 인정하고 처리"}</button>
              <button className="btn btn-outline" disabled={!!busy} onClick={() => send("reject")}>
                {busy === "reject" ? "처리 중…" : "문제 없음(반려)"}</button>
            </div>
          </section>
        : <section className={styles.handle} aria-label="처리 결과">
            <h3 className={styles.sectionTitle}>처리 결과</h3>
            <p className={styles.note}>{report.handledByNickname} · {relativeTime(report.handledAt)}</p>
            <p className={styles.detailBox}>{report.adminMemo}</p>
          </section>}
    </>}
  </Modal>;
}
