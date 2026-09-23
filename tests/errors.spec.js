import { test, expect } from "@playwright/test";

/**
 * 오류 경계. 응답을 일부러 망가뜨려 화면을 그리다 던지게 하고, 어디까지 무너지는지 본다.
 *
 * 경계가 없을 때는 인기 검색어 응답 모양 하나가 틀려도 앱 전체가 빈 화면이 됐다(2026-09-23 목업 실수로 확인).
 * 이제는 부가 영역은 조용히 사라지고, 본문·창은 그 자리만 안내로 바뀌며, 나머지는 그대로 쓸 수 있어야 한다.
 */

const region = { id: 1, dong: "역삼동" };
const product = (id, title) => ({ id, title, price: 10000, categoryId: 1, categoryName: "가구", regionName: "역삼동",
  sellerNickname: "이웃", thumbnailUrl: null, status: "ON_SALE", favoriteCount: 0, chatCount: 0, isLiked: false,
  createdAt: "2026-09-16T09:00:00", bumpedAt: "2026-09-16T09:00:00" });

/**
 * broken 에 넣은 응답만 망가뜨린다.
 * - popular: 인기 검색어가 배열이 아님
 * - feed: 상품 목록에 빈 항목(App 이 직접 그리는 곳 — 가장 바깥 경계까지 간다)
 * - detail: 상품 상세에 사진 목록이 없음(창 안에서 던진다)
 * - summary: 관리자 현황 숫자가 없음(관리자 본문에서 던진다)
 */
async function mockApi(page, { broken = [], admin = false } = {}) {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.routeWebSocket((url) => url.pathname.startsWith("/api/ws"), () => {});
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const url = new URL(route.request().url());
    const reply = (json, status = 200) => route.fulfill({ status, json });
    const page1 = (content) => reply({ content, nextCursor: null, hasNext: false });
    if (url.pathname === "/api/categories") return reply([{ id: 1, name: "가구" }]);
    if (url.pathname === "/api/search/keywords/popular") {
      return reply(broken.includes("popular") ? { keywords: ["식탁"] } : [{ keyword: "식탁", count: 3 }]);
    }
    if (url.pathname.endsWith("/unread-count")) return reply({ count: 0 });
    if (url.pathname === "/api/push/public-key") return reply({ enabled: false, publicKey: null });
    if (url.pathname === "/api/users/me") {
      return reply({ id: 1, nickname: "관리자", profileImageUrl: null, mannerTemp: 36.5, regions: [], admin });
    }
    if (url.pathname === "/api/products") {
      return page1(broken.includes("feed") ? [product(1, "원목 식탁"), null] : [product(1, "원목 식탁"), product(2, "책상")]);
    }
    if (url.pathname === "/api/products/1") {
      const detail = { ...product(1, "원목 식탁"), description: "생활감이 적은 원목 식탁입니다.", isNegotiable: false,
        tradeType: "DIRECT", images: [], seller: { id: 7, nickname: "이웃", mannerTemp: 36.5 }, viewCount: 1, isMine: false };
      if (broken.includes("detail")) delete detail.images;
      return reply(detail);
    }
    if (url.pathname === "/api/admin/summary") {
      return reply(broken.includes("summary") ? {} : { pendingReports: 0, suspendedUsers: 0, newUsersToday: 0,
        newProductsToday: 0, completedTradesLast7Days: 0 });
    }
    if (url.pathname.startsWith("/api/admin/")) return page1([]);
    return page1([]);
  });
  await page.addInitScript(({ region, admin }) => {
    localStorage.setItem("golmok.region", JSON.stringify(region));
    if (admin) {
      localStorage.setItem("golmok.session", JSON.stringify({
        accessToken: "test-access", refreshToken: "test-refresh", user: { id: 1, nickname: "관리자" } }));
    }
  }, { region, admin });
  return errors;
}

const crashed = (scope) => scope.getByText("화면을 보여 드리지 못했어요");

test("인기 검색어 응답이 망가져도 홈은 그대로 쓰고 그 영역만 사라진다", async ({ page }) => {
  const errors = await mockApi(page, { broken: ["popular"] });
  await page.goto("/");

  await expect(page.locator("main").getByText("원목 식탁")).toBeVisible();
  await expect(page.locator("main").getByText("책상")).toBeVisible();
  await expect(crashed(page)).toHaveCount(0);
  // 경계가 잡았다는 증거. PC 는 사이드바, 모바일은 칩 영역이 잡는다.
  await expect.poll(() => errors.some((text) => /오류 경계: (인기 검색어|사이드바)/.test(text))).toBe(true);
  await expect(page.getByRole("button", { name: "식탁", exact: true })).toHaveCount(0);
});

test("관리자 본문이 망가져도 관리자 메뉴가 남고, 다른 메뉴로 가면 풀린다", async ({ page }, info) => {
  await mockApi(page, { broken: ["summary"], admin: true });
  await page.goto("/admin");

  await expect(crashed(page.locator("main"))).toBeVisible();
  const menu = page.getByRole("navigation", { name: "관리자 메뉴" });
  await expect(menu).toBeVisible();
  await expect(page.getByRole("button", { name: "사이트로 돌아가기" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("관리자본문오류.png") });

  await menu.getByRole("link", { name: "신고함" }).click();
  await expect(page.getByRole("heading", { name: "신고함" })).toBeVisible();
  await expect(crashed(page)).toHaveCount(0);
});

test("상품 상세 창이 망가지면 그 창만 안내로 바뀌고, 닫으면 목록이 그대로다", async ({ page }, info) => {
  await mockApi(page, { broken: ["detail"] });
  await page.goto("/");
  await page.locator("main").getByText("원목 식탁").click();

  const dialog = page.getByRole("dialog", { name: "문제가 생겼어요" });
  await expect(dialog.getByText("이 창을 보여 드리지 못했어요. 닫고 다시 열어 주세요.")).toBeVisible();
  await dialog.screenshot({ path: info.outputPath("창오류.png") });

  await dialog.getByRole("button", { name: "닫기" }).first().click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("main").getByText("책상")).toBeVisible();
  await expect(crashed(page)).toHaveCount(0);
});

test("앱 자체가 그리다 던지면 가장 바깥 안내가 뜨고 새로고침·홈으로를 준다", async ({ page }, info) => {
  const errors = await mockApi(page, { broken: ["feed"] });
  await page.goto("/");

  await expect(crashed(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "새로고침" })).toBeVisible();
  await expect(page.getByRole("button", { name: "홈으로" })).toBeVisible();
  await expect.poll(() => errors.some((text) => text.includes("오류 경계: 앱"))).toBe(true);
  await page.screenshot({ path: info.outputPath("앱오류.png") });
});
