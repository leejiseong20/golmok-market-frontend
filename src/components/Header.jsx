import NotificationBell from "./NotificationBell.jsx";
import styles from "./Header.module.css";

/**
 * 상단 바.
 *
 * 채팅·나의 골목·로그인은 모바일에서 숨긴다. 하단 탭에 같은 버튼이 이미 있어
 * 좁은 화면에서 헤더가 두 줄이 되고 같은 동작이 두 번 보였다.
 * 알림은 하단 탭에 자리가 없어 모바일에서도 헤더에 남긴다.
 */
export default function Header({ region, onRegionClick, user, onLogin, onLogout, loggingOut, search, onSearchChange, onSearch, onHome, onMyPage, onChat, unreadCount = 0, chatUnreadCount = 0, onNotifications, children }) {
  return <header className={styles.header}>
    <div className={styles.inner}>
      <button className={styles.logo} onClick={onHome} aria-label="골목마켓 홈"><span className={styles.mark} /><span className={styles.wordmark}>골목마켓</span></button>
      <button className={styles.region} onClick={onRegionClick}><span className={styles.dot} />{region?.dong ?? "동네 선택"}</button>
      <form className={styles.search} onSubmit={onSearch}>
        <input type="search" aria-label="상품 검색어" placeholder="동네에서 찾는 물건" value={search} onChange={(e) => onSearchChange(e.target.value)} maxLength={50} />
        <button type="submit" className={styles.searchSubmit}>검색</button>
      </form>
      <div className={styles.account}>
        {user && <span className={styles.nickname}>{user.nickname}님</span>}
        {user && <NotificationBell count={unreadCount} onClick={onNotifications} />}
        <button className={"btn btn-ghost btn-sm " + styles.chat + " " + styles.pcOnly} onClick={onChat}
          aria-label={chatUnreadCount > 0 ? `채팅, 안 읽은 메시지 ${chatUnreadCount}개` : undefined}>채팅
          {chatUnreadCount > 0 && <span className={styles.count} aria-hidden="true">{chatUnreadCount > 99 ? "99+" : chatUnreadCount}</span>}
        </button>
        <button className={"btn btn-ghost btn-sm " + styles.pcOnly} onClick={onMyPage}>나의 골목</button>
        <button className={"btn btn-sm " + (user ? "btn-outline" : "btn-primary") + " " + styles.pcOnly}
          onClick={user ? onLogout : onLogin} disabled={loggingOut}>{loggingOut ? "처리 중…" : user ? "로그아웃" : "로그인"}</button>
      </div>
    </div>
    <div className={styles.catRow}>{children}</div>
  </header>;
}
