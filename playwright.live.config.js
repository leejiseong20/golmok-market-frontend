import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";

// 실제 MySQL 백엔드를 먼저 실행한다. API 응답을 가로채거나 대체하지 않는다.
export default defineConfig({ ...base, testMatch: "**/product-write.spec.js",
  timeout: 60000,
  use: { ...base.use, trace: "off", actionTimeout: 10000 }, // 가입/로그인 요청의 비밀번호·토큰을 기록하지 않는다.
});
