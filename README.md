# 골목마켓 (프론트엔드)

동네 기반 중고거래 플랫폼 포트폴리오 프로젝트의 React 프론트엔드.
백엔드는 별도 저장소다: [golmok-market](https://github.com/leejiseong20/golmok-market) (Spring Boot 4.1.1 / MySQL)

- **데모:** https://golmok-market-frontend.vercel.app — 데모 계정 `demo4@golmok.test` / `Golmok123!`
- 런타임 의존성은 `react`, `react-dom`, `react-router`, `@stomp/stompjs` 넷뿐이다. 상태 관리·UI 라이브러리 없이 만들었다.

## 실행

백엔드가 `http://localhost:8080`에 떠 있어야 한다.

```bash
npm install
npm run dev     # http://127.0.0.1:5173
```

`/api` 요청은 `vite.config.js`에서 백엔드로 프록시된다. 채팅 WebSocket(`/api/ws`)도 같은 프록시를 탄다(`ws: true`). 환경값은 `.env.example`을 복사해 `.env`로 쓰고, `.env`는 커밋하지 않는다.

| 스크립트 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 번들 |
| `npm test` | 단위 테스트 135개(node:test) — API 클라이언트·채팅 소켓·푸시·서비스 워커·주소 규칙·오류 보고 등 |
| `npm run test:e2e` | Playwright E2E 44개(PC·모바일). API 와 WebSocket 을 모킹하므로 백엔드 없이 돈다 |
| `npm run test:e2e:live` | 실제 MySQL 백엔드에 붙이는 E2E(상품 쓰기·후기) |
| `npm run icons` | 앱 아이콘 PNG 재생성(`scripts/make-icons.mjs`) |

E2E 는 `PW_CHANNEL=chrome` 이면 설치된 Chrome 으로 돈다(CI 도 같은 설정).

## 구조

```
src/
  main.jsx                 엔트리. 가장 바깥 오류 경계, 서비스 워커 등록, 푸시 계정 동기화
  index.css                전역 리셋 + 디자인 토큰(CSS 변수, 밝게·어둡게)
  App.jsx                  화면 조립. 주소 → 페이지·모달, 동네·찜·상세 상태, 본문·창·부가 영역 오류 경계
  routes.js                주소 만들기·해석, 알림 경로 허용 목록
  crash.js                 오류 종류 판별(나눠진 파일을 받지 못한 오류인지)
  serverStatus.js          데모 서버가 살아 있는지(꺼짐 판정·8초 확인·30초마다 다시 확인)
  toast.js · theme.js      공용 토스트 · 화면 모드
  push.js · pwa.js         웹 푸시 구독 · 서비스 워커 등록
  viewport.js · inputMode.js  모바일 키보드 높이 · 입력 방식(초점 링)
  api/
    client.js              fetch 래퍼. 토큰 보관(로그인 상태 유지 선택), 401 처리, 재발급 공유
    chatSocket.js          채팅 실시간 연결(STOMP). 재연결 · 토큰 만료 처리
    errorReport.js         화면 오류 보고(서버 로그로, 경로만·같은 오류 한 번·최대 5건)
    adminApi.js            관리자 API
    *.js                   엔드포인트별 얇은 함수(인증·상품·동네·채팅·거래·후기·알림·신고·차단·푸시·검색)
  components/
    ErrorBoundary.jsx      오류 경계 + 본문 안내 + 창 안내
    ServerDownBanner.jsx   데모 서버가 꺼져 있을 때의 안내 띠(화면 캡처 링크·다시 확인)
    Header · BottomNav · CategoryBar · Sidebar · PopularKeywords   틀과 탐색
    ProductCard · ProductDetail · ProductForm · PhotoSorter · Lightbox   상품
    ChatPage · ChatList · ChatRoom   채팅(목록·방·직거래 줄)
    MyPage · SettingsPage · ProfileForm · MyRegions · PushToggle · BlockedUsers · WithdrawForm   나의 골목·설정
    UserProfile · ReviewForm · ReviewList · ReportForm · NotificationPanel   이웃·후기·신고·알림
    Modal · Toaster · Skeleton · EmptyState · Avatar · Icon · NotFound   공용
  admin/                   관리자 영역(/admin/*). 들어갈 때만 불러오는 별도 파일로 나뉜다
    AdminApp.jsx           관리자 틀(메뉴·사이트로 돌아가기) + 관리자 본문 오류 경계
    AdminDashboard · AdminReports · AdminUsers · AdminProducts · AdminActions   현황·신고함·회원·상품·조치 기록
    useAdminList.js        커서 목록 불러오기 · 주소 쿼리 조건 · "이 대상 열기"
  data/                    가격·시간 포맷, 가격 입력, 사진 순서 계산
public/sw.js               서비스 워커(사진·번들 캐시, API 는 캐시하지 않음, 푸시 수신)
```

## 설계 메모

- **주소가 화면을 정한다(`react-router`).** 상품 상세·프로필은 보던 화면 위의 모달이라 닫으면 목록과 스크롤이 그대로다. 홈 검색어·카테고리·정렬은 쿼리(`/?q=식탁&sort=PRICE_ASC`)라 공유·뒤로가기가 된다. 배포는 `vercel.json` 의 SPA 대체 경로가 필요하다.
- **세션 저장 위치는 로그인할 때 고른다.** "로그인 상태 유지"를 켜면 `localStorage`, 끄면 `sessionStorage`(탭을 닫으면 로그아웃)다. 공용 PC 에서는 끄면 된다.
- **토큰 재발급은 한 번만 보낸다.** 여러 요청이 동시에 만료되면 재발급 요청 하나를 공유하고 나머지는 그 결과를 기다린다. 각자 재발급하면 서버가 이전 토큰을 폐기(rotation)하므로 나머지가 로그아웃된다.
- **찜은 낙관적 갱신을 하지 않는다.** 서버가 준 `{ isLiked, favoriteCount }`만 반영한다. 하트와 관심 수가 어긋난 채 남는 것보다 낫다고 봤다.
- **상품 상세는 기록 항목마다 한 번만 요청한다.** 상세 조회가 조회수를 올리기 때문에, StrictMode의 effect 재실행이나 뒤로가기로 두 번 세어지지 않게 했다.
- **목록은 커서 페이징이다.** 홈은 무한 스크롤(`IntersectionObserver`), 나머지는 "더 보기"다. 서버가 준 `nextCursor`를 그대로 돌려보낸다.
- **채팅 메시지 전송은 REST, 수신은 WebSocket 이다.** 내가 보낸 메시지는 두 경로로 두 번 올 수 있어 `id`로 중복을 거른다. 재연결되면 REST 로 다시 불러온다(끊긴 동안의 이벤트는 다시 오지 않는다).
- **관리자 영역은 같은 앱 안의 별도 틀이다(`/admin/*`).** 일반 헤더·하단 탭 없이 자기 메뉴를 쓰고, 코드는 `React.lazy` 로 나눠 일반 사용자의 첫 화면 파일에 넣지 않는다. 권한 판단은 서버가 한다 — 관리자가 아니면 서버가 404 를 주고 화면은 "권한 없음" 대신 없는 페이지를 보인다(관리자 기능의 존재를 드러내지 않는다). 이때도 **코드(`RESOURCE_NOT_FOUND`)로만** 판단한다. 없는 회원·상품도 404 라 상태 코드로 가르면 관리자가 쫓겨난다.
- **오류 경계는 여러 겹이다.** 한 겹이면 인기 검색어 하나가 망가져도 사이트 전체가 멈춘다. 부가 영역(카테고리·인기 검색어·사이드바)은 조용히 숨기고, 본문은 그 자리만 안내로 바꾸며(헤더·하단 탭은 남고 주소가 바뀌면 풀린다), 창은 창만 닫게 하고, 관리자 본문은 관리자 메뉴를 남긴다. 배포로 나눠진 파일 이름이 바뀌어 받지 못한 오류는 다시 시도로 풀리지 않아 새로고침만 권한다. 잡은 오류는 서버 로그로 보고한다(토큰·쿼리 없이).
- **데모 서버가 꺼져 있으면 안내 띠 하나로 알린다.** 백엔드가 수업용 AWS 환경(Learner Lab)이라 세션이 끝나면 꺼진다. 그때 화면 곳곳에 빨간 오류 줄만 뜨면 보러 온 사람이 이유를 모른다. 연결 실패·502·503·504·JSON 아닌 응답·8초 무응답을 "꺼짐"으로 보고(서버가 JSON 으로 답했으면 4xx 여도 "켜짐"), 헤더 아래 띠에서 이유와 화면 캡처 링크를 보여 주며 같은 이유의 오류 줄은 숨긴다. 켜지면 홈 목록을 저절로 다시 부른다.

## 반응형

브레이크포인트는 `880px` 하나. 모바일 우선으로 작성하고 `@media (min-width: 880px)`에서 PC 레이아웃으로 전환한다.

| | 모바일 (<880px) | PC (≥880px) |
|---|---|---|
| 피드 | 1열 리스트 (썸네일 110px + 정보) | 3열 그리드 |
| 카테고리 | 가로 스크롤 칩 | 헤더 하단 줄바꿈 배치 |
| 내비게이션 | 하단 탭 | 헤더 우측 |
| 채팅 | 목록 → 방 한 화면씩 | 목록 · 방 나란히 |
| 창(모달) | 화면 전체 시트 | 가운데 창 |
