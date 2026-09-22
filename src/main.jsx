import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App.jsx";
import "./index.css";
import { watchViewport } from "./viewport.js";
import { watchInputMode } from "./inputMode.js";
import { registerServiceWorker } from "./pwa.js";
import { toast } from "./toast.js";
import { client } from "./api/client.js";
import { syncPushAccount } from "./push.js";

let pushAccount;
function updatePushAccount() {
  const id = client.getSession()?.user.id ?? null;
  if (pushAccount === id) return;
  pushAccount = id;
  syncPushAccount(id).catch((error) => toast.error(error.message));
}
client.subscribe(updatePushAccount);
updatePushAccount();

// 모바일 키보드가 덮은 높이를 CSS 변수로 알려 준다(채팅방·하단 탭이 이 값을 쓴다).
watchViewport();
// 손가락·마우스로 쓰는 동안에는 버튼 초점 링을 숨긴다(창을 열면 닫기 버튼에 링이 뜨던 문제).
watchInputMode();

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
