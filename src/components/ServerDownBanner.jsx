import { useState, useSyncExternalStore } from "react";
import { serverStatus } from "../serverStatus.js";
import styles from "./ServerDownBanner.module.css";

/** 백엔드 README 의 화면 캡처 부분. 서버가 꺼져 있어도 어떤 화면인지 볼 수 있게 한다. */
export const SCREENSHOTS_URL = "https://github.com/leejiseong20/golmok-market#화면";

/**
 * 데모 서버가 꺼져 있을 때의 안내 띠. 헤더 바로 아래에 둔다(헤더·하단 탭은 그대로 쓴다).
 *
 * 데모 백엔드는 수업용 AWS 환경(Learner Lab)이라 세션이 끝나면 꺼진다. 그동안 화면 곳곳에 빨간 오류 줄만 뜨면
 * 포트폴리오를 보러 온 사람은 이유도, 할 수 있는 일도 알 수 없다. 이유를 한 곳에서 말하고 화면 캡처로 안내한다.
 *
 * 다시 켜지면 "다시 연결됐어요"로 바꾼다. 홈 목록·카테고리·인기 검색어는 저절로 다시 부르고(App·PopularKeywords),
 * 페이지 전체를 새로고침하지는 않는다 — 보던 화면이 갑자기 바뀌면 안 된다. 다른 화면을 위해 새로고침 버튼은 둔다.
 */
export default function ServerDownBanner() {
  const state = useSyncExternalStore(serverStatus.subscribe, serverStatus.getState);
  const [checking, setChecking] = useState(false);

  async function recheck() {
    setChecking(true);
    try { await serverStatus.check(); } finally { setChecking(false); }
  }

  if (state === "down") {
    return <section className={styles.banner} role="status" aria-label="데모 서버 상태">
      <div className={styles.body}>
        <strong className={styles.title}>데모 서버가 지금 꺼져 있어요</strong>
        <p className={styles.text}>이 프로젝트의 백엔드는 수업용 AWS 환경(Learner Lab)에서 돌아가서, 세션이 끝나면 꺼져요.
          켜지면 저절로 알려 드려요.</p>
      </div>
      <div className={styles.actions}>
        <a className="btn btn-primary btn-sm" href={SCREENSHOTS_URL} target="_blank" rel="noopener noreferrer">화면 캡처 보기</a>
        <button type="button" className="btn btn-outline btn-sm" onClick={recheck} disabled={checking}>
          {checking ? "확인 중…" : "다시 확인"}</button>
      </div>
    </section>;
  }

  if (state === "recovered") {
    return <section className={styles.banner + " " + styles.ok} role="status" aria-label="데모 서버 상태">
      <div className={styles.body}>
        <strong className={styles.title}>다시 연결됐어요</strong>
        <p className={styles.text}>홈 목록은 다시 불러왔어요. 다른 화면이 비어 있으면 새로고침해 주세요.</p>
      </div>
      <div className={styles.actions}>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>새로고침</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={serverStatus.dismiss}>닫기</button>
      </div>
    </section>;
  }

  return null;
}
