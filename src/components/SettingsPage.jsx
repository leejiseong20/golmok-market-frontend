import { useEffect, useState } from "react";
import { client } from "../api/client.js";
import { fetchMe } from "../api/userApi.js";
import { toast } from "../toast.js";
import BlockedUsers from "./BlockedUsers.jsx";
import Icon from "./Icon.jsx";
import MyRegions from "./MyRegions.jsx";
import PushToggle from "./PushToggle.jsx";
import WithdrawForm from "./WithdrawForm.jsx";
import styles from "./SettingsPage.module.css";

/**
 * 설정(/settings). 마이페이지의 톱니바퀴에서 들어온다.
 *
 * 마이페이지에 알림·동네 인증·차단·로그아웃·탈퇴가 모두 붙어 있어 화면이 복잡했다.
 * 가끔 바꾸는 것들을 여기로 모으고, 마이페이지에는 프로필과 목록만 남긴다.
 * 모달이 아니라 화면인 이유: 뒤로가기로 자연스럽게 돌아오고, 동네 인증처럼 긴 내용도 넉넉하게 보인다.
 *
 * 순서는 자주 쓰는 것 → 드문 것 → 되돌릴 수 없는 것. 회원 탈퇴는 맨 아래, 위험 색 글자다.
 */
export default function SettingsPage({ user, onBack, onLogin, onLogout, loggingOut, onHome, onRegionsChange, onBlocksChanged }) {
  const [profile, setProfile] = useState({ data: null, loading: true, error: "" });
  const [retry, setRetry] = useState(0);
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    const abort = new AbortController();
    setProfile((old) => ({ ...old, loading: true, error: "" }));
    fetchMe(abort.signal)
      .then((data) => { if (!abort.signal.aborted) setProfile({ data, loading: false, error: "" }); })
      .catch((error) => { if (!abort.signal.aborted) setProfile({ data: null, loading: false, error: error.message }); });
    return () => abort.abort();
  }, [user?.id, retry]);

  const header = <header className={styles.header}>
    <button className={styles.back} onClick={onBack} aria-label="나의 골목으로"><Icon name="chevronLeft" size={22} /></button>
    <h1 className={styles.title}>설정</h1>
  </header>;

  if (!user) {
    return <main className={styles.shell} id="main" tabIndex={-1}>
      {header}
      <section className={styles.guest}>
        <p>로그인하면 알림과 내 동네를 설정할 수 있어요.</p>
        <button className="btn btn-primary" onClick={onLogin}>로그인하기</button>
      </section>
    </main>;
  }

  return <main className={styles.shell} id="main" tabIndex={-1}>
    {header}

    {/* 기기마다 켜고 끄는 설정이다. 서버에 푸시 키가 없으면 스스로 숨는다. */}
    <PushToggle />

    {profile.error && <div className="alert alert-danger" role="alert">{profile.error}
      <button className="btn btn-outline btn-sm" onClick={() => setRetry((n) => n + 1)}>다시 시도</button></div>}
    {profile.loading && <p className={styles.loading} role="status">내 동네를 불러오고 있어요…</p>}
    {profile.data && <MyRegions regions={profile.data.regions} onChange={(regions) => {
      setProfile((old) => ({ ...old, data: { ...old.data, regions } }));
      onRegionsChange(regions);
    }} />}

    <section className={styles.list} aria-label="차단">
      <button className={styles.row} onClick={() => setBlocksOpen(true)}>
        <span>차단한 사용자</span><Icon name="chevronRight" size={18} />
      </button>
    </section>

    <section className={styles.list} aria-label="계정">
      <button className={styles.row} onClick={onLogout} disabled={loggingOut}>
        <span>{loggingOut ? "로그아웃하는 중…" : "로그아웃"}</span>
      </button>
      <button className={styles.row + " " + styles.danger} onClick={() => setWithdrawing(true)}>
        <span>회원 탈퇴</span>
      </button>
    </section>

    {blocksOpen && <BlockedUsers onClose={() => setBlocksOpen(false)} onChanged={onBlocksChanged} />}
    {withdrawing && <WithdrawForm onClose={() => setWithdrawing(false)} onWithdrawn={() => {
      // 서버가 refresh token 을 모두 지웠으므로 이 기기의 세션만 지우면 된다. 홈으로 먼저 옮겨 빈 화면을 거치지 않는다.
      onHome();
      client.clearSession();
      toast.show("탈퇴가 완료됐어요. 그동안 이용해 주셔서 고맙습니다.");
    }} />}
  </main>;
}
