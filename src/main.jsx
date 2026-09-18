import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App.jsx";
import "./index.css";
import { watchViewport } from "./viewport.js";

// 모바일 키보드가 덮은 높이를 CSS 변수로 알려 준다(채팅방·하단 탭이 이 값을 쓴다).
watchViewport();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
