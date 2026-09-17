import NotificationBell from "./NotificationBell.jsx";
import styles from "./Header.module.css";

export default function Header({ region, onRegionClick, user, onLogin, onLogout, loggingOut, search, onSearchChange, onSearch, onHome, onMyPage, onChat, unreadCount = 0, chatUnreadCount = 0, onNotifications, children }) {
  return <header className={styles.header}>
    <div className={styles.inner}>
      <button className={styles.logo} onClick={onHome} aria-label="골목마켓 홈"><span className={styles.mark} /><span className={styles.wordmark}>골목마켓</span></button>
      <button className={styles.region} onClick={onRegionClick}><span className={styles.dot} />{region?.dong ?? "동네 선택"}</button>
      <form className={styles.search} onSubmit={onSearch}>
        <input type="search" aria-label="상품 검색어" placeholder="동네에서 찾는 물건" value={search} onChange={(e) => onSearchChange(e.target.value)} maxLength={50} />
        <button type="submit">검색</button>
      </form>
      <div className={styles.account}>{user && <span className={styles.nickname}>{user.nickname}님</span>}
        {user && <NotificationBell count={unreadCount} onClick={onNotifications} />}
        <button className={styles.chat} onClick={onChat}
          aria-label={chatUnreadCount > 0 ? `채팅, 안 읽은 메시지 ${chatUnreadCount}개` : undefined}>채팅
          {chatUnreadCount > 0 && <span className={styles.count} aria-hidden="true">{chatUnreadCount > 99 ? "99+" : chatUnreadCount}</span>}
        </button>
        <button onClick={onMyPage}>나의 골목</button>
        <button onClick={user ? onLogout : onLogin} disabled={loggingOut}>{loggingOut ? "처리 중…" : user ? "로그아웃" : "로그인"}</button>
      </div>
    </div>
    <div className={styles.catRow}>{children}</div>
  </header>;
}
