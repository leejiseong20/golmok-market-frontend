const SESSION_KEY = "golmok.session";

export class ApiError extends Error {
  constructor(message, { status = 0, code = "NETWORK_ERROR", errors = [] } = {}) {
    super(message);
    this.name = "ApiError";
    Object.assign(this, { status, code, errors });
  }
}

/**
 * 의존성을 주입해 실제 토큰 없이 동시 재발급·네트워크 실패를 테스트한다.
 *
 * 저장소가 둘이다. storage 는 탭을 닫으면 사라지고(sessionStorage),
 * persistentStorage 는 남는다(localStorage). 로그인할 때 "로그인 상태 유지"로 어디에 둘지 고른다.
 * 세션은 언제나 한 곳에만 있다(고른 쪽에 쓰고 다른 쪽은 지운다).
 */
export function createApiClient({ baseUrl = "/api", fetchImpl = (...args) => fetch(...args), storage, persistentStorage } = {}) {
  const listeners = new Set();
  let session = null;
  let generation = 0;
  let refreshFlight = null;

  function read(from) {
    try {
      const saved = JSON.parse(from?.getItem(SESSION_KEY) ?? "null");
      return saved?.accessToken && saved?.refreshToken && saved?.user?.id && saved?.user?.nickname ? saved : null;
    } catch {
      return null; // 저장소 차단·잘못된 JSON이면 비로그인으로 시작한다.
    }
  }

  // 유지해 둔 로그인을 먼저 본다. 이후 토큰 재발급도 처음 복원한 저장소에 이어서 쓴다.
  const kept = read(persistentStorage);
  let activeStorage = kept ? persistentStorage : storage;
  session = kept ?? read(storage);

  function publish(value) {
    session = value;
    try {
      if (value) activeStorage?.setItem(SESSION_KEY, JSON.stringify(value));
      else activeStorage?.removeItem(SESSION_KEY);
      // 쓰지 않는 쪽에 옛 세션이 남아 있으면 다음 방문에 되살아난다.
      const other = activeStorage === persistentStorage ? storage : persistentStorage;
      other?.removeItem(SESSION_KEY);
    } catch { /* 저장이 막혀도 현재 탭 메모리에서 로그인은 유지한다. */ }
    listeners.forEach((listener) => listener());
  }

  function clearSession() {
    generation++;
    publish(null);
  }

  async function send(path, { method = "GET", body, signal, token } = {}) {
    const multipart = typeof FormData !== "undefined" && body instanceof FormData;
    let response;
    try {
      response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}${path}`, {
        method, signal,
        headers: { ...(body === undefined || multipart ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
      });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw new ApiError("서버에 연결할 수 없습니다. 연결 상태를 확인하고 다시 시도해 주세요.");
    }
    /*
     * 본문이 비어 있으면 null 이다. 204 만 비어 있는 것이 아니다 — 차단(POST)은 201 에 본문이 없다.
     * 예전에는 204 만 따로 보고 나머지는 JSON 으로 읽어서, 성공한 차단이 "응답을 확인할 수 없습니다" 오류가 됐다.
     * 그래서 글자로 먼저 받고, 비어 있지 않을 때만 JSON 으로 읽는다.
     */
    let text;
    try { text = await response.text(); }
    catch (error) {
      if (error.name === "AbortError") throw error;
      throw new ApiError("서버 응답을 끝까지 받지 못했습니다. 다시 시도해 주세요.", { status: response.status });
    }
    if (!text) {
      if (response.ok) return null;
      throw new ApiError("요청을 처리하지 못했습니다.", { status: response.status, code: "INVALID_RESPONSE" });
    }
    let data;
    try { data = JSON.parse(text); }
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
    // 채팅 소켓이 EXPIRED_TOKEN 으로 거부될 때 쓴다. 따로 재발급하면 동시 재발급으로 한쪽 토큰이 폐기되므로 같은 비행을 공유한다.
    refreshTokens: refresh,
    /**
     * 저장된 로그인 사용자 정보(헤더 닉네임 등)를 바꾼다. 프로필 수정 성공 후에 쓴다.
     * 그 사이 로그아웃했거나 다른 계정으로 바뀌었으면 무시한다(늦게 끝난 요청이 새 세션을 덮지 않게).
     */
    updateUser(userId, changes) {
      if (!session || session.user.id !== userId) return;
      publish({ ...session, user: { ...session.user, ...changes } });
    },
    /** remember 가 true 면 탭을 닫아도 로그인이 유지된다(공용 PC 에서는 끈다). */
    async login(credentials, { remember = false } = {}) {
      const started = generation;
      const result = await send("/auth/login", { method: "POST", body: credentials });
      if (generation !== started) throw new ApiError("로그인 상태가 변경됐습니다.", { code: "SESSION_CHANGED" });
      generation++;
      activeStorage = remember && persistentStorage ? persistentStorage : storage;
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
let keepStorage;
try { tabStorage = globalThis.sessionStorage; } catch { /* 비공개 모드 등 */ }
try { keepStorage = globalThis.localStorage; } catch { /* 비공개 모드 등 */ }
export const client = createApiClient({
  baseUrl: import.meta.env?.VITE_API_BASE || "/api",
  storage: tabStorage,
  persistentStorage: keepStorage,
});
