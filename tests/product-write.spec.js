import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("실제 서버에서 사진 업로드부터 등록 수정 판매내역 상태 변경 삭제까지", async ({ page, request }, info) => {
  const tag = randomUUID().slice(0, 8);
  const email = `write-${tag}@golmok.test`;
  const password = `Aa1!${randomUUID()}`;
  let accessToken, refreshToken, productId;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  try {
    const signup = await request.post("/api/auth/signup", { data: { email, password, nickname: `등록검증${tag}` } });
    expect(signup.status()).toBe(201);
    const login = await request.post("/api/auth/login", { data: { email, password } });
    expect(login.status()).toBe(200);
    ({ accessToken, refreshToken } = await login.json());
    const verified = await request.post("/api/users/me/regions", {
      headers: { Authorization: `Bearer ${accessToken}` }, data: { lat: 37.5006, lng: 127.0366 },
    });
    expect(verified.status()).toBe(200);
    await page.goto("/");
    await page.getByRole("button", { name: "로그인", exact: true }).first().click();
    const auth = page.getByRole("dialog", { name: "로그인", exact: true });
    await auth.getByLabel("이메일").fill(email);
    await auth.getByLabel("비밀번호").fill(password);
    await auth.getByRole("button", { name: "로그인하기" }).click();
    await expect(auth).not.toBeVisible();

    // 실제 브라우저 화면을 PNG로 만들어 실제 업로드 API에 보낸다.
    const photo = await page.screenshot();
    await page.getByRole("button", { name: "＋ 상품 등록", exact: true }).click();
    const form = page.getByRole("dialog", { name: "상품 등록", exact: true });
    await form.getByLabel("제목", { exact: true }).fill(`등록검증 ${tag}`);
    await form.getByLabel("설명", { exact: true }).fill("실제 서버와 연결해서 등록한 검증용 상품입니다.");
    await form.getByLabel("가격", { exact: true }).fill("18000");
    await form.getByRole("combobox", { name: "카테고리", exact: true }).selectOption({ index: 1 });
    await form.locator('input[type="file"]').setInputFiles([
      { name: "검증사진1.png", mimeType: "image/png", buffer: photo },
      { name: "검증사진2.png", mimeType: "image/png", buffer: photo },
    ]);
    await expect(form.getByAltText("상품 사진 2", { exact: true })).toBeVisible();
    await expect(form.getByRole("status")).toHaveCount(0);
    await form.getByRole("button", { name: "사진 2 앞으로", exact: true }).click();
    await form.screenshot({ path: info.outputPath("등록화면.png") });
    const createdResponse = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/products");
    await form.getByRole("button", { name: "등록하기", exact: true }).click();
    const created = await createdResponse;
    expect(created.status()).toBe(201);
    productId = (await created.json()).id;
    const detail = page.getByRole("dialog", { name: "상품 상세", exact: true });
    await expect(detail.getByText(`등록검증 ${tag}`, { exact: true })).toBeVisible();
    await expect.poll(() => detail.locator("img").evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
    await detail.getByRole("button", { name: "끌어올리기", exact: true }).click();
    await expect(detail.getByRole("alert")).toContainText("24시간");
    await detail.getByRole("button", { name: "수정하기", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "상품 수정", exact: true });
    await edit.getByLabel("제목", { exact: true }).fill(`수정검증 ${tag}`);
    await edit.getByLabel("가격", { exact: true }).fill("12000");
    await edit.getByRole("button", { name: "사진 2 삭제", exact: true }).click();
    await edit.getByRole("button", { name: "수정 완료", exact: true }).click();
    await expect(detail.getByText(`수정검증 ${tag}`, { exact: true })).toBeVisible();
    await expect(detail.getByText("12,000원", { exact: true })).toBeVisible();
    const status = detail.getByRole("group", { name: "판매 상태", exact: true });
    await status.getByRole("button", { name: "예약중", exact: true }).click();
    await expect(status.getByRole("button", { name: "예약중", exact: true })).toHaveAttribute("aria-pressed", "true");
    await detail.getByRole("button", { name: "닫기", exact: true }).click();
    await page.getByRole("button", { name: "나의 골목", exact: true }).first().click();
    await page.getByRole("tab", { name: "판매내역", exact: true }).click();
    await page.getByRole("combobox", { name: "판매 상태", exact: true }).selectOption("RESERVED");
    await expect(page.getByRole("button", { name: `수정검증 ${tag} 상세 보기`, exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "구매내역", exact: true }).click();
    await expect(page.getByText("아직 구매한 상품이 없어요.", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "판매내역", exact: true }).click();
    await expect(page.getByRole("button", { name: `수정검증 ${tag} 상세 보기`, exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("판매내역.png"), fullPage: true });
    await page.getByRole("button", { name: `수정검증 ${tag} 상세 보기`, exact: true }).click();
    await detail.getByRole("group", { name: "판매 상태", exact: true }).getByRole("button", { name: "판매완료", exact: true }).click();
    await expect(detail.getByRole("button", { name: "수정하기", exact: true })).toHaveCount(0);
    await detail.screenshot({ path: info.outputPath("판매완료.png") });
    await detail.getByRole("button", { name: "상품 삭제하기", exact: true }).click();
    await expect(detail).not.toBeVisible();
    await page.getByRole("combobox", { name: "판매 상태", exact: true }).selectOption("");
    await expect(page.getByText("조건에 맞는 판매 상품이 없어요.", { exact: true })).toBeVisible();
    expect((await request.get(`/api/products/${productId}`)).status()).toBe(404);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    // 이 실행에서 만든 상품만 정리한다. 사용자 계정과 데모 상품에는 접근하지 않는다.
    if (productId && accessToken) await request.delete(`/api/products/${productId}`, { headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => {});
    if (accessToken && refreshToken) await request.post("/api/auth/logout", {
      headers: { Authorization: `Bearer ${accessToken}` }, data: { refreshToken },
    }).catch(() => {});
    await info.attach("검증 계정", { body: email, contentType: "text/plain" });
  }
});
