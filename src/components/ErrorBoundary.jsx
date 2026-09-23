import { Component } from "react";
import { isChunkLoadError } from "../crash.js";
import Modal from "./Modal.jsx";
import styles from "./ErrorBoundary.module.css";

/**
 * 오류 경계. 아래 컴포넌트가 화면을 그리다 던지면 앱 전체가 빈 화면이 되는 대신 fallback 을 보인다.
 *
 * 한 겹이 아니라 여러 겹으로 둔다(App 참고). 본문이 망가져도 헤더·하단 탭으로 다른 곳에 갈 수 있고,
 * 인기 검색어 같은 부가 영역은 망가지면 조용히 사라진다.
 *
 * - resetKey 가 바뀌면 오류 상태를 푼다. 페이지 경계는 주소를 넣어 두어, 다른 화면으로 옮기면 저절로 풀린다.
 *   key 로 통째로 다시 만들지 않는 이유: 같은 화면 안의 주소 변화(탭 전환 등)에도 화면이 다시 만들어져 상태를 잃는다.
 * - fallback 은 요소 또는 ({ error, chunk, reset }) => 요소. 비우면 아무것도 그리지 않는다.
 * - 잡을 수 없는 것: 요청 실패·버튼 처리 중 오류(렌더 밖). 그건 화면마다 이미 오류 상태·알림으로 다룬다.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // 밖으로 보내지 않는다(오류 수집 서비스를 쓰지 않는다). 개발자 도구에서 어느 경계가 잡았는지 보이게 이름을 붙인다.
    console.error(`[오류 경계: ${this.props.name ?? "이름 없음"}]`, error, info?.componentStack);
  }

  componentDidUpdate(previous) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { fallback = null } = this.props;
    return typeof fallback === "function"
      ? fallback({ error, chunk: isChunkLoadError(error), reset: this.reset })
      : fallback;
  }
}

const reload = () => window.location.reload();

/**
 * 본문 자리에 보이는 안내. full 이면 화면 전체(가장 바깥 경계 — 라우터·헤더까지 망가졌을 수 있다).
 * 나눠진 파일을 받지 못했으면 다시 시도로 풀리지 않으니 새로고침만 권한다.
 */
export function CrashNotice({ chunk, onRetry, onHome, full = false }) {
  return <main className={styles.shell + (full ? " " + styles.full : "")} id="main" tabIndex={-1}>
    <section className={styles.box} role="alert">
      <h1 className={styles.title}>{chunk ? "새 버전이 나왔어요" : "화면을 보여 드리지 못했어요"}</h1>
      <p className={styles.sub}>{chunk
        ? "새로고침하면 최신 화면으로 바뀌어요."
        : onRetry ? "잠시 문제가 생겼어요. 다시 시도하거나 새로고침해 주세요."
        : "잠시 문제가 생겼어요. 새로고침하거나 홈으로 가 주세요."}</p>
      <div className={styles.buttons}>
        {chunk || !onRetry
          ? <button className="btn btn-primary" onClick={reload}>새로고침</button>
          : <button className="btn btn-primary" onClick={onRetry}>다시 시도</button>}
        {onHome && <button className="btn btn-outline" onClick={onHome}>홈으로</button>}
      </div>
    </section>
  </main>;
}

/** 창(상품 상세·프로필 등) 안에서 망가졌을 때. 창만 닫으면 밑의 화면은 그대로 쓴다. */
export function CrashDialog({ chunk, onClose }) {
  return <Modal title="문제가 생겼어요" onClose={onClose}>
    <div className={styles.dialog} role="alert">
      <p className={styles.sub}>{chunk
        ? "새 버전이 나왔어요. 새로고침하면 최신 화면으로 바뀌어요."
        : "이 창을 보여 드리지 못했어요. 닫고 다시 열어 주세요."}</p>
      <div className={styles.buttons}>
        {chunk && <button className="btn btn-primary" onClick={reload}>새로고침</button>}
        <button className={"btn " + (chunk ? "btn-outline" : "btn-primary")} onClick={onClose}>닫기</button>
      </div>
    </div>
  </Modal>;
}
