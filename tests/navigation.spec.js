import { test, expect } from "@playwright/test";

/**
 * App 이 여러 화면에 걸쳐 챙기는 동작. App.jsx 를 나누기 전에 안전망으로 만들었다(나눈 뒤에도 그대로여야 한다).
 * - 스크롤 복원: 홈을 내려 보다가 다른 화면에 갔다 뒤로가기로 돌아오면 보던 자리다.
 * - 뱃지: 로그인하면 서버 값으로 맞추고, 실시간 이벤트가 오면 알림은 1 올리고 채팅은 서버에 다시 묻는다.
 */

const ME = 8;
const region = { id: 1, dong: "역삼동" };
const product = (id) => ({ id, title: `물건 ${id}`, price: 1000 * id, categoryId: 1, categoryName: "가구",
  regionName: "역삼동", sellerNickname: "이웃", thumbnailUrl: null, status: "ON_SALE", favoriteCount: 0,
  chatCount: 0, isLiked: false, createdAt: "2026-09-16T09:00:00", bumpedAt: "2026-09-16T09:00:00" });

function frame(command, headers, body = "") {
  const lines = Object.entries(headers).map(([key, value]) => `${key}:${value}`);
  return `${command}\n${lines.join("\n")}\n\n${body}\0`;
}

/** 서버 대역(chat.spec.js 와 같은 방식). 구독이 끝난 뒤에만 이벤트를 밀어 넣을 수 있다. */
async function mockSocket(page) {
  let ready;
  const state = { push: null, subscribed: new Promise((resolve) => { ready = resolve; }) };
  await page.routeWebSocket(/\/api\/ws/, (ws) => {
    let subscription = null;
    ws.onMessage((raw) => {
      const text = String(raw);
      const command = text.split("\n")[0];
      if (command === "CONNECT" || command === "STOMP") ws.send(frame("CONNECTED", { version: "1.2", "heart-beat": "0,0" }));
      else if (command === "SUBSCRIBE") { subscription = /(^|\n)id:(.*)/.exec(text)?.[2]?.trim() ?? "sub-0"; ready(); }
    });
    state.push = (event) => ws.send(frame("MESSAGE", { subscription, "message-id": String(Date.now()),
      destination: "/user/queue/chat", "content-type": "application/json" }, JSON.stringify(event)));
  });
  return state;
}

async function mockRest(page, counts = { notifications: 0, chat: 0 }, { slowAfterFirst = 0 } = {}) {
  const calls = [];
  let productLoads = 0;
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const url = new URL(route.request().url());
    calls.push(url.pathname);
    const reply = (json, status = 200) => route.fulfill({ status, json });
    if (url.pathname === "/api/categories") return reply([{ id: 1, name: "가구" }]);
    if (url.pathname === "/api/search/keywords/popular") return reply([]);
    if (url.pathname === "/api/products") {
      // 두 번째부터 늦게 준다. 뒤로가기로 돌아온 직후 목록이 비어 짧은 동안에는 브라우저 기본 복원이 끝까지 내려가지 못한다 —
      // 그래서 목록이 채워진 뒤 다시 맞추는 우리 코드(useScrollRestoration)가 있어야 보던 자리로 간다.
      if (productLoads++ > 0 && slowAfterFirst) await new Promise((resolve) => setTimeout(resolve, slowAfterFirst));
      return reply({ content: Array.from({ length: 20 }, (_, index) => product(index + 1)), nextCursor: null, hasNext: false });
    }
    if (url.pathname === "/api/notifications/unread-count") return reply({ count: counts.notifications });
    if (url.pathname === "/api/chat-rooms/unread-count") return reply({ count: counts.chat });
    if (url.pathname === "/api/users/me") return reply({ id: ME, nickname: "골목이", profileImageUrl: null, mannerTemp: 36.5, regions: [], admin: false });
    if (url.pathname === "/api/push/public-key") return reply({ enabled: false, publicKey: null });
    return reply({ content: [], nextCursor: null, hasNext: false });
  });
  await page.addInitScript((saved) => localStorage.setItem("golmok.region", JSON.stringify(saved)), region);
  return calls;
}

