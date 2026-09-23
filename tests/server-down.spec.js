import { test, expect } from "@playwright/test";

/**
 * 데모 서버가 꺼져 있을 때. 데모 백엔드는 수업용 AWS 환경이라 세션이 끝나면 꺼진다.
 *
 * 앞단(Vercel)이 뒤의 서버에 닿지 못하면 JSON 이 아닌 502 를 준다고 보고 흉내 낸다(실제 모양은 운영에서 확인하지 못했다 —
 * 판정은 502·503·504, JSON 아닌 본문, 연결 실패, 시간 초과를 모두 꺼짐으로 본다).
 * 화면 곳곳의 빨간 오류 줄 대신 안내 띠 하나가 이유와 할 수 있는 일(화면 캡처 보기·다시 확인)을 알려야 한다.
 */

const region = { id: 1, dong: "역삼동" };
const product = { id: 1, title: "원목 식탁", price: 10000, categoryId: 1, categoryName: "가구", regionName: "역삼동",
  sellerNickname: "이웃", thumbnailUrl: null, status: "ON_SALE", favoriteCount: 0, chatCount: 0, isLiked: false,
  createdAt: "2026-09-16T09:00:00", bumpedAt: "2026-09-16T09:00:00" };

async function mockApi(page) {
  const server = { up: false };
  await page.routeWebSocket((url) => url.pathname.startsWith("/api/ws"), () => {});
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const url = new URL(route.request().url());
    if (!server.up) {
      return route.fulfill({ status: 502, contentType: "text/plain", body: "An error occurred with this application." });
    }
    const reply = (json) => route.fulfill({ status: 200, json });
    if (url.pathname === "/api/categories") return reply([{ id: 1, name: "가구" }]);
    if (url.pathname === "/api/search/keywords/popular") return reply([]);
    if (url.pathname === "/api/products") return reply({ content: [product], nextCursor: null, hasNext: false });
    return reply({ content: [], nextCursor: null, hasNext: false });
  });
  await page.addInitScript((saved) => localStorage.setItem("golmok.region", JSON.stringify(saved)), region);
  return server;
}

test("서버가 꺼져 있으면 안내 띠 하나로 알리고, 켜지면 다시 연결됐다고 알린다", async ({ page }, info) => {
  const server = await mockApi(page);
  await page.goto("/");

  const banner = page.getByRole("status", { name: "데모 서버 상태" });
  await expect(banner.getByText("데모 서버가 지금 꺼져 있어요")).toBeVisible();
  await expect(banner.getByRole("link", { name: "화면 캡처 보기" }))
    .toHaveAttribute("href", "https://github.com/leejiseong20/golmok-market#화면");
  // 같은 이유의 빨간 오류 줄을 목록 자리에 또 띄우지 않는다.
  await expect(page.getByRole("region", { name: "상품 목록" }).getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("인기 검색어를 불러오지 못했어요.")).toHaveCount(0);
  // 헤더는 그대로 쓸 수 있다.
  await expect(page.getByRole("searchbox", { name: "상품 검색어" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("서버꺼짐.png") });

  server.up = true;
  await banner.getByRole("button", { name: "다시 확인" }).click();
  await expect(banner.getByText("다시 연결됐어요")).toBeVisible();
  await expect(banner.getByRole("button", { name: "새로고침" })).toBeVisible();
  // 새로고침하지 않아도 홈 목록은 다시 불러오고, 꺼진 동안 숨겨 둔 오류가 드러나지 않는다.
  await expect(page.getByRole("region", { name: "상품 목록" }).getByText("원목 식탁")).toBeVisible();
  await expect(page.getByRole("region", { name: "상품 목록" }).getByRole("alert")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("다시연결.png") });

  await banner.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByRole("status", { name: "데모 서버 상태" })).toHaveCount(0);
});

test("서버가 켜져 있으면 안내 띠가 없다", async ({ page }) => {
  const server = await mockApi(page);
  server.up = true;
  await page.goto("/");
  await expect(page.getByRole("region", { name: "상품 목록" }).getByText("원목 식탁")).toBeVisible();
  await expect(page.getByRole("status", { name: "데모 서버 상태" })).toHaveCount(0);
});
