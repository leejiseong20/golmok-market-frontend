/**
 * 백엔드가 살아 있는지. 데모 백엔드는 수업용 AWS 환경(Learner Lab)이라 세션이 끝나면 꺼진다.
 * 꺼져 있으면 화면 곳곳에 빨간 오류 줄만 뜨고 이유를 알 수 없어, 한 곳(ServerDownBanner)에서 설명하려고 상태를 모은다.
 *
 * 상태: unknown(아직 모름) → up | down. down 에서 다시 응답이 오면 recovered(다시 연결됨, 새로고침 권함) → dismiss 로 up.
 *
 * "꺼짐"으로 보는 것 — 서버가 직접 답하지 못했다는 신호만 쓴다.
 * - 연결 실패(네트워크 오류), 확인 요청이 제한 시간 안에 답하지 않음
 * - 502·503·504: 앞단(Vercel·Caddy)이 뒤의 서버에 닿지 못했을 때 준다
 * - JSON 이 아닌 응답: 우리 API 는 항상 JSON 이라, 그 밖의 본문은 앞단이 만든 오류 화면이다
 * 서버가 JSON 으로 답했으면 4xx 여도 "켜짐"이다(살아서 답했다).
 */

const GATEWAY_FAILURES = new Set([502, 503, 504]);

/** 응답 하나를 판정한다. networkError 면 status·text 는 보지 않는다. */
export function classifyResponse({ networkError = false, status = 0, text = "" } = {}) {
  if (networkError || GATEWAY_FAILURES.has(status)) return "down";
  if (!text) return "up"; // 본문 없는 응답(204·201)은 서버가 직접 준 것이다.
  try {
    JSON.parse(text);
    return "up";
  } catch {
    return "down";
  }
}

/**
 * probe(signal) 는 가벼운 공개 API 를 부르고 fetch 응답을 돌려준다. timer 는 테스트에서 바꿔 끼운다.
 * 꺼져 있는 동안은 retryMs 마다 다시 확인한다(켜지면 멈춘다).
 */
export function createServerStatus({ probe, timer = globalThis, timeoutMs = 8_000, retryMs = 30_000 }) {
  const listeners = new Set();
  let state = "unknown";
  let retryHandle = null;
  let checking = null;

  function set(next) {
    if (state === next) return;
    state = next;
    listeners.forEach((listener) => listener());
  }

  function scheduleRetry() {
    if (retryHandle !== null) return;
    retryHandle = timer.setTimeout(() => {
      retryHandle = null;
      check();
    }, retryMs);
  }

  function stopRetry() {
    if (retryHandle === null) return;
    timer.clearTimeout(retryHandle);
    retryHandle = null;
  }

  /** 요청 결과("up" | "down")를 알린다. API 클라이언트가 응답마다 부른다. */
  function report(result) {
    if (result === "down") {
      set("down");
      scheduleRetry();
      return;
    }
    stopRetry();
    if (state === "down") set("recovered");
    else if (state === "unknown") set("up");
  }

  /** 지금 확인한다. 이미 확인 중이면 그 결과를 같이 기다린다(버튼 연타에도 요청은 하나). */
  function check() {
    if (checking) return checking;
    const abort = new AbortController();
    const timeout = timer.setTimeout(() => abort.abort(), timeoutMs);
    checking = (async () => {
      let result;
      try {
        const response = await probe(abort.signal);
        const text = await response.text();
        result = classifyResponse({ status: response.status, text });
      } catch {
        // 연결 실패와 제한 시간 초과(abort) 모두 꺼짐이다.
        result = "down";
      } finally {
        timer.clearTimeout(timeout);
        checking = null;
      }
      report(result);
      return result;
    })();
    return checking;
  }

  return {
    report,
    check,
    /** "다시 연결됐어요" 안내를 닫는다. */
    dismiss: () => { if (state === "recovered") set("up"); },
    getState: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

// 확인 요청은 토큰 없이 공개 API 를 부른다(API 클라이언트를 거치면 만료 토큰 재발급 흐름에 끼어든다).
const apiBase = (import.meta.env?.VITE_API_BASE || "/api").replace(/\/$/, "");
export const serverStatus = createServerStatus({
  probe: (signal) => fetch(`${apiBase}/categories`, { signal, cache: "no-store" }),
});
