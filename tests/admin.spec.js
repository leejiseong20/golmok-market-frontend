import { test, expect } from "@playwright/test";

/**
 * 관리자 영역(/admin/*). 백엔드 없이 돈다.
 *
 * 관리자 영역은 일반 헤더·검색·하단 탭 없이 자기 틀(메뉴·사이트로 돌아가기)을 쓴다.
 * 권한 판단은 서버가 한다 — 관리자가 아니면 `/api/admin/**` 가 404 다. 화면이 그때 없는 페이지로 바뀌는지,
 * 그리고 조치에 이유를 반드시 받는지를 본다(이유 없이 남기면 감사 기록의 뜻이 없다).
 */

const PRODUCT_REPORT = {
  id: 12, targetType: "PRODUCT", targetId: 44, targetName: "원목 식탁",
  reason: "FRAUD", detail: "사기 같아요", status: "PENDING", reportCount: 3,
  reporterNickname: "이웃", createdAt: "2026-09-23T10:20:00",
};
const USER_REPORT = {
  id: 11, targetType: "USER", targetId: 9, targetName: "문제사용자",
  reason: "ABUSE", detail: null, status: "PENDING", reportCount: 1,
  reporterNickname: "다른이웃", createdAt: "2026-09-22T09:00:00",
};
const DETAIL = {
  ...PRODUCT_REPORT,
  handledByNickname: null, handledAt: null, adminMemo: null,
  sameTarget: [{ id: 10, targetType: "PRODUCT", targetId: 44, targetName: "원목 식탁", reason: "PROHIBITED",
    detail: "금지 물품 같아요", status: "PENDING", reportCount: 3, reporterNickname: "세번째", createdAt: "2026-09-21T08:00:00" }],
  actions: [],
};

const SUMMARY = { pendingReports: 2, suspendedUsers: 1, newUsersToday: 3, newProductsToday: 5, completedTradesLast7Days: 4 };
const ACTION_LOGS = [
  { id: 3, action: "SUSPEND_USER", adminNickname: "관리자", targetType: "USER", targetId: 9, targetName: "문제사용자",
    reportId: null, reason: "직접 확인한 사기 시도", createdAt: "2026-09-23T11:00:00" },
  { id: 2, action: "DELETE_PRODUCT", adminNickname: "관리자", targetType: "PRODUCT", targetId: 44, targetName: "원목 식탁",
    reportId: 12, reason: "판매 금지 물품", createdAt: "2026-09-23T10:30:00" },
];

