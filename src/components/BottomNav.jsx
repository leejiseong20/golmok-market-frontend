import styles from "./BottomNav.module.css";
export default function BottomNav({ onHome, onRegionClick, onMyPage, view, user, onLogin, onLogout, loggingOut }) {
  const tab = (active) => styles.tab + (active ? " " + styles.on : "");
  return <nav className={styles.wrap + " " + styles.nav} aria-label="모바일 메뉴"><div className={styles.tabs}>
    <button className={tab(view === "home")} onClick={onHome} aria-current={view === "home" ? "page" : undefined}><span className={styles.icon}>⌂</span>홈</button>
    <button className={styles.tab} onClick={onRegionClick}><span className={styles.icon}>◎</span>동네 선택</button>
    <button className={tab(view === "my")} onClick={onMyPage} aria-current={view === "my" ? "page" : undefined}><span className={styles.icon}>♡</span>나의 골목</button>
    <button className={styles.tab} onClick={user ? onLogout : onLogin} disabled={loggingOut}><span className={styles.icon}>○</span>{user ? "로그아웃" : "로그인"}</button>
  </div></nav>;
}
