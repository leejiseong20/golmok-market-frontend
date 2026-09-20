/**
 * 서비스 워커 등록(홈 화면에 설치해 앱처럼 쓰기 위한 것).
 *
 * 개발 서버에서는 켜지 않는다. 캐시 우선 규칙 때문에 고친 코드가 캐시에 갇혀
 * "왜 안 바뀌지" 를 반복하게 된다. 배포한 화면에서만 동작한다.
 *
 * 새 버전은 밀어 넣지 않는다(sw.js 참고). 대신 "준비됐다"를 알려 주면
 * 앱이 토스트로 알리고, 사용자가 새로고침할 때 최신 화면이 온다.
 *
 * theme.js 와 같은 방식으로 의존성을 주입받는다. 그래야 DOM·브라우저 없이 테스트할 수 있다.
 */
export function registerServiceWorker({ container, isProduction, onUpdate, url = "/sw.js" } = {}) {
  // 서비스 워커는 HTTPS(와 localhost)에서만 있다. 없는 환경에서는 조용히 넘어간다.
  if (!isProduction || typeof container?.register !== "function") return Promise.resolve(null);

  return container.register(url).then((registration) => {
    watchForUpdate(container, registration, onUpdate);
    return registration;
  }).catch(() => {
    // 등록 실패는 화면에 알리지 않는다. 앱은 서비스 워커 없이도 완전히 동작한다.
    return null;
  });
}

function watchForUpdate(container, registration, onUpdate) {
  if (typeof onUpdate !== "function") return;

  // 다른 탭에서 이미 새 버전을 받아 두고 기다리는 중일 수 있다.
  if (registration.waiting && container.controller) { onUpdate(); return; }

  registration.addEventListener?.("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state !== "installed") return;
      // controller 가 없으면 이번이 첫 설치다. "새 버전" 이 아니므로 알리지 않는다.
      if (container.controller) onUpdate();
    });
  });
}