/** admin: false 면 관리자 API 가 404 를 준다(서버와 같은 동작). */
async function mockApi(page, { admin = true } = {}) {
  const calls = [];
  // 테스트마다 새로 만든다. 조치하면 여기가 바뀐다.
  const state = {
    users: [{ id: 9, email: "tr***@test.com", nickname: "문제사용자", admin: false, status: "ACTIVE",
      createdAt: "2026-09-01T09:00:00", lastLoginAt: "2026-09-23T08:00:00" }],
    userActions: [],
    products: [
      { id: 44, title: "원목 식탁", price: 50000, status: "ON_SALE", thumbnailUrl: null, sellerId: 9,
        sellerNickname: "문제사용자", deleted: true, deletedByAdmin: true, reportCount: 3, createdAt: "2026-09-20T10:00:00" },
      { id: 45, title: "판매자가 지운 의자", price: 0, status: "ON_SALE", thumbnailUrl: null, sellerId: 9,
        sellerNickname: "문제사용자", deleted: true, deletedByAdmin: false, reportCount: 0, createdAt: "2026-09-19T10:00:00" },
    ],
  };
  const userDetail = (user) => ({ user, profileImageUrl: null, mannerTemp: 36.5, activeProductCount: 2,
    reportsOnUser: 1, reportsOnProducts: 3, actions: state.userActions });
  await page.routeWebSocket((url) => url.pathname.startsWith("/api/ws"), () => {});
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const reply = (json, status = 200) => route.fulfill({ status, json });
    if (url.pathname.startsWith("/api/admin/")) {
      if (!admin) return reply({ code: "RESOURCE_NOT_FOUND", message: "요청한 리소스를 찾을 수 없습니다." }, 404);
      const method = request.method();
      calls.push({ method, path: url.pathname, query: Object.fromEntries(url.searchParams), body: request.postDataJSON?.() ?? null });
      const page1 = (content) => reply({ content, nextCursor: null, hasNext: false });
      const id = Number(url.pathname.split("/")[4]);

      if (url.pathname === "/api/admin/summary") return reply(SUMMARY);
      if (url.pathname.startsWith("/api/admin/reports")) {
        if (method === "POST") return reply({ ...DETAIL, status: url.pathname.endsWith("/reject") ? "REJECTED" : "RESOLVED" });
        if (/\/api\/admin\/reports\/\d+$/.test(url.pathname)) return reply(DETAIL);
        return page1([PRODUCT_REPORT, USER_REPORT]);
      }
      // 회원·상품은 서버처럼 상태를 바꾼다. 조치 뒤 다시 읽으면 바뀐 상태가 보여야 한다.
      if (url.pathname.startsWith("/api/admin/users")) {
        const user = state.users.find((item) => item.id === id);
        if (method === "POST") {
          user.status = url.pathname.endsWith("/unsuspend") ? "ACTIVE" : "SUSPENDED";
          state.userActions.unshift({ id: 100 + state.userActions.length, adminNickname: "관리자",
            action: user.status === "SUSPENDED" ? "SUSPEND_USER" : "UNSUSPEND_USER",
            reason: request.postDataJSON().reason, createdAt: "2026-09-23T12:00:00" });
        }
        if (user) return reply(userDetail(user));
        return page1(state.users);
      }
      if (url.pathname.startsWith("/api/admin/products")) {
        const product = state.products.find((item) => item.id === id);
        if (method === "POST") {
          product.deleted = url.pathname.endsWith("/delete");
          product.deletedByAdmin = product.deleted;
        }
        if (product) return reply({ product, description: "원목 식탁 팝니다. 상태 좋아요.", actions: [] });
        return page1(state.products);
      }
      if (url.pathname === "/api/admin/actions") return page1(ACTION_LOGS);
      return reply({ code: "RESOURCE_NOT_FOUND" }, 404);
    }
    if (url.pathname === "/api/users/me") {
      return reply({ id: 1, nickname: "관리자", profileImageUrl: null, mannerTemp: 36.5, regions: [], admin });
    }
    if (url.pathname.endsWith("/unread-count")) return reply({ count: 0 });
    if (url.pathname === "/api/categories") return reply([]);
    // 인기 검색어는 배열이다. 모양이 다르면 화면이 통째로 죽는다(오류 경계가 없다).
    if (url.pathname === "/api/search/keywords/popular") return reply([]);
    if (url.pathname === "/api/push/public-key") return reply({ enabled: false, publicKey: null });
    return reply({ content: [], nextCursor: null, hasNext: false });
  });
  await page.addInitScript(() => {
    localStorage.setItem("golmok.session", JSON.stringify({
      accessToken: "test-access", refreshToken: "test-refresh", user: { id: 1, nickname: "관리자" },
    }));
  });
  return calls;
}

test("신고함에서 대상과 신고 건수를 보고, 이유를 적어야 처리할 수 있다", async ({ page }, info) => {
  const calls = await mockApi(page);
  await page.goto("/admin/reports");

  const main = page.locator("main");
  await expect(main.getByText("원목 식탁")).toBeVisible();
  // 여러 건 몰린 신고는 목록에서 바로 드러나야 한다.
  await expect(main.getByText("신고 3건")).toBeVisible();
  await expect(main.getByText("문제사용자")).toBeVisible();
  await page.screenshot({ path: info.outputPath("신고함.png"), fullPage: true });

  await main.getByRole("button", { name: /원목 식탁/ }).click();
  const detail = page.getByRole("dialog", { name: "신고 상세" });
  await expect(detail.getByText("같은 대상의 다른 신고 1건")).toBeVisible();
  // 처리하면 같은 대상의 신고도 함께 닫힌다는 것을 미리 알린다.
  await expect(detail.getByText(/함께 닫혀요/)).toBeVisible();
  await detail.screenshot({ path: info.outputPath("신고상세.png") });

  // 이유 없이 누르면 요청을 보내지 않는다.
  await detail.getByRole("button", { name: "신고 인정하고 처리" }).click();
  await expect(page.getByText("처리 이유를 적어 주세요.")).toBeVisible();
  expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);

  await detail.getByRole("group", { name: "조치" }).getByRole("button", { name: "상품 내리기" }).click();
  await detail.getByRole("textbox", { name: /처리 이유/ }).fill("판매 금지 물품입니다.");
  await detail.getByRole("button", { name: "신고 인정하고 처리" }).click();

  await expect(detail).not.toBeVisible();
  const sent = calls.find((call) => call.method === "POST");
  expect(sent.path).toBe("/api/admin/reports/12/resolve");
  expect(sent.body).toEqual({ action: "DELETE_PRODUCT", reason: "판매 금지 물품입니다." });
});

