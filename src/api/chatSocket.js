import { Client } from "@stomp/stompjs";
import { client as defaultApi } from "./client.js";

const SUBSCRIPTION = "/user/queue/chat";

function defaultUrl() {
  const configured = import.meta.env?.VITE_WS_URL;
  if (configured) return configured;
  // 개발 서버와 같은 출처로 붙고 Vite 프록시가 백엔드로 넘긴다. 배포에서는 VITE_WS_URL 로 백엔드 도메인을 준다
  // (Vercel rewrites 는 WebSocket 을 중계하지 못한다).
  const protocol = globalThis.location?.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${globalThis.location?.host}/api/ws`;
}

/**
 * 채팅 실시간 연결 관리자. 화면은 이벤트와 "연결됨" 알림만 구독한다.
 *
 * - 로그인하면 start, 로그아웃하면 stop. 끊기면 라이브러리가 자동으로 다시 연결한다.
 * - 연결할 때마다 현재 access token 을 CONNECT 헤더에 싣는다(재발급된 토큰을 자동으로 쓴다).
 * - 서버가 EXPIRED_TOKEN 으로 거부하면 REST 클라이언트의 재발급을 공유해 새 토큰을 받고, 자동 재연결에 맡긴다.
 *   INVALID_TOKEN·UNAUTHORIZED 면 세션을 지운다(REST 의 401 처리와 같은 규칙).
 * - 연결될 때마다 onConnected 를 알린다. 끊긴 동안의 이벤트는 서버가 다시 보내지 않으므로
 *   화면은 이 알림을 받으면 REST 로 다시 불러와야 한다.
 *
 * 의존성을 주입받는 이유: 실제 서버 없이 토큰 만료·세션 삭제 처리를 단위 테스트하기 위해서다.
 */
export function createChatSocket({ api = defaultApi, createClient = (options) => new Client(options), url = defaultUrl } = {}) {
  const eventListeners = new Set();
  const connectedListeners = new Set();
  let stomp = null;

  function emit(listeners, value) {
    listeners.forEach((listener) => {
      try { listener(value); } catch (error) { console.error(error); }
    });
  }

  async function handleRejection(code) {
    if (code === "EXPIRED_TOKEN") {
      // 재발급 실패 중 INVALID_REFRESH_TOKEN 은 REST 클라이언트가 세션을 지운다. 네트워크 오류면 다음 재연결에서 다시 시도한다.
      try { await api.refreshTokens(); } catch { /* 위 설명 참고 */ }
    } else if (code === "INVALID_TOKEN" || code === "UNAUTHORIZED") {
      api.clearSession();
    }
  }

  function start() {
    if (stomp) return;
    const current = createClient({
      brokerURL: url(),
      reconnectDelay: 3000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      beforeConnect: async (instance) => {
        const token = api.getSession()?.accessToken;
        if (!token) { await instance.deactivate(); return; }
        instance.connectHeaders = { Authorization: `Bearer ${token}` };
      },
      onConnect: () => {
        current.subscribe(SUBSCRIPTION, (frame) => {
          let event;
          try { event = JSON.parse(frame.body); } catch { return; }
          emit(eventListeners, event);
        });
        emit(connectedListeners);
      },
      onStompError: (frame) => handleRejection(frame.headers?.message),
    });
    stomp = current;
    current.activate();
  }

  function stop() {
    const current = stomp;
    stomp = null;
    current?.deactivate();
  }

  return {
    start,
    stop,
    /** @returns 구독 해제 함수 */
    onEvent: (listener) => { eventListeners.add(listener); return () => eventListeners.delete(listener); },
    onConnected: (listener) => { connectedListeners.add(listener); return () => connectedListeners.delete(listener); },
  };
}

export const chatSocket = createChatSocket();
