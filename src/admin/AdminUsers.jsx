import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { USER_STATUS_LABELS, fetchAdminUser, fetchUsers, suspendUser, unsuspendUser } from "../api/adminApi.js";
import { formatDate, relativeTime } from "../data/format.js";
import EmptyState from "../components/EmptyState.jsx";
import Modal from "../components/Modal.jsx";
import { paths } from "../routes.js";
import { toast } from "../toast.js";
import AdminHistory from "./AdminHistory.jsx";
import AdminReasonForm from "./AdminReasonForm.jsx";
import useAdminList, { useOpenRequest, useSearchFilters } from "./useAdminList.js";
import styles from "./AdminList.module.css";

/**
 * 회원 관리(관리자).
 *
 * 이메일은 서버가 가려서 준다(de***@golmok.test). 사람을 가리는 데는 닉네임과 번호로 충분하다.
 * 이메일로 찾으려면 전체를 적는다 — 앞부분만 맞혀 보는 식으로 가린 값을 알아내지 못하게 서버가 전체 일치로만 찾는다.
 * 정지·해제는 신고 없이도 할 수 있고, 이유를 반드시 적는다.
 */
const STATUS_TABS = [
  { value: "", label: "전체" },
  { value: "ACTIVE", label: "정상" },
  { value: "SUSPENDED", label: "정지" },
  { value: "WITHDRAWN", label: "탈퇴" },
];

export default function AdminUsers({ onNotFound, onOpenProfile }) {
  const [params, setFilters] = useSearchFilters();
  const q = params.get("q") ?? "";
  const status = STATUS_TABS.some((tab) => tab.value === params.get("status")) ? params.get("status") : "";
  const [draft, setDraft] = useState(q);
  const [openId, setOpenId] = useState(null);
  useOpenRequest(setOpenId);
  useEffect(() => { setDraft(q); }, [q]);

  const { list, more, reload } = useAdminList(
    (cursor, signal) => fetchUsers({ q, status, cursor }, signal), `${q}|${status}`, onNotFound);

  return <main className={styles.shell} id="main" tabIndex={-1}>
    <header className={styles.head}>
      <h1 className={styles.title}>회원</h1>
      <p className={styles.note}>닉네임 일부나 이메일 전체로 찾아요. 이메일은 가려서 보여요.</p>
    </header>

    <form className={styles.search} role="search" onSubmit={(event) => { event.preventDefault(); setFilters({ q: draft.trim() }); }}>
      <input type="search" aria-label="회원 검색" placeholder="닉네임 또는 이메일 전체" value={draft} maxLength={100}
        onChange={(event) => setDraft(event.target.value)} />
      <button type="submit" className="btn btn-outline btn-sm">찾기</button>
    </form>

    <div className="seg" role="group" aria-label="회원 상태">
      {STATUS_TABS.map((tab) => <button key={tab.value || "all"} type="button" className="seg-item"
        aria-pressed={status === tab.value} onClick={() => setFilters({ status: tab.value })}>{tab.label}</button>)}
    </div>

    {list.error && <div className="alert alert-danger" role="alert">{list.error}
      <button className="btn btn-outline btn-sm" onClick={reload}>다시 시도</button></div>}
    {list.loading && <p className={styles.note} role="status">회원을 불러오고 있어요…</p>}
    {!list.loading && !list.error && list.items.length === 0 &&
      <EmptyState title="맞는 회원이 없어요" description="검색어나 상태를 바꿔 보세요." />}

    <ul className={styles.list}>
      {list.items.map((user) => <li key={user.id}>
        <button className={styles.row} onClick={() => setOpenId(user.id)}>
          <span className={styles.rowTop}>
            <strong>{user.nickname}</strong>
            <span className={styles.badges}>
              {user.admin && <span className={styles.count}>관리자</span>}
              <span className={styles.status + " " + styles["status" + user.status]}>{USER_STATUS_LABELS[user.status]}</span>
            </span>
          </span>
          <span className={styles.rowMeta}>#{user.id} · {user.email} · 가입 {relativeTime(user.createdAt)}</span>
        </button>
      </li>)}
    </ul>
    {list.hasNext && <button className="btn btn-outline btn-block" onClick={more}>더 보기</button>}

    {openId && <UserDetail id={openId} onClose={() => setOpenId(null)} onChanged={reload} onOpenProfile={onOpenProfile} />}
  </main>;
}

