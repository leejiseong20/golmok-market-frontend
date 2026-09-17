import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("실제 거래의 양쪽 후기와 매너온도를 채팅·구매내역·프로필에서 확인한다", async ({ page, request }, info) => {
  const tag = randomUUID().slice(0, 8);
  const password = `Aa1!${randomUUID()}`;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const accounts = [];
  const productIds = [];
  async function api(path, method = "GET", data, account) {
    const response = await request.fetch(`/api${path}`, { method, data,
      headers: account ? { Authorization: `Bearer ${account.accessToken}` } : {} });
    expect(response.ok(), `${method} ${path}: ${response.status()}`).toBeTruthy();
    return response.status() === 204 ? null : response.json();
  }
  async function login(account) {
    await page.goto("/");
    const logout = page.getByRole("button", { name: "로그아웃", exact: true }).first();
    if (await logout.isVisible()) await logout.click();
    await page.getByRole("button", { name: "로그인", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "로그인", exact: true });
    await dialog.getByLabel("이메일").fill(account.email);
    await dialog.getByLabel("비밀번호").fill(password);
    await dialog.getByRole("button", { name: "로그인하기" }).click();
    await expect(dialog).not.toBeVisible();
  }
  async function review(score, content) {
    await page.getByRole("button", { name: "후기 남기기", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "후기 남기기", exact: true });
    await dialog.getByLabel("평점", { exact: true }).selectOption(String(score));
    await dialog.getByLabel("후기 (선택)", { exact: true }).fill(content);
    await dialog.screenshot({ path: info.outputPath(`후기작성-${score}점.png`) });
    await expect(dialog.getByText("등록 즉시 공개되며", { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "후기 등록", exact: true }).click();
    await expect(dialog.getByRole("status")).toContainText("반영됐습니다");
    await dialog.getByRole("button", { name: "확인", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "후기 남기기", exact: true })).toHaveCount(0);
  }
  try {
    for (const role of ["s", "b"]) {
      const email = `review-${role}-${tag}@golmok.test`;
      await api("/auth/signup", "POST", { email, password, nickname: `후기${role}${tag}` });
      accounts.push({ email, ...await api("/auth/login", "POST", { email, password }) });
    }
    const [seller, buyer] = accounts;
    const regions = await api("/users/me/regions", "POST", { lat: 37.5006, lng: 127.0366 }, seller);
    const categories = await api("/categories");
    await page.goto("/");
    const upload = await request.post("/api/images", { headers: { Authorization: `Bearer ${seller.accessToken}` },
      multipart: { files: { name: "review.png", mimeType: "image/png", buffer: await page.screenshot() } } });
    expect(upload.ok()).toBeTruthy();
    const { imageUrls } = await upload.json();
    async function completedProduct(label) {
      const product = await api("/products", "POST", { title: `${label} ${tag}`, description: "후기 기능 실제 서버 검증용 상품입니다.",
        price: 1000, isNegotiable: false, tradeType: "DIRECT", categoryId: categories[0].id, regionId: regions[0].id, imageUrls }, seller);
      productIds.push(product.id);
      const room = await api(`/products/${product.id}/chat-rooms`, "POST", undefined, buyer);
      await api(`/chat-rooms/${room.roomId}/reservation`, "POST", undefined, seller);
      return api(`/chat-rooms/${room.roomId}/completion`, "POST", undefined, seller);
    }
    const room = await completedProduct("후기화면검증");
    await login(seller);
    await page.getByRole("button", { name: "채팅", exact: true }).first().click();
    await page.getByRole("button").filter({ hasText: buyer.user.nickname }).first().click();
    await review(4, "약속 시간에 맞춰 오셨어요.");
    await page.getByRole("button", { name: "상대 프로필 보기" }).click();
    const profile = page.getByRole("dialog", { name: "이웃 프로필" });
    await expect(profile).toContainText("36.7℃");
    await expect(profile).toContainText("약속 시간에 맞춰 오셨어요.");
    await profile.screenshot({ path: info.outputPath("상대프로필.png") });
    await profile.getByRole("button", { name: "닫기" }).click();
    await page.screenshot({ path: info.outputPath("채팅-후기완료.png") });

    await login(buyer);
    await page.getByRole("button", { name: "나의 골목", exact: true }).first().click();
    await page.getByRole("tab", { name: "구매내역", exact: true }).click();
    await review(5, "설명대로 상태가 좋았어요.");
    await page.getByRole("tab", { name: "받은 후기", exact: true }).click();
    await expect(page.getByRole("region", { name: "받은 후기", exact: true })).toContainText("약속 시간에 맞춰 오셨어요.");
    await page.screenshot({ path: info.outputPath("받은후기.png") });
    const duplicate = await request.post(`/api/trades/${room.trade.id}/reviews`, {
      headers: { Authorization: `Bearer ${buyer.accessToken}` }, data: { score: 5 } });
    expect(duplicate.status()).toBe(409);

    // 운영과 같은 MySQL REPEATABLE READ 에서 중복 작성과 서로 다른 거래의 동시 수신도 확인한다.
    const second = await completedProduct("후기동시검증1");
    const third = await completedProduct("후기동시검증2");
    const send = (tradeId) => request.post(`/api/trades/${tradeId}/reviews`, {
      headers: { Authorization: `Bearer ${buyer.accessToken}` }, data: { score: 5 } });
    const parallel = await Promise.all([send(second.trade.id), send(second.trade.id), send(third.trade.id)]);
    expect(parallel.map((response) => response.status()).sort()).toEqual([201, 201, 409]);
    const publicProfile = await api(`/users/${seller.user.id}`);
    expect(publicProfile.mannerTemp).toBe(37.7);
    expect(publicProfile.reviewCount).toBe(3);
    expect(errors).toEqual([]);
  } finally {
    // 이번 실행이 만든 상품만 내린다. 기존 데모·사용자 계정과 후기는 지우지 않는다.
    for (const id of productIds) await api(`/products/${id}`, "DELETE", undefined, accounts[0]);
  }
});
