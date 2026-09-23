import { NavLink, Route, Routes } from "react-router";
import NotFound from "../components/NotFound.jsx";
import { paths } from "../routes.js";
import AdminActions from "./AdminActions.jsx";
import AdminDashboard from "./AdminDashboard.jsx";
import AdminProducts from "./AdminProducts.jsx";
import AdminReports from "./AdminReports.jsx";
import AdminUsers from "./AdminUsers.jsx";
import styles from "./AdminApp.module.css";

/**
 * 관리자 영역(/admin/*). 같은 앱 안에 있지만 일반 화면과 틀을 나눈다.
 *
 * 일반 헤더·검색·카테고리·하단 탭을 쓰지 않는다. 관리 화면에서 상품 검색이나 채팅 탭이 보이면
 * 지금 어느 쪽에 있는지 헷갈리고, 메뉴(현황·신고함·회원·상품·조치 기록)를 설정 한 줄로는 담을 수 없다.
 * 이 파일부터는 App 이 필요할 때만 불러온다(lazy) — 관리자가 아닌 사람의 첫 화면 용량에 넣지 않는다.
 *
 * 권한 판단은 여전히 서버가 한다. 목록 요청이 404 면 onNotFound 로 알리고, App 이 일반 틀의 없는 페이지로 바꾼다.
 */
const MENU = [
  // 현황은 /admin 자체라 하위 주소에서 켜지지 않도록 end 로 정확히 맞춘다.
  { to: paths.admin, label: "현황", end: true },
  { to: paths.adminReports, label: "신고함" },
  { to: paths.adminUsers, label: "회원" },
  { to: paths.adminProducts, label: "상품" },
  { to: paths.adminActions, label: "조치 기록" },
];

export default function AdminApp({ onExit, onNotFound, onOpenProduct, onOpenProfile }) {
  return <div className={styles.app}>
    <header className={styles.bar}>
      <div className={styles.inner}>
        <span className={styles.brand}><span className={styles.mark} aria-hidden="true" />골목마켓 관리자</span>
        <nav className={styles.menu} aria-label="관리자 메뉴">
          {MENU.map((item) => <NavLink key={item.to} to={item.to} end={item.end}
            className={({ isActive }) => styles.menuItem + (isActive ? " " + styles.active : "")}>{item.label}</NavLink>)}
        </nav>
        <button className={"btn btn-ghost btn-sm " + styles.exit} onClick={onExit}>사이트로 돌아가기</button>
      </div>
    </header>
    <Routes>
      {/* 첫 화면은 현황판이다. 처리할 일이 있는지 먼저 보고 해당 목록으로 간다. */}
      <Route index element={<AdminDashboard onNotFound={onNotFound} />} />
      <Route path="reports" element={<AdminReports onNotFound={onNotFound}
        onOpenProduct={onOpenProduct} onOpenProfile={onOpenProfile} />} />
      <Route path="users" element={<AdminUsers onNotFound={onNotFound} onOpenProfile={onOpenProfile} />} />
      <Route path="products" element={<AdminProducts onNotFound={onNotFound} onOpenProduct={onOpenProduct} />} />
      <Route path="actions" element={<AdminActions onNotFound={onNotFound} />} />
      <Route path="*" element={<NotFound onHome={onExit} />} />
    </Routes>
  </div>;
}
