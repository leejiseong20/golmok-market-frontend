import { defineConfig } from "@playwright/test";

/**
 * PW_CHANNEL 로 브라우저를 고른다.
 * - 비워 두면 Playwright 가 받은 Chromium(기본).
 * - "chrome" 이면 그 PC 에 설치된 Chrome. 이 저장소는 CI 와 로컬 모두 이 값을 쓴다 —
 *   개발 PC 에 이미 Chrome 이 있어 전용 브라우저를 따로 받지 않아도 되고,
 *   깃허브 실행기에도 Chrome 이 깔려 있어 CI 와 로컬이 같은 브라우저로 돈다.
 */
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/app.spec.js",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure", channel },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  // CI 실행기는 개발 서버가 뜨는 데 더 걸린다. 기본 60초로는 빠듯해 넉넉히 둔다.
  webServer: { command: "npm run dev", url: "http://127.0.0.1:5173", reuseExistingServer: false, timeout: 120_000 },
});