test("관리자가 아니면 없는 페이지다", async ({ page }) => {
  await mockApi(page, { admin: false });
  await page.goto("/admin");

  // 서버가 404 로 답하면 화면도 없는 페이지가 된다. "권한 없음"이라고 알리지 않는다(관리자 화면의 존재를 감춘다).
  await expect(page.getByText("페이지를 찾을 수 없어요")).toBeVisible();
  // 본문 어디에도 관리자 기능을 암시하는 말이 없어야 한다(헤더의 로그인 닉네임은 검사 대상이 아니다).
  await expect(page.locator("main").getByText(/권한|관리자|신고함/)).toHaveCount(0);
});

test("헤더의 관리자 버튼으로 들어가면 일반 틀 없이 관리자 틀만 보인다", async ({ page }, info) => {
  await mockApi(page, { admin: true });
  await page.goto("/");
  const entry = page.getByRole("banner").getByRole("button", { name: "관리자", exact: true });
  await expect(entry).toBeVisible();
  await page.getByRole("banner").screenshot({ path: info.outputPath("헤더진입.png") });
  await entry.click();

  await expect(page).toHaveURL(/\/admin$/);
  // 첫 화면은 현황판이다.
  await expect(page.getByRole("navigation", { name: "관리자 메뉴" }).getByRole("link", { name: "현황" }))
    .toHaveAttribute("aria-current", "page");
  // 관리 화면에 상품 검색·카테고리·하단 탭·상품 등록이 보이면 지금 어느 쪽에 있는지 헷갈린다.
  await expect(page.getByRole("searchbox", { name: "상품 검색어" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "모바일 메뉴" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "상품 등록" })).toHaveCount(0);
  await expect(page.locator("main").getByText("처리 전 신고")).toBeVisible();
  await page.screenshot({ path: info.outputPath("관리자틀.png") });

  await page.getByRole("button", { name: "사이트로 돌아가기" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("searchbox", { name: "상품 검색어" })).toBeVisible();
});

test("관리자 진입 버튼은 관리자에게만 보이고, 설정에는 진입이 없다", async ({ page }) => {
  await mockApi(page, { admin: false });
  await page.goto("/");
  await expect(page.getByRole("searchbox", { name: "상품 검색어" })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("button", { name: "관리자", exact: true })).toHaveCount(0);
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: "신고함" })).toHaveCount(0);

  await mockApi(page, { admin: true });
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
  // 관리자라도 설정에는 없다. 진입은 헤더 한 곳이다.
  await expect(page.getByRole("button", { name: "신고함" })).toHaveCount(0);
  await expect(page.getByRole("banner").getByRole("button", { name: "관리자", exact: true })).toBeVisible();
});

