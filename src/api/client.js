const SESSION_KEY = "golmok.session";

export class ApiError extends Error {
  constructor(message, { status = 0, code = "NETWORK_ERROR", errors = [] } = {}) {
    super(message);
    this.name = "ApiError";
    Object.assign(this, { status, code, errors });
  }
}

// 의존성을 주입해 실제 토큰 없이 동시 재발급·네트워크 실패를 테스트한다.
export function createApiClient({ baseUrl = "/api", fetchImpl = (...args) => fetch(...args), storage } = {}) {
  const listeners = new Set();
  let session = null;
  let generation = 0;
  let refreshFlight = null;
  try {
    const saved = JSON.parse(storage?.getItem(SESSION_KEY) ?? "null");
    if (saved?.accessToken && saved?.refreshToken && saved?.user?.id && saved?.user?.nickname) session = saved;
  } catch { /* 저장소 차단·잘못된 JSON이면 비로그인으로 시작한다. */ }

  function publish(value) {
    session = value;
    try {
      if (value) storage?.setItem(SESSION_KEY, JSON.stringify(value));
      else storage?.removeItem(SESSION_KEY);
    } catch { /* 저장이 막혀도 현재 탭 메모리에서 로그인은 유지한다. */ }
    listeners.forEach((listener) => listener());
  }

  function clearSession() {
    generation++;
    publish(null);
  }

  async function send(path, { method = "GET", body, signal, token } = {}) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}${path}`, {
        method, signal,
        headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw new ApiError("서버에 연결할 수 없습니다. 연결 상태를 확인하고 다시 시도해 주세요.");
    }
    if (response.status === 204) return null;
    let data;
    try { data = await response.json(); }
    catch {
      throw new ApiError("서버 응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.", { status: response.status, code: "INVALID_RESPONSE" });
    }
    if (!response.ok) throw new ApiError(data.message ?? "요청을 처리하지 못했습니다.", {
      status: response.status, code: data.code, errors: data.errors ?? [],
    });
    return data;
  }

  function refresh() {
    if (!session) return Promise.reject(new ApiError("다시 로그인해 주세요.", { code: "SESSION_CHANGED" }));
    if (refreshFlight?.generation === generation) return refreshFlight.promise;
    const started = generation;
    const previous = session;
    const promise = (async () => {
      try {
        // 특정 화면의 AbortSignal을 공유하지 않는다. 다른 요청도 이 재발급을 기다릴 수 있다.
        const tokens = await send("/auth/reissue", { method: "POST", body: { refreshToken: previous.refreshToken } });
        if (generation !== started || session?.refreshToken !== previous.refreshToken) {
          throw new ApiError("로그인 상태가 변경됐습니다. 다시 시도해 주세요.", { code: "SESSION_CHANGED" });
        }
        publish({ ...previous, ...tokens });
      } catch (error) {
        if (generation === started && ["INVALID_REFRESH_TOKEN", "USER_NOT_ACTIVE"].includes(error.code)) clearSession();
        // 네트워크 오류·서버 5xx에서는 토큰을 지우지 않는다.
        throw error;
      }
    })();
    refreshFlight = { generation: started, promise };
    const cleanup = () => { if (refreshFlight?.promise === promise) refreshFlight = null; };
    promise.then(cleanup, cleanup);
    return promise;
  }

  async function request(path, options = {}) {
    const started = generation;
    const auth = options.auth !== false;
    const token = auth ? session?.accessToken : null;
    const body = typeof options.body === "function" ? options.body() : options.body;
    try {
      return await send(path, { ...options, body, token });
    } catch (error) {
      if (auth && token && generation === started && error.code === "EXPIRED_TOKEN" && options.retry !== false) {
        // 늦게 도착한 이전 토큰의 401이면 이미 갱신된 토큰을 사용한다.
        if (session?.accessToken === token) await refresh();
        if (generation !== started) throw new ApiError("다시 로그인해 주세요.", { code: "SESSION_CHANGED" });
        options.signal?.throwIfAborted();
        return request(path, { ...options, retry: false });
      }
      if (auth && token && generation === started && session?.accessToken === token &&
          ["INVALID_TOKEN", "EXPIRED_TOKEN", "UNAUTHORIZED"].includes(error.code)) clearSession();
      throw error;
    }
  }

  return {
    request,
    getSession: () => session,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    clearSession,
    async login(credentials) {
      const started = generation;
      const result = await send("/auth/login", { method: "POST", body: credentials });
      if (generation !== started) throw new ApiError("로그인 상태가 변경됐습니다.", { code: "SESSION_CHANGED" });
      generation++;
      publish(result);
      return result;
    },
    async logout() {
      const started = generation;
      if (!session) return;
      if (refreshFlight?.generation === started) await refreshFlight.promise;
      if (generation !== started) return;
      // 만료로 재시도할 때도 현재 refresh token을 보내야 회전된 토큰까지 폐기된다.
      await request("/auth/logout", { method: "POST", body: () => ({ refreshToken: session?.refreshToken }) });
      if (generation === started) clearSession();
    },
  };
}

let tabStorage;
try { tabStorage = globalThis.sessionStorage; } catch { /* 비공개 모드 등 */ }
export const client = createApiClient({ baseUrl: import.meta.env?.VITE_API_BASE || "/api", storage: tabStorage });
