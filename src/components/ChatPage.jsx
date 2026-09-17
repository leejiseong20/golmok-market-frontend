import { useState } from "react";
import ChatList from "./ChatList.jsx";
import ChatRoom from "./ChatRoom.jsx";
import styles from "./ChatPage.module.css";

/**
 * 채팅 화면. PC 는 목록과 방을 나란히, 모바일은 한 번에 하나만 보여준다.
 *
 * 선택한 방은 이 컴포넌트가 들고 있고, 목록과 방은 서로를 모른다.
 * 둘 다 같은 WebSocket 이벤트를 각자 구독해 자기 상태만 맞춘다(한쪽이 다른 쪽을 갱신하지 않는다).
 */
export default function ChatPage({ user, initialRoomId = null, onLogin, onOpenProduct }) {
  const [roomId, setRoomId] = useState(initialRoomId);
  const [listRevision, setListRevision] = useState(0);

  if (!user) {
    return <main className={styles.shell + " " + styles.single}>
      <section className={styles.guest}>
        <h1 className={styles.title}>채팅</h1>
        <p className={styles.sub}>로그인하면 이웃과 나눈 대화를 볼 수 있어요.</p>
        <button className={styles.primary} onClick={onLogin}>로그인하기</button>
      </section>
    </main>;
  }

  return <main className={styles.shell + (roomId ? " " + styles.roomOpen : "")}>
    <section className={styles.listPane} aria-label="채팅 목록">
      <h1 className={styles.title}>채팅</h1>
      <ChatList key={listRevision} me={user.id} selectedId={roomId} onSelect={setRoomId} />
    </section>
    <section className={styles.roomPane} aria-label="채팅방">
      {roomId
        ? <ChatRoom key={roomId} roomId={roomId} me={user.id} onBack={() => setRoomId(null)}
            onOpenProduct={onOpenProduct}
            // 나간 방은 목록에서 사라져야 하므로 목록을 새로 불러온다.
            onLeft={() => { setRoomId(null); setListRevision((value) => value + 1); }} />
        : <p className={styles.placeholder}>대화할 채팅방을 선택해 주세요.</p>}
    </section>
  </main>;
}