test("현황판 숫자를 누르면 해당 목록으로 간다", async ({ page }, info) => {
  const calls = await mockApi(page);
  await page.goto("/admin");
  const main = page.locator("main");
  // 처리할 일이 남아 있으면 색뿐 아니라 글자로도 알린다.
  await expect(main.getByRole("link", { name: /처리 전 신고\s*2\s*처리 필요/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath("현황판.png"), fullPage: true });

  await main.getByRole("link", { name: /정지된 회원/ }).click();
  await expect(page).toHaveURL(/\/admin\/users\?status=SUSPENDED$/);
  await expect(page.getByRole("group", { name: "회원 상태" }).getByRole("button", { name: "정지" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => calls.findLast((call) => call.path === "/api/admin/users")?.query).toEqual({ status: "SUSPENDED" });
});

test("회원을 찾아 이유를 적고 정지한 뒤 풀 수 있다", async ({ page }, info) => {
  const calls = await mockApi(page);
  await page.goto("/admin/users");
  const main = page.locator("main");
  // 이메일은 가려진 값 그대로 보인다.
  await expect(main.getByText(/tr\*\*\*@test\.com/)).toBeVisible();

  await main.getByRole("searchbox", { name: "회원 검색" }).fill("문제");
  await main.getByRole("button", { name: "찾기" }).click();
  await expect(page).toHaveURL(/q=%EB%AC%B8%EC%A0%9C/);
  await expect.poll(() => calls.findLast((call) => call.path === "/api/admin/users")?.query).toEqual({ q: "문제" });

  await main.getByRole("button", { name: /문제사용자/ }).click();
  const detail = page.getByRole("dialog", { name: "회원 상세" });
  await expect(detail.getByText("회원 1건 · 상품 3건")).toBeVisible();

  // 이유 없이 누르면 요청을 보내지 않는다.
  await detail.getByRole("button", { name: "정지하기" }).click();
  await expect(page.getByText("조치 이유를 적어 주세요.")).toBeVisible();
  expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);

  await detail.getByRole("textbox", { name: /조치 이유/ }).fill("직접 확인한 사기 시도");
  await detail.getByRole("button", { name: "정지하기" }).click();
  await expect(detail.getByRole("button", { name: "정지 풀기" })).toBeVisible();
  await expect(detail.getByText("직접 확인한 사기 시도")).toBeVisible();
  const sent = calls.find((call) => call.method === "POST");
  expect(sent.path).toBe("/api/admin/users/9/suspend");
  expect(sent.body).toEqual({ reason: "직접 확인한 사기 시도" });
  await detail.screenshot({ path: info.outputPath("회원상세.png") });

  await detail.getByRole("textbox", { name: /조치 이유/ }).fill("소명 확인");
  await detail.getByRole("button", { name: "정지 풀기" }).click();
  await expect(detail.getByRole("button", { name: "정지하기" })).toBeVisible();
  expect(calls.filter((call) => call.method === "POST").map((call) => call.path))
    .toEqual(["/api/admin/users/9/suspend", "/api/admin/users/9/unsuspend"]);

  // 회원의 상품은 상품 관리에서 판매자로 걸러 본다.
  await detail.getByRole("button", { name: "상품 관리에서 보기" }).click();
  await expect(page).toHaveURL(/\/admin\/products\?sellerId=9$/);
  await expect(page.getByText("회원 #9의 상품만 보는 중")).toBeVisible();
});

test("관리자가 내린 상품만 되살릴 수 있다", async ({ page }, info) => {
  const calls = await mockApi(page);
  await page.goto("/admin/products");
  const main = page.locator("main");
  // 누가 지웠는지 목록에서 글자로 가른다.
  await expect(main.getByRole("button", { name: /원목 식탁.*관리자가 내림/ })).toBeVisible();
  await expect(main.getByRole("button", { name: /판매자가 지운 의자.*삭제됨/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath("상품관리.png"), fullPage: true });

  // 판매자가 직접 지운 상품은 되살리기 대신 안내만 보인다.
  await main.getByRole("button", { name: /판매자가 지운 의자/ }).click();
  let detail = page.getByRole("dialog", { name: "상품 상세" });
  await expect(detail.getByText("판매자가 직접 지운 상품이라 되살릴 수 없어요.")).toBeVisible();
  await expect(detail.getByRole("button", { name: "되살리기" })).toHaveCount(0);
  await detail.getByRole("button", { name: "닫기" }).click();

  await main.getByRole("button", { name: /원목 식탁/ }).click();
  detail = page.getByRole("dialog", { name: "상품 상세" });
  await detail.getByRole("textbox", { name: /조치 이유/ }).fill("금지 물품이 아니었음");
  await detail.getByRole("button", { name: "되살리기" }).click();
  // 되살리면 다시 내릴 수 있는 상태가 된다.
  await expect(detail.getByRole("button", { name: "내리기" })).toBeVisible();
  expect(calls.find((call) => call.method === "POST")).toMatchObject({
    path: "/api/admin/products/44/restore", body: { reason: "금지 물품이 아니었음" } });
  await detail.screenshot({ path: info.outputPath("상품상세.png") });
});

test("조치 기록은 종류로 거르고, 대상을 누르면 그 상세가 열린다", async ({ page }, info) => {
  const calls = await mockApi(page);
  await page.goto("/admin/actions");
  const main = page.locator("main");
  await expect(main.getByText("직접 확인한 사기 시도")).toBeVisible();
  // 신고를 처리하며 한 조치와 직접 한 조치를 구분해 보여 준다.
  await expect(main.getByText("신고 처리")).toBeVisible();
  await expect(main.getByText("직접 조치")).toBeVisible();
  await page.screenshot({ path: info.outputPath("조치기록.png"), fullPage: true });

  await main.getByRole("combobox", { name: "조치 종류" }).selectOption("DELETE_PRODUCT");
  await expect(page).toHaveURL(/action=DELETE_PRODUCT/);
  await expect.poll(() => calls.findLast((call) => call.path === "/api/admin/actions")?.query)
    .toEqual({ action: "DELETE_PRODUCT" });

  await main.getByRole("button", { name: "문제사용자" }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole("dialog", { name: "회원 상세" })).toBeVisible();
});
