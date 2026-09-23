import { test, expect } from "@playwright/test";

/**
 * 채팅 실시간 흐름. 백엔드 없이 돈다.
 *
 * REST 는 route 로, WebSocket 은 routeWebSocket 으로 가로채 **서버인 척** STOMP 프레임을 보낸다.
 * 이 프로젝트의 핵심 기능인데 자동 테스트가 없어서, 화면이 이벤트를 받아 그리는 부분이 조용히 깨질 수 있었다.
 *
 * 한계: 서버가 실제로 보내는 프레임이 이 모양인지는 여기서 보장하지 않는다.
 * 그쪽은 백엔드의 STOMP 테스트(실제 포트로 붙어 검증)가 맡는다. 여기서는 "그 모양이 오면 화면이 어떻게 되는가"만 본다.
 */

const ME = 8;          // 로그인한 사람
const OPPONENT = 12;   // 상대
const ROOM = 7;

const product = { id: 44, title: "원목 식탁", price: 80000, thumbnailUrl: null, status: "ON_SALE", deleted: false };
const opponent = { id: OPPONENT, nickname: "이웃", profileImageUrl: null, mannerTemp: 36.5, withdrawn: false };
const roomInfo = {
  roomId: ROOM, product, opponent, myRole: "BUYER", opponentLeft: false,
  trade: null, tradeActions: { reserve: false, cancel: false, complete: false, review: false },
  createdAt: "2026-09-17T10:20:00",
};
const message = (id, senderId, content) => ({
  id, roomId: ROOM, senderId, type: "TEXT", content, read: false, createdAt: "2026-09-17T10:21:30",
});

/** 서버 → 클라이언트 STOMP 프레임. 헤더 뒤 빈 줄, 본문 끝에 NULL 문자다. */
function frame(command, headers, body = "") {
  const lines = Object.entries(headers).map(([key, value]) => `${key}:${value}`);
  return `${command}\n${lines.join("\n")}\n\n${body}\0`;
}

/**
 * 서버 대역. CONNECT 에 CONNECTED 로 답하고, 구독 id 를 기억해 두었다가 이벤트를 밀어 넣는다.
 * 하트비트는 0,0 으로 꺼서 테스트가 시간에 흔들리지 않게 한다.
 */
async function mockSocket(page) {
  let ready;
  // 구독(SUBSCRIBE)이 끝나기 전에 이벤트를 밀어 넣으면 클라이언트가 받을 곳이 없다. 그 시점을 알리는 약속이다.
  const state = { push: null, sent: [], subscribed: new Promise((resolve) => { ready = resolve; }) };
  await page.routeWebSocket(/\/api\/ws/, (ws) => {
    let subscription = null;
    ws.onMessage((raw) => {
      const text = String(raw);
      state.sent.push(text);
      const command = text.split("\n")[0];
      if (command === "CONNECT" || command === "STOMP") {
        ws.send(frame("CONNECTED", { version: "1.2", "heart-beat": "0,0" }));
      } else if (command === "SUBSCRIBE") {
        subscription = /(^|\n)id:(.*)/.exec(text)?.[2]?.trim() ?? "sub-0";
        ready();
      }
    });
    state.push = (event) => {
      if (!subscription) throw new Error("아직 구독 전이다. socket.subscribed 를 기다린 뒤 밀어 넣어야 한다.");
      return ws.send(frame("MESSAGE", {
        subscription,
        "message-id": String(Date.now()),
        destination: "/user/queue/chat",
        "content-type": "application/json",
      }, JSON.stringify(event)));
    };
  });
  return state;
}

async function mockRest(page, { rooms, messages }) {
  const calls = [];
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    calls.push(`${request.method()} ${url.pathname}`);
    const reply = (json, status = 200) => route.fulfill({ status, json });
    if (url.pathname === "/api/chat-rooms") return reply({ content: rooms(), nextCursor: null, hasNext: false });
    if (url.pathname === "/api/chat-rooms/unread-count") return reply({ count: rooms().reduce((sum, room) => sum + room.unreadCount, 0) });
    if (request.method() === "POST" && url.pathname === `/api/chat-rooms/${ROOM}/messages`) {
      return reply(message(32, ME, request.postDataJSON().content), 201);
    }
    if (url.pathname === `/api/chat-rooms/${ROOM}/messages`) return reply({ content: messages(), nextCursor: null, hasNext: false });
    if (url.pathname === `/api/chat-rooms/${ROOM}/read`) return route.fulfill({ status: 204 });
    if (url.pathname === `/api/chat-rooms/${ROOM}`) return reply(roomInfo);
    if (url.pathname === "/api/notifications/unread-count") return reply({ count: 0 });
    if (url.pathname === "/api/categories") return reply([]);
    if (url.pathname === "/api/push/public-key") return reply({ enabled: false, publicKey: null });
    return reply({ code: "RESOURCE_NOT_FOUND", message: "없음" }, 404);
  });
  return calls;
}

