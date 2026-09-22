import { test, expect } from "@playwright/test";

const region = { id: 1, sido: "서울특별시", sigungu: "강남구", dong: "역삼동", fullName: "서울특별시 강남구 역삼동" };
const product = (id, title, categoryId = 1) => ({ id, title, price: id * 10000, categoryId,
  categoryName: categoryId === 1 ? "가구" : "디지털", regionName: "역삼동", sellerNickname: "이웃",
  thumbnailUrl: null, status: "ON_SALE", favoriteCount: 2, chatCount: 1, isLiked: false,
  createdAt: "2026-09-16T09:00:00", bumpedAt: "2026-09-16T09:00:00" });
const products = [product(1, "원목 식탁"), product(2, "작은 스피커", 2), product(3, "책상")];

async function mockApi(page, { failure = false, delayOld = false } = {}) {
  const requests = [];
  let shouldFail = failure;
  // /src/api/*.js 모듈까지 가로채면 JSON이 JS 대신 전달되어 빈 화면이 된다.
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const request = route.request(), url = new URL(request.url());
    requests.push(url);
    const reply = (json, status = 200) => route.fulfill({ status, json });
    if (url.pathname === "/api/categories") return reply([{ id: 1, name: "가구" }, { id: 2, name: "디지털" }]);
    // 화면이 함께 부르는 부가 API. 빠지면 404 가 오류 알림으로 떠 본 시나리오의 알림과 섞인다.
    if (url.pathname === "/api/search/keywords/popular") return reply([]);
    if (url.pathname.endsWith("/unread-count")) return reply({ count: 0 });
    if (url.pathname === "/api/push/public-key") return reply({ enabled: false, publicKey: null });
    if (url.pathname === "/api/users/me") return reply({ id: 8, email: "new@example.com", nickname: "골목이",
      profileImageUrl: null, mannerTemp: 36.5, regions: [] });
    if (url.pathname.startsWith("/api/users/me/")) return reply({ content: [], nextCursor: null, hasNext: false });
    if (url.pathname.startsWith("/api/regions")) return reply([region]);
    if (url.pathname === "/api/products") {
      if (shouldFail) return reply({ code: "INTERNAL_ERROR", message: "상품을 불러오지 못했습니다." }, 500);
      const keyword = url.searchParams.get("keyword");
      if (delayOld && keyword === "이전") await new Promise((resolve) => setTimeout(resolve, 300));
      if (keyword === "없는상품") return reply({ content: [], nextCursor: null, hasNext: false });
      let rows = products;
      const category = url.searchParams.get("categoryId");
      if (category) rows = rows.filter((item) => item.categoryId === Number(category));
      if (keyword) rows = [product(10, keyword + " 결과")];
      const next = url.searchParams.has("cursor");
      return reply({ content: next ? rows.slice(2) : rows.slice(0, 2), nextCursor: !next && rows.length > 2 ? "2026-09-16T09:00:00_2" : null, hasNext: !next && rows.length > 2 });
    }
    if (/\/api\/products\/\d+$/.test(url.pathname)) return reply({ ...products[0],
      description: "생활감이 적은 원목 식탁입니다.", isNegotiable: true, tradeType: "DIRECT", images: [],
      seller: { id: 7, nickname: "이웃", mannerTemp: 36.5 }, viewCount: 1, isMine: false,
    });
    if (url.pathname === "/api/auth/signup") {
      const body = request.postDataJSON();
      if (body.email === "duplicate@example.com") return reply({ code: "DUPLICATE_EMAIL", message: "이미 사용 중인 이메일입니다." }, 409);
      return reply({ id: 8, email: body.email, nickname: body.nickname }, 201);
    }
    if (url.pathname === "/api/auth/login") return reply({ accessToken: "test-access", refreshToken: "test-refresh", user: { id: 8, nickname: "골목이" } });
    if (url.pathname === "/api/auth/logout") return route.fulfill({ status: 204 });
    return reply({ code: "RESOURCE_NOT_FOUND", message: "없음" }, 404);
  });
  return { requests, recover: () => { shouldFail = false; } };
}
async function selectRegion(page) {
  await page.getByRole("button", { name: "동네 선택", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "동네 선택" });
  await dialog.getByLabel("동네 이름").fill("역삼");
  await dialog.getByRole("button", { name: "동네 검색", exact: true }).click();
  await dialog.getByRole("button", { name: "역삼동 서울특별시 강남구 역삼동" }).click();
}

