import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App.jsx";
import "./index.css";
import { watchViewport } from "./viewport.js";
import { registerServiceWorker } from "./pwa.js";
import { toast } from "./toast.js";

// 모바일 키보드가 덮은 높이를 CSS 변수로 알려 준다(채팅방·하단 탭이 이 값을 쓴다).
watchViewport();

// 홈 화면에 설치해 앱처럼 쓰기 위한 서비스 워커. 개발 서버에서는 켜지 않는다(pwa.js 참고).
registerServiceWorker({
  container: navigator.serviceWorker,
  isProduction: import.meta.env.PROD,
  onUpdate: () => toast.show("새 버전이 나왔어요. 새로고침하면 최신 화면으로 바뀌어요."),
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