/** 로그인 상태로 시작한다. 세션 저장 위치는 "로그인 상태 유지"와 같은 기준(localStorage)이다. */
async function signIn(page) {
  await page.addInitScript((user) => {
    localStorage.setItem("golmok.session", JSON.stringify({
      accessToken: "test-access", refreshToken: "test-refresh", user,
    }));
  }, { id: ME, nickname: "골목이" });
}

test("채팅 목록·방에서 실시간 메시지와 읽음을 반영한다", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let rooms = [{ roomId: ROOM, product, opponent, lastMessage: "아직 판매중인가요?", lastMessageAt: "2026-09-17T10:21:00", unreadCount: 2 }];
  let messages = [message(31, OPPONENT, "아직 판매중인가요?")];
  const socket = await mockSocket(page);
  await mockRest(page, { rooms: () => rooms, messages: () => messages });
  await signIn(page);

  await page.goto("/chat");
  await socket.subscribed;
  const list = page.getByRole("region", { name: "채팅 목록" });
  await expect(list.getByText("아직 판매중인가요?")).toBeVisible();

  // 방을 열면 이전 대화가 보인다.
  await page.getByRole("button", { name: /이웃/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/chat-rooms/${ROOM}$`));
  const room = page.getByRole("region", { name: "채팅방" });
  await expect(room.getByText("아직 판매중인가요?")).toBeVisible();

  // 서버가 상대의 새 메시지를 밀어 넣으면 화면에 바로 뜬다(다시 불러오지 않는다).
  messages = [message(33, OPPONENT, "네, 판매중이에요"), ...messages];
  await socket.push({ type: "MESSAGE", roomId: ROOM, message: message(33, OPPONENT, "네, 판매중이에요") });
  await expect(room.getByText("네, 판매중이에요")).toBeVisible();

  // 내가 보낸 메시지는 REST 응답으로 그리고, 같은 메시지가 소켓으로 다시 와도 두 번 그리지 않는다.
  const input = page.getByRole("textbox", { name: "메시지 입력" });
  await input.fill("지금 보러 갈게요");
  await input.press("Enter");
  await expect(room.getByText("지금 보러 갈게요")).toHaveCount(1);
  await socket.push({ type: "MESSAGE", roomId: ROOM, message: message(32, ME, "지금 보러 갈게요") });
  await expect(room.getByText("지금 보러 갈게요")).toHaveCount(1);

  // 상대가 읽으면 내 메시지에 읽음 표시가 붙는다.
  await socket.push({ type: "READ", roomId: ROOM, readerId: OPPONENT });
  await expect(room.getByText("읽음").first()).toBeVisible();

  // CONNECT 프레임에 토큰이 실렸는지(서버가 이걸로 인증한다).
  expect(socket.sent.some((text) => text.startsWith("CONNECT") && text.includes("Bearer test-access"))).toBeTruthy();
  expect(errors).toEqual([]);
});

test("목록의 안 읽은 수는 새 메시지에 늘고 내 읽음 이벤트에 사라진다", async ({ page }) => {
  let rooms = [{ roomId: ROOM, product, opponent, lastMessage: "안녕하세요", lastMessageAt: "2026-09-17T10:21:00", unreadCount: 0 }];
  const socket = await mockSocket(page);
  await mockRest(page, { rooms: () => rooms, messages: () => [message(31, OPPONENT, "안녕하세요")] });
  await signIn(page);

  await page.goto("/chat");
  await socket.subscribed;
  await expect(page.getByRole("region", { name: "채팅 목록" }).getByText("안녕하세요")).toBeVisible();

  // 방을 열지 않은 상태에서 상대 메시지가 오면 안 읽은 수가 는다.
  // 목업도 서버처럼 상태를 바꾼다 — 소켓 이벤트와 (연결 직후의) 목록 재조회가 겹쳐도 결과가 같아야 한다.
  rooms = [{ ...rooms[0], lastMessage: "혹시 오늘 가능할까요?", lastMessageAt: "2026-09-17T10:22:00", unreadCount: 1 }];
  await socket.push({ type: "MESSAGE", roomId: ROOM, message: message(34, OPPONENT, "혹시 오늘 가능할까요?") });
  const list = page.getByRole("region", { name: "채팅 목록" });
  await expect(list.getByText("혹시 오늘 가능할까요?")).toBeVisible();
  await expect(list.getByLabel("안 읽은 메시지 1개")).toBeVisible();

  // 다른 기기에서 내가 읽으면(READ · readerId = 나) 뱃지가 사라진다.
  rooms = [{ ...rooms[0], unreadCount: 0 }];
  await socket.push({ type: "READ", roomId: ROOM, readerId: ME });
  await expect(list.getByLabel("안 읽은 메시지 1개")).toHaveCount(0);
});