/** 회원 상세와 정지·해제. 정지 판단에 필요한 숫자(받은 신고·판매 상품)와 지금까지의 조치를 함께 본다. */
function UserDetail({ id, onClose, onChanged, onOpenProfile }) {
  const navigate = useNavigate();
  const [state, setState] = useState({ data: null, loading: true, error: "" });

  useEffect(() => {
    const abort = new AbortController();
    fetchAdminUser(id, abort.signal)
      .then((data) => { if (!abort.signal.aborted) setState({ data, loading: false, error: "" }); })
      .catch((error) => { if (!abort.signal.aborted) setState({ data: null, loading: false, error: error.message }); });
    return () => abort.abort();
  }, [id]);

  const detail = state.data;
  const user = detail?.user;

  async function apply(request, message) {
    const data = await request;
    setState({ data, loading: false, error: "" });
    toast.success(message);
    onChanged();
  }

  return <Modal title="회원 상세" onClose={onClose}>
    {state.loading && <p role="status">불러오고 있어요…</p>}
    {state.error && <p className="alert alert-danger" role="alert">{state.error}</p>}
    {user && <>
      <section className={styles.target} aria-label="회원">
        <p className={styles.targetName}>{user.nickname}
          <span className={styles.status + " " + styles["status" + user.status]}>{USER_STATUS_LABELS[user.status]}</span></p>
        {user.status !== "WITHDRAWN" &&
          <button className="btn btn-outline btn-sm" onClick={() => onOpenProfile(user.id)}>프로필 보기</button>}
      </section>

      <dl className={styles.facts}>
        <div><dt>번호</dt><dd>#{user.id}{user.admin ? " · 관리자" : ""}</dd></div>
        <div><dt>이메일</dt><dd>{user.email}</dd></div>
        <div><dt>가입</dt><dd>{formatDate(user.createdAt)}</dd></div>
        <div><dt>마지막 로그인</dt><dd>{user.lastLoginAt ? formatDate(user.lastLoginAt) : "기록 없음"}</dd></div>
        <div><dt>매너온도</dt><dd>{detail.mannerTemp}℃</dd></div>
        <div><dt>받은 신고</dt><dd>회원 {detail.reportsOnUser}건 · 상품 {detail.reportsOnProducts}건</dd></div>
        <div><dt>판매 상품</dt><dd>지금 보이는 상품 {detail.activeProductCount}개
          <button type="button" className={styles.inlineLink}
            onClick={() => navigate(`${paths.adminProducts}?sellerId=${user.id}`)}>상품 관리에서 보기</button></dd></div>
      </dl>

      <AdminHistory actions={detail.actions} />

      {user.admin ? <p className={styles.note + " " + styles.handleNote}>관리자 계정은 정지할 수 없어요.</p>
        : user.status === "WITHDRAWN" ? <p className={styles.note + " " + styles.handleNote}>탈퇴한 회원이라 조치할 수 없어요.</p>
        : user.status === "SUSPENDED"
          ? <AdminReasonForm key="unsuspend" title="정지 해제" hint="해제하면 다시 로그인할 수 있어요."
              action={{ label: "정지 풀기", busyLabel: "푸는 중…" }}
              onSubmit={(reason) => apply(unsuspendUser(user.id, reason), "정지를 풀었어요.")} />
          : <AdminReasonForm key="suspend" title="정지"
              hint="로그인과 토큰 재발급이 막혀요. 이미 로그인한 기기는 최대 30분 뒤에 끊겨요. 신고함의 신고는 따로 처리해야 해요."
              action={{ label: "정지하기", busyLabel: "정지하는 중…", danger: true }}
              onSubmit={(reason) => apply(suspendUser(user.id, reason), "정지했어요.")} />}
    </>}
  </Modal>;
}