async function signIn(page) {
  await page.addInitScript((user) => {
    localStorage.setItem("golmok.session", JSON.stringify({ accessToken: "test-access", refreshToken: "test-refresh", user }));
  }, { id: ME, nickname: "골목이" });
}

test("홈을 내려 보다가 다른 화면에 갔다 뒤로가기로 돌아오면 보던 자리다", async ({ page }) => {
  await mockSocket(page);
  await mockRest(page, undefined, { slowAfterFirst: 600 });
  // 브라우저 기본 스크롤 복원을 끈다. 켜 두면 목록이 빨리 오는 테스트 환경에서는 브라우저가 대신 복원해
  // 우리 코드(useScrollRestoration)를 빼도 통과한다(실제로 그랬다). 우리 코드만으로 돌아와야 한다.
  await page.addInitScript(() => { history.scrollRestoration = "manual"; });
  await page.goto("/");
  await expect(page.getByRole("region", { name: "상품 목록" }).getByText("물건 20")).toBeAttached();

  // 화면 크기마다 내려갈 수 있는 끝이 달라, 실제로 내려간 자리를 기준으로 삼는다.
  await page.evaluate(() => window.scrollTo(0, 900));
  const saved = await page.evaluate(() => window.scrollY);
  expect(saved).toBeGreaterThan(300);

  // 앱 안 이동(나의 골목)은 goTo 를 지나며 위치를 적는다. PC 는 헤더, 모바일은 하단 탭에 있다.
  await page.getByRole("button", { name: "나의 골목" }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/my$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(saved);
});

test("뱃지는 로그인하면 서버 값으로 맞추고, 실시간 이벤트에 알림은 1 올리고 채팅은 다시 묻는다", async ({ page }) => {
  const socket = await mockSocket(page);
  const counts = { notifications: 3, chat: 2 };
  const calls = await mockRest(page, counts);
  await signIn(page);
  await page.goto("/");

  await expect(page.getByRole("button", { name: "알림, 읽지 않은 알림 3개" })).toBeVisible();
  await expect(page.getByRole("button", { name: "채팅, 안 읽은 메시지 2개" }).filter({ visible: true })).toHaveCount(1);
  await socket.subscribed;

  // 알림은 서버에 다시 묻지 않고 1 올린다.
  const notificationCalls = calls.filter((path) => path === "/api/notifications/unread-count").length;
  await socket.push({ type: "NOTIFICATION", notification: { id: 1 } });
  await expect(page.getByRole("button", { name: "알림, 읽지 않은 알림 4개" })).toBeVisible();
  expect(calls.filter((path) => path === "/api/notifications/unread-count").length).toBe(notificationCalls);

  // 채팅은 상대의 새 메시지가 오면 서버에 다시 묻는다(300ms 로 묶는다).
  counts.chat = 5;
  await socket.push({ type: "MESSAGE", roomId: 7, message: { id: 30, roomId: 7, senderId: 12, type: "TEXT", content: "안녕하세요" } });
  await expect(page.getByRole("button", { name: "채팅, 안 읽은 메시지 5개" }).filter({ visible: true })).toHaveCount(1);

  // 내가 보낸 메시지는 뱃지와 상관없어 다시 묻지 않는다.
  const chatCalls = calls.filter((path) => path === "/api/chat-rooms/unread-count").length;
  await socket.push({ type: "MESSAGE", roomId: 7, message: { id: 31, roomId: 7, senderId: ME, type: "TEXT", content: "네" } });
  await page.waitForTimeout(500);
  expect(calls.filter((path) => path === "/api/chat-rooms/unread-count").length).toBe(chatCalls);
});
