import { useState } from "react";
import ChatList from "./ChatList.jsx";
import ChatRoom from "./ChatRoom.jsx";
import styles from "./ChatPage.module.css";

/**
 * 채팅 화면. PC 는 목록과 방을 나란히, 모바일은 한 번에 하나만 보여준다.
 *
 * 선택한 방은 주소(/chat-rooms/:id)가 정한다. 새로고침·뒤로가기·알림 링크가 같은 방을 연다.
 * 목록과 방은 서로를 모른다. 둘 다 같은 WebSocket 이벤트를 각자 구독해 자기 상태만 맞춘다.
 */
export default function ChatPage({ user, roomId = null, onSelectRoom, onLogin, onOpenProduct, onOpenProfile, onReport, onBlock }) {
  const [listRevision, setListRevision] = useState(0);

  if (!user) {
    return <main className={styles.shell + " " + styles.single} id="main" tabIndex={-1}>
      <section className={styles.guest}>
        <h1 className={styles.title}>채팅</h1>
        <p className={styles.sub}>로그인하면 이웃과 나눈 대화를 볼 수 있어요.</p>
        <button className={styles.primary} onClick={onLogin}>로그인하기</button>
      </section>
    </main>;
  }

  return <main className={styles.shell + (roomId ? " " + styles.roomOpen : "")} id="main" tabIndex={-1}>
    <section className={styles.listPane} aria-label="채팅 목록">
      <h1 className={styles.title}>채팅</h1>
      <ChatList key={listRevision} me={user.id} selectedId={roomId} onSelect={onSelectRoom} />
    </section>
    <section className={styles.roomPane} aria-label="채팅방">
      {roomId
        ? <ChatRoom key={roomId} roomId={roomId} me={user.id} onBack={() => onSelectRoom(null)}
            onOpenProduct={onOpenProduct} onOpenProfile={onOpenProfile}
            // 나간 방은 목록에서 사라져야 하므로 목록을 새로 불러온다.
            // 기록을 바꿔치기해 뒤로가기로 나간 방(404)에 다시 들어가지 않게 한다.
            onLeft={() => { onSelectRoom(null, { replace: true }); setListRevision((value) => value + 1); }}
            onReport={onReport}
            // 차단하면 이 방은 목록에서 빠진다. 나가기와 같이 목록으로 돌아가고 목록을 새로 받는다.
            onBlock={async (person) => {
              if (await onBlock(person)) { onSelectRoom(null, { replace: true }); setListRevision((value) => value + 1); }
            }} />
        : <p className={styles.placeholder}>대화할 채팅방을 선택해 주세요.</p>}
    </section>
  </main>;
}
