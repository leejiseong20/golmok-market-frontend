import { useEffect, useRef } from "react";

/**
 * 목록 끝 표시. 화면 아래 600px 안으로 들어오면 onReach 를 부른다.
 * 스크롤 이벤트마다 위치를 재지 않고 브라우저(IntersectionObserver)에 맡긴다. 닿기 전에 미리 불러 기다림을 줄인다.
 * 불러오는 동안은 부모가 이 요소를 빼므로, 다 불러온 뒤에도 아직 화면 가까이면 다시 나타나며 한 번 더 부른다
 * (첫 페이지가 화면보다 짧은 큰 모니터에서도 끝까지 채워진다).
 */
export default function InfiniteTrigger({ onReach }) {
  const ref = useRef(null);
  const reach = useRef(onReach);
  reach.current = onReach;
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) reach.current();
    }, { rootMargin: "0px 0px 600px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} aria-hidden="true" style={{ height: 1 }} />;
}
