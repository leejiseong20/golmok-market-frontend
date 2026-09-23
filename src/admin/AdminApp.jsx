import { Navigate, NavLink, Route, Routes } from "react-router";
import NotFound from "../components/NotFound.jsx";
import { paths } from "../routes.js";
import AdminReports from "./AdminReports.jsx";
import styles from "./AdminApp.module.css";

/**
 * 관리자 영역(/admin/*). 같은 앱 안에 있지만 일반 화면과 틀을 나눈다.
 *
 * 일반 헤더·검색·카테고리·하단 탭을 쓰지 않는다. 관리 화면에서 상품 검색이나 채팅 탭이 보이면
 * 지금 어느 쪽에 있는지 헷갈리고, 앞으로 사용자·상품·조치 기록 메뉴가 늘면 설정 한 줄로는 담을 수 없다.
 * 이 파일부터는 App 이 필요할 때만 불러온다(lazy) — 관리자가 아닌 사람의 첫 화면 용량에 넣지 않는다.
 *
 * 권한 판단은 여전히 서버가 한다. 목록 요청이 404 면 onNotFound 로 알리고, App 이 일반 틀의 없는 페이지로 바꾼다.
 */
const MENU = [
  { to: paths.adminReports, label: "신고함" },
];

export default function AdminApp({ onExit, onNotFound, onOpenProduct, onOpenProfile }) {
  return <div className={styles.app}>
    <header className={styles.bar}>
      <div className={styles.inner}>
        <span className={styles.brand}><span className={styles.mark} aria-hidden="true" />골목마켓 관리자</span>
        <nav className={styles.menu} aria-label="관리자 메뉴">
          {MENU.map((item) => <NavLink key={item.to} to={item.to}
            className={({ isActive }) => styles.menuItem + (isActive ? " " + styles.active : "")}>{item.label}</NavLink>)}
        </nav>
        <button className={"btn btn-ghost btn-sm " + styles.exit} onClick={onExit}>사이트로 돌아가기</button>
      </div>
    </header>
    <Routes>
      {/* 첫 화면은 신고함이다. 메뉴가 늘어도 가장 자주 보는 곳에서 시작한다. */}
      <Route index element={<Navigate to={paths.adminReports} replace />} />
      <Route path="reports" element={<AdminReports onNotFound={onNotFound}
        onOpenProduct={onOpenProduct} onOpenProfile={onOpenProfile} />} />
      <Route path="*" element={<NotFound onHome={onExit} />} />
    </Routes>
  </div>;
}
