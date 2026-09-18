import Icon from "./Icon.jsx";
import styles from "./BottomNav.module.css";

/**
 * 모바일 하단 메뉴.
 *
 * 로그아웃은 여기에 두지 않는다. 자주 쓰지 않는데다 실수로 누르기 쉬운 자리였다.
 * 지금은 마이페이지 아래쪽에 있고, 비로그인 상태의 로그인 진입점도 마이페이지가 맡는다.
 */
export default function BottomNav({ onHome, onRegionClick, onMyPage, onChat, view, chatUnreadCount = 0 }) {
  const tab = (active) => styles.tab + (active ? " " + styles.on : "");
  return <nav className={styles.wrap + " " + styles.nav} aria-label="모바일 메뉴"><div className={styles.tabs}>
    <button className={tab(view === "home")} onClick={onHome} aria-current={view === "home" ? "page" : undefined}>
      <span className={styles.icon}><Icon name="home" /></span>홈</button>
    <button className={styles.tab} onClick={onRegionClick}>
      <span className={styles.icon}><Icon name="pin" /></span>동네 선택</button>
    <button className={tab(view === "chat")} onClick={onChat} aria-current={view === "chat" ? "page" : undefined}
      aria-label={chatUnreadCount > 0 ? `채팅, 안 읽은 메시지 ${chatUnreadCount}개` : undefined}>
      <span className={styles.icon}><Icon name="chat" />
        {chatUnreadCount > 0 && <span className={styles.count} aria-hidden="true">{chatUnreadCount > 99 ? "99+" : chatUnreadCount}</span>}
      </span>채팅</button>
    <button className={tab(view === "my")} onClick={onMyPage} aria-current={view === "my" ? "page" : undefined}>
      <span className={styles.icon}><Icon name="user" /></span>나의 골목</button>
  </div></nav>;
}