test("동네 선택·목록·커서·상세를 연결하고 상세 요청을 한 번만 보낸다", async ({ page }, info) => {
  const { requests } = await mockApi(page);
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/"); await selectRegion(page);
  await expect(page.getByRole("button", { name: "원목 식탁 상세 보기" })).toBeVisible();
  // 홈은 무한 스크롤이다(2026-09-21). 목록 끝에 닿으면 다음 페이지를 부른다 — "더 보기" 버튼은 없다.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByRole("button", { name: "책상 상세 보기", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "더 보기", exact: true })).toHaveCount(0);
  // 다음 페이지가 없으면 더 부르지 않는다(커서 요청은 정확히 한 번).
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  expect(requests.filter((url) => url.searchParams.has("cursor"))).toHaveLength(1);
  await page.screenshot({ path: info.outputPath("feed.png"), fullPage: true });
  await page.getByRole("button", { name: "원목 식탁 상세 보기" }).click();
  await expect(page.getByRole("dialog").getByText("생활감이 적은 원목 식탁입니다.")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("조회 1", { exact: false })).toBeVisible();
  expect(requests.filter((url) => url.pathname === "/api/products/1")).toHaveLength(1);
  await page.screenshot({ path: info.outputPath("detail.png"), fullPage: true });
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

test("필터 변경 시 커서를 초기화하고 늦은 이전 검색 응답을 무시한다", async ({ page }) => {
  const { requests } = await mockApi(page, { delayOld: true });
  await page.goto("/"); await selectRegion(page);
  await page.getByRole("button", { name: "디지털", exact: true }).click();
  await expect(page.getByRole("button", { name: "원목 식탁 상세 보기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "작은 스피커 상세 보기" })).toBeVisible();
  await page.getByRole("combobox", { name: "상품 정렬" }).selectOption("PRICE_ASC");
  const search = page.getByRole("searchbox", { name: "상품 검색어" });
  await search.fill("이전"); await search.press("Enter");
  await search.fill("최종"); await search.press("Enter");
  await expect(page.getByRole("button", { name: "최종 결과 상세 보기" })).toBeVisible();
  await page.waitForTimeout(350);
  await expect(page.getByRole("button", { name: "이전 결과 상세 보기" })).toHaveCount(0);
  const last = requests.filter((url) => url.pathname === "/api/products").at(-1);
  expect(last.searchParams.get("sort")).toBe("PRICE_ASC"); expect(last.searchParams.has("cursor")).toBeFalsy();
});

test("서버 오류를 표시하고 재시도하며 빈 검색 결과는 더미로 채우지 않는다", async ({ page }) => {
  const state = await mockApi(page, { failure: true });
  await page.goto("/"); await selectRegion(page);
  const list = page.getByRole("region", { name: "상품 목록" });
  await expect(list.getByRole("alert")).toContainText("상품을 불러오지 못했습니다.");
  await expect(page.locator("article")).toHaveCount(0);
  state.recover(); await list.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByRole("button", { name: "원목 식탁 상세 보기" })).toBeVisible();
  await page.getByRole("searchbox").fill("없는상품"); await page.getByRole("searchbox").press("Enter");
  await expect(list.getByRole("status")).toContainText("\"없는상품\" 검색 결과가 없어요");
  await expect(page.locator("article")).toHaveCount(0);
});

test("가입 오류·가입 성공·로그인·새로고침 세션 복원·로그아웃", async ({ page }) => {
  // 모바일은 헤더에 로그인 버튼이 없다. PC·모바일 모두 나의 골목의 "로그인하기"로 들어간다.
  await mockApi(page); await page.goto("/my");
  await page.getByRole("button", { name: "로그인하기", exact: true }).click();
  await page.getByRole("button", { name: "처음 오셨나요? 회원가입" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("이메일", { exact: true }).fill("duplicate@example.com");
  await dialog.getByLabel("비밀번호", { exact: true }).fill("Password123!");
  await dialog.getByLabel("닉네임", { exact: true }).fill("골목이");
  await dialog.getByRole("button", { name: "가입하기" }).click();
  await expect(dialog.getByRole("alert")).toContainText("이미 사용 중인 이메일");
  // 오류 문구가 label 안에 추가돼도 같은 입력 요소를 찾는다.
  await dialog.locator('input[name="email"]').fill("new@example.com");
  await dialog.getByRole("button", { name: "가입하기" }).click();
  await expect(dialog.getByRole("status")).toContainText("가입이 완료됐습니다");
  await dialog.getByLabel("비밀번호", { exact: true }).fill("Password123!");
  await dialog.getByRole("button", { name: "로그인하기" }).click();
  await expect(dialog).toHaveCount(0);
  // 로그인하면 나의 골목에 설정(톱니바퀴)이 보이고, 새로고침해도 세션이 남는다.
  const settings = page.getByRole("button", { name: "설정", exact: true });
  await expect(settings).toBeVisible();
  await page.reload(); await expect(settings).toBeVisible();
  // 로그아웃은 설정 화면에만 있다(2026-09-21). 끝나면 나의 골목의 로그인 안내로 돌아온다.
  await settings.click(); await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page.getByRole("button", { name: "로그인하기", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/my$/);
  // "로그인 상태 유지"(기본 켬)면 localStorage, 끄면 sessionStorage 다. 어느 쪽에도 남지 않아야 한다.
  expect(await page.evaluate(() => [localStorage.getItem("golmok.session"), sessionStorage.getItem("golmok.session")])).toEqual([null, null]);
});

test("현재 위치 사용을 거절해도 이름으로 동네를 선택할 수 있다", async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(() => Object.defineProperty(navigator, "geolocation", { value: {
    getCurrentPosition: (_, error) => error({ code: 1 }),
  } }));
  await page.goto("/");
  await page.getByRole("button", { name: "동네 선택", exact: true }).first().click();
  await page.getByRole("button", { name: "현재 위치로 찾기" }).click();
  // 위치 오류는 사유별 문구다(2026-09-18). 거부(code 1)면 권한 안내와 이름 검색을 함께 알린다.
  await expect(page.getByRole("dialog", { name: "동네 선택" }).getByRole("alert")).toContainText("위치 권한이 거부됐어요");
  await page.getByLabel("동네 이름").fill("역삼");
  await page.getByRole("button", { name: "동네 검색", exact: true }).click();
  await page.getByRole("button", { name: "역삼동 서울특별시 강남구 역삼동" }).click();
  await expect(page.getByRole("heading", { name: "역삼동의 이웃 물건" })).toBeVisible();
});
