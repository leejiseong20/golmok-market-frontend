import styles from "./NotFound.module.css";

/** 없는 주소·잘못된 id(/products/abc 등). 사용자가 주소를 직접 고치거나 오래된 링크로 들어온 경우다. */
export default function NotFound({ onHome }) {
  return <main className={styles.shell}>
    <section className={styles.box}>
      <h1 className={styles.title}>페이지를 찾을 수 없어요</h1>
      <p className={styles.sub}>주소가 바뀌었거나 잘못 입력됐을 수 있어요.</p>
      <button className={styles.primary} onClick={onHome}>홈으로 가기</button>
    </section>
  </main>;
}
