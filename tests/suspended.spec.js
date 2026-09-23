import { test, expect } from "@playwright/test";

/**
 * 정지·탈퇴한 계정. 서버는 이미 받은 access token 도 곧바로 403 USER_NOT_ACTIVE 로 막는다(백엔드 UserAccessCache).
 * 화면은 세션을 지우고(로그아웃) 이유를 한 번만 알려야 한다. 요청이 여러 개 동시에 막혀도 알림은 하나다.
 */
test("정지된 계정은 로그아웃되고, 이유를 한 번만 알린다", async ({ page }) => {
  await page.routeWebSocket((url) => url.pathname.startsWith("/api/ws"), () => {});
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const reply = (json, status = 200) => route.fulfill({ status, json });
    // 토큰을 실은 요청은 모두 막는다(서버와 같은 동작). 토큰 없는 공개 요청은 그대로 받는다.
    if (request.headers().authorization) {
      return reply({ code: "USER_NOT_ACTIVE", message: "이용할 수 없는 계정입니다." }, 403);
    }
    if (url.pathname === "/api/categories") return reply([{ id: 1, name: "가구" }]);
    if (url.pathname === "/api/search/keywords/popular") return reply([]);
    return reply({ content: [], nextCursor: null, hasNext: false });
  });
  await page.addInitScript(() => {
    localStorage.setItem("golmok.session", JSON.stringify({
      accessToken: "test-access", refreshToken: "test-refresh", user: { id: 9, nickname: "정지된회원" } }));
  });

  await page.goto("/my");

  await expect(page.getByText("이용할 수 없는 계정이라 로그아웃했어요.")).toHaveCount(1);
  await expect(page.getByRole("main").getByRole("button", { name: "로그인하기" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("golmok.session"))).toBeNull();
});
