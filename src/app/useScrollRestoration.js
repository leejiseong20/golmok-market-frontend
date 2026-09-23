import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * 주소별 스크롤 위치. 뒤로가기로 목록에 돌아오면 보던 자리에서 이어 본다.
 *
 * 기록 항목(location.key)으로 나누면 더 정확하지만, 이 라우터 설정에서는 key 가 계속 "default" 라
 * 화면이 바뀐 것을 알아채지 못한다. 같은 주소의 서로 다른 기록 항목은 위치를 공유한다(실용적인 절충).
 *
 * @param pageKey     지금 페이지(아래 화면)의 주소. 모달을 열고 닫을 때는 바뀌지 않는다.
 * @param contentSize 목록 길이. 돌아온 직후 목록이 채워지면 한 번 더 맞추는 데 쓴다.
 * @returns rememberScroll — 지금 페이지의 위치를 적는다. 앱 안 이동 직전에 불러야 한다.
 */
export default function useScrollRestoration(pageKey, contentSize) {
  const scrollPositions = useRef(new Map());
  const restoreTarget = useRef(0);

  /** 지금 보고 있는 기록 항목의 스크롤 위치를 적어 둔다. 화면이 바뀌기 전에 불러야 한다. */
  function rememberScroll() {
    scrollPositions.current.set(pageKey, window.scrollY);
  }

  /**
   * 뒤로·앞으로는 우리 코드를 거치지 않으므로 popstate 에서 위치를 적는다.
   * 이 이벤트는 화면이 바뀌기 전에 오기 때문에 잘리지 않은 값을 읽을 수 있다.
   */
  useEffect(() => {
    window.addEventListener("popstate", rememberScroll);
    return () => window.removeEventListener("popstate", rememberScroll);
  });

  /**
   * 페이지를 옮기면 스크롤을 옮긴다. 처음 보는 페이지는 맨 위, 뒤로가기로 돌아온 페이지는 보던 자리다.
   * 모달을 열고 닫을 때는 아래 페이지(pageKey)가 그대로라 여기 해당하지 않는다.
   */
  useEffect(() => {
    restoreTarget.current = scrollPositions.current.get(pageKey) ?? 0;
    window.scrollTo(0, restoreTarget.current);
    if (window.scrollY >= restoreTarget.current) restoreTarget.current = 0;

    // 사용자가 직접 움직였다면 복원은 그만둔다(돌아온 목록이 더 짧을 수도 있다).
    const cancelRestore = () => { restoreTarget.current = 0; };
    window.addEventListener("wheel", cancelRestore, { passive: true });
    window.addEventListener("touchstart", cancelRestore, { passive: true });
    window.addEventListener("keydown", cancelRestore);
    return () => {
      window.removeEventListener("wheel", cancelRestore);
      window.removeEventListener("touchstart", cancelRestore);
      window.removeEventListener("keydown", cancelRestore);
    };
  }, [pageKey]);

  /**
   * 돌아온 직후에는 목록이 아직 스켈레톤이라 예전만큼 내려갈 수 없다.
   * 목록이 채워지면 한 번 더 맞추고, 원하는 위치에 닿으면 그만둔다.
   */
  useLayoutEffect(() => {
    if (!restoreTarget.current) return;
    window.scrollTo(0, restoreTarget.current);
    if (window.scrollY >= restoreTarget.current) restoreTarget.current = 0;
  }, [contentSize]);

  return rememberScroll;
}
