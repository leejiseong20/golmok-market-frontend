# 골목마켓 (프론트엔드)

동네 기반 중고거래 플랫폼 포트폴리오 프로젝트의 React 프론트엔드.
백엔드는 별도 저장소다: [golmok-market](https://github.com/leejiseong20/golmok-market) (Spring Boot 4.1.1 / MySQL)

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
| `npm test` | API 클라이언트 · 채팅 소켓 단위 테스트 (node:test) |
| `npm run test:e2e` | Playwright E2E. API는 모킹하므로 백엔드 없이 돈다 |
| `npm run icons` | 앱 아이콘 PNG 재생성(`scripts/make-icons.mjs`) |

## 구조

```
src/
  main.jsx                 엔트리
  index.css                전역 리셋 + 디자인 토큰(CSS 변수)
  App.jsx                  화면 조립 + 상태(동네/카테고리/정렬/검색/찜/화면 전환)
  App.module.css           셸 레이아웃 + PC/모바일 분기
  api/
    client.js              fetch 래퍼. 토큰 보관, 401 처리, 토큰 재발급
    authApi.js             가입 · 로그인 · 로그아웃
    productApi.js          카테고리 · 상품 목록/상세 · 찜 토글
    regionApi.js           동네 검색 · 근처 동네
    userApi.js             내 정보 · 내 찜 목록
    chatApi.js             채팅방 · 메시지 · 읽음 · 나가기
    chatSocket.js          채팅 실시간 연결(STOMP). 재연결 · 토큰 만료 처리
  components/
    Header.jsx             로고 · 동네 선택 · 검색 · 계정(PC)
    CategoryBar.jsx        카테고리 칩
    ProductCard.jsx        상품 카드 + 찜 버튼
    ProductDetail.jsx      상품 상세 모달 (이미지 슬라이드)
    MyPage.jsx             나의 골목 — 내 정보 + 찜한 상품
    NotFound.jsx           없는 주소
    ChatPage.jsx           채팅 화면 — 목록·방 배치(PC 나란히, 모바일 한 화면씩)
    ChatList.jsx           채팅 목록. 실시간으로 미리보기·안 읽은 수 갱신
    ChatRoom.jsx           채팅방. 메시지 · 전송 · 읽음 표시 · 이전 메시지
    RegionPicker.jsx       동네 검색/선택 모달
    AuthModal.jsx          로그인 · 회원가입 모달
    Modal.jsx              공통 다이얼로그
    Sidebar.jsx            안내 패널 (PC 전용)
    BottomNav.jsx          하단 탭 (모바일 전용)
  data/format.js           가격 · 상대시간 · 상태 라벨 포맷
  routes.js                주소 만들기·해석, 알림 경로 허용 목록
```

## 설계 메모

- **주소가 화면을 정한다(`react-router`).** 상품 상세·프로필은 보던 화면 위의 모달이라 닫으면 목록과 스크롤이 그대로다. 홈 검색어·카테고리·정렬은 쿼리(`/?q=식탁&sort=PRICE_ASC`)라 공유·뒤로가기가 된다. 배포는 `vercel.json` 의 SPA 대체 경로가 필요하다.
- **세션은 `sessionStorage`에 둔다.** 탭을 닫으면 로그아웃된다. 공용 PC에서 토큰이 남지 않게 하려는 선택이다.
- **토큰 재발급은 한 번만 보낸다.** 여러 요청이 동시에 만료되면 재발급 요청 하나를 공유하고 나머지는 그 결과를 기다린다. 각자 재발급하면 서버가 이전 토큰을 폐기(rotation)하므로 나머지가 로그아웃된다.
- **찜은 낙관적 갱신을 하지 않는다.** 서버가 준 `{ isLiked, favoriteCount }`만 반영한다. 하트와 관심 수가 어긋난 채 남는 것보다 낫다고 봤다.
- **상품 상세는 기록 항목마다 한 번만 요청한다.** 상세 조회가 조회수를 올리기 때문에, StrictMode의 effect 재실행이나 뒤로가기로 두 번 세어지지 않게 했다.
- **목록은 커서 페이징이다.** "더 보기"는 서버가 준 `nextCursor`를 그대로 돌려보낸다.
- **채팅 메시지 전송은 REST, 수신은 WebSocket 이다.** 내가 보낸 메시지는 두 경로로 두 번 올 수 있어 `id`로 중복을 거른다. 재연결되면 REST 로 다시 불러온다(끊긴 동안의 이벤트는 다시 오지 않는다).

## 반응형

브레이크포인트는 `880px` 하나. 모바일 우선으로 작성하고 `@media (min-width: 880px)`에서 PC 레이아웃으로 전환한다.

| | 모바일 (<880px) | PC (≥880px) |
|---|---|---|
| 피드 | 1열 리스트 (썸네일 110px + 정보) | 3열 그리드 |
| 카테고리 | 가로 스크롤 칩 | 헤더 하단 줄바꿈 배치 |
| 내비게이션 | 하단 탭 | 헤더 우측 |
| 채팅 | 목록 → 방 한 화면씩 | 목록 · 방 나란히 |
