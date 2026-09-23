/**
 * 화면 오류 보고. 오류 경계가 잡은 렌더 오류를 서버 로그로 보낸다(`POST /api/client-errors`).
 *
 * 경계는 오류를 콘솔에만 남겨, 운영에서 사용자에게 난 오류를 개발자가 알 방법이 없었다.
 *
 * - **사람을 가릴 값은 보내지 않는다.** 토큰을 붙이지 않고(client.request 대신 fetch), 주소는 경로만 보낸다
 *   (쿼리에는 검색어가 들어 있을 수 있다).
 * - **보고가 실패해도 아무 일도 없어야 한다.** 이미 화면이 망가진 상황에서 보고까지 던지면 더 망가진다. 모든 실패를 삼킨다.
 * - **한 페이지를 여는 동안 같은 오류는 한 번, 모두 합쳐 5건까지만.** 경계가 같은 오류를 되풀이해 잡아도(다시 시도 등)
 *   요청이 쏟아지지 않게 한다. 서버도 IP 당 1분 10건으로 막는다.
 */

export const MAX_REPORTS = 5;
const LIMITS = { boundary: 30, message: 300, path: 200, componentStack: 2000 };

const cut = (value, max) => (value.length <= max ? value : value.slice(0, max));

/** 서버가 받는 모양으로 만든다. 서버의 길이·형식 제한을 넘지 않게 여기서 자른다. */
export function buildCrashReport({ boundary, error, chunk, componentStack, pathname }) {
  const rawMessage = String(error?.message ?? error ?? "").trim();
  // 경로만 남긴다. pathname 에는 원래 쿼리가 없지만, 혹시 섞여 들어와도 ? # 뒤를 버린다.
  const path = String(pathname || "/").split(/[?#]/)[0];
  return {
    boundary: cut(String(boundary || "이름 없음"), LIMITS.boundary),
    kind: chunk ? "CHUNK" : "RENDER",
    message: cut(rawMessage || "(메시지 없음)", LIMITS.message),
    path: cut(path.startsWith("/") ? path : "/" + path, LIMITS.path),
    componentStack: componentStack ? cut(String(componentStack), LIMITS.componentStack) : null,
  };
}

/**
 * 보고기를 만든다. send 는 본문을 받아 보내는 함수(테스트에서 바꿔 끼운다).
 * report 는 실제로 보냈으면 true, 중복·상한으로 건너뛰었으면 false 를 돌려준다. 절대 던지지 않는다.
 */
export function createCrashReporter({ send, max = MAX_REPORTS }) {
  const seen = new Set();
  let count = 0;
  return function report(details) {
    try {
      const body = buildCrashReport(details);
      const key = `${body.boundary}|${body.kind}|${body.message}`;
      if (seen.has(key) || count >= max) return false;
      seen.add(key);
      count += 1;
      Promise.resolve(send(body)).catch(() => {});
      return true;
    } catch {
      return false;
    }
  };
}

/**
 * 실제 보내기. keepalive 로 보내 "새로고침"을 바로 눌러 페이지가 사라져도 요청이 끝까지 간다.
 * 주소는 API 클라이언트와 같은 기준(VITE_API_BASE, 없으면 /api)을 쓴다.
 */
function sendToServer(body) {
  const base = (import.meta.env?.VITE_API_BASE || "/api").replace(/\/$/, "");
  return fetch(`${base}/client-errors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  });
}

export const reportCrash = createCrashReporter({ send: sendToServer });
