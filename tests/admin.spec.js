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

/** admin: false 면 관리자 API 가 404 를 준다(서버와 같은 동작). */
async function mockApi(page, { admin = true } = {}) {
  const calls = [];
  await page.routeWebSocket((url) => url.pathname.startsWith("/api/ws"), () => {});
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const reply = (json, status = 200) => route.fulfill({ status, json });
    if (url.pathname.startsWith("/api/admin/")) {
      if (!admin) return reply({ code: "RESOURCE_NOT_FOUND", message: "요청한 리소스를 찾을 수 없습니다." }, 404);
      calls.push({ method: request.method(), path: url.pathname, body: request.postDataJSON?.() ?? null });
      if (request.method() === "POST") return reply({ ...DETAIL, status: url.pathname.endsWith("/reject") ? "REJECTED" : "RESOLVED" });
      if (/\/api\/admin\/reports\/\d+$/.test(url.pathname)) return reply(DETAIL);
      return reply({ content: [PRODUCT_REPORT, USER_REPORT], nextCursor: null, hasNext: false });
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
  await page.goto("/admin");
  // /admin 은 신고함으로 넘긴다.
  await expect(page).toHaveURL(/\/admin\/reports$/);

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

  await expect(page).toHaveURL(/\/admin\/reports$/);
  await expect(page.getByRole("navigation", { name: "관리자 메뉴" }).getByRole("link", { name: "신고함" }))
    .toHaveAttribute("aria-current", "page");
  // 관리 화면에 상품 검색·카테고리·하단 탭·상품 등록이 보이면 지금 어느 쪽에 있는지 헷갈린다.
  await expect(page.getByRole("searchbox", { name: "상품 검색어" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "모바일 메뉴" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "상품 등록" })).toHaveCount(0);
  await expect(page.locator("main").getByText("원목 식탁")).toBeVisible();
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
