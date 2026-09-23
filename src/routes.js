/**
 * 화면 주소를 만드는 곳과 해석하는 곳을 한 파일에 모은다.
 * 컴포넌트가 문자열로 주소를 조립하면 한 곳을 바꿀 때 다른 곳이 조용히 깨진다.
 *
 * 알림의 targetUrl(서버가 저장한 경로)도 이 형식을 따른다. 서버와 약속한 형식이므로 바꿀 때는 백엔드도 함께 본다.
 */

export const MY_TABS = ["favorites", "purchases", "sales", "reviews"];
export const SORTS = ["LATEST", "PRICE_ASC"];

export const paths = {
  home: "/",
  product: (id) => `/products/${id}`,
  user: (id) => `/users/${id}`,
  chat: "/chat",
  chatRoom: (id) => `/chat-rooms/${id}`,
  // 기본 탭(찜한 상품)은 주소를 짧게 둔다.
  my: (tab = "favorites") => (tab === "favorites" ? "/my" : `/my/${tab}`),
  // 알림·내 동네·차단·계정을 모은 설정. /my/:tab 과 겹치지 않게 따로 둔다(탭이 아니다).
  settings: "/settings",
  // 관리자 전용 영역. 진입 버튼은 관리자에게만 헤더에 보인다. /admin 은 신고함으로 넘긴다.
  admin: "/admin",
  adminReports: "/admin/reports",
};

/** 경로 조각이 양의 정수 id 인지. "12abc", "0", "-1" 같은 값은 없는 화면으로 본다. */
export function parseId(value) {
  if (!/^[1-9]\d*$/.test(value ?? "")) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

/**
 * 홈 목록 조건을 주소 쿼리에서 읽는다. 사용자가 주소를 직접 고칠 수 있으므로
 * 모르는 값은 에러 대신 기본값으로 되돌린다(검색어는 서버 제한과 같은 50자).
 */
export function parseHomeQuery(search) {
  const params = new URLSearchParams(search);
  const keyword = (params.get("q") ?? "").trim().slice(0, 50);
  const sort = params.get("sort");
  return {
    keyword,
    categoryId: parseId(params.get("category")),
    sort: SORTS.includes(sort) ? sort : "LATEST",
  };
}

/** 기본값은 쿼리에서 뺀다. 같은 조건이 늘 같은 주소가 되어야 뒤로가기·공유가 헷갈리지 않는다. */
export function homeSearch({ keyword = "", categoryId = null, sort = "LATEST" }) {
  const params = new URLSearchParams();
  if (keyword.trim()) params.set("q", keyword.trim());
  if (categoryId) params.set("category", String(categoryId));
  if (sort !== "LATEST") params.set("sort", sort);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/**
 * 알림 등 서버가 준 경로가 이 앱의 화면인지. 허용 목록에 맞을 때만 이동한다.
 * 외부 주소(https://…, //evil)나 모르는 경로로 이동하면 열린 리다이렉트가 된다.
 */
export function isAppPath(url) {
  if (typeof url !== "string") return false;
  return /^\/products\/[1-9]\d*$/.test(url)
    || /^\/users\/[1-9]\d*$/.test(url)
    || /^\/chat-rooms\/[1-9]\d*$/.test(url)
    || url === "/chat"
    || url === "/my"
    || MY_TABS.some((tab) => url === `/my/${tab}`);
}
