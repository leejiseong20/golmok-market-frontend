/**
 * 모바일 키보드가 올라올 때의 화면 크기를 CSS 에 알려준다.
 *
 * iOS 는 키보드가 올라와도 **레이아웃 크기를 줄이지 않고 화면을 덮는다**(`100dvh` 도 그대로다).
 * 그래서 화면 높이에 맞춰 짠 채팅방이 키보드 뒤로 밀려 위쪽이 잘렸다.
 * 실제로 보이는 영역은 visualViewport 가 알려주므로, 그 값을 CSS 변수로 내려 화면이 따라가게 한다.
 *
 * - `--vvh` : 지금 실제로 보이는 높이(키보드를 뺀 높이)
 * - `--kb`  : 키보드가 가린 높이(닫혀 있으면 0)
 * - `<html data-keyboard="open">` : 키보드가 올라온 동안. 하단 탭을 숨기는 데 쓴다.
 *
 * visualViewport 가 없는 브라우저에서는 아무것도 하지 않는다. CSS 는 `var(--vvh, 100dvh)` 처럼
 * 기본값을 두므로 예전과 똑같이 동작한다.
 */
/** 이만큼 넘게 가려지면 키보드가 올라온 것으로 본다(주소창이 접히는 정도는 무시). */
const KEYBOARD_THRESHOLD = 120;

export function watchViewport(root = document.documentElement, viewport = globalThis.visualViewport) {
  if (!viewport) return () => {};

  const apply = () => {
    /*
     * 키보드가 가린 높이 = 레이아웃 높이 - 실제로 보이는 높이.
     *
     * 레이아웃 높이는 window.innerHeight 가 아니라 documentElement.clientHeight 로 읽는다.
     * iOS 크롬은 키보드가 올라오면 innerHeight 까지 같이 줄여서(실측: 둘 다 390) 차이가 0 이 된다.
     * clientHeight 는 키보드와 무관하게 유지되므로(실측: 684) 여기서만 키보드 높이를 구할 수 있다.
     */
    const layout = root?.clientHeight || globalThis.innerHeight;
    const hidden = Math.max(0, layout - viewport.height);
    root.style.setProperty("--vvh", `${Math.round(viewport.height)}px`);
    root.style.setProperty("--kb", `${Math.round(hidden)}px`);
    if (hidden > KEYBOARD_THRESHOLD) root.dataset.keyboard = "open";
    else delete root.dataset.keyboard;
  };

  apply();
  viewport.addEventListener("resize", apply);
  // 키보드가 올라오면 화면이 함께 밀리기도 한다. 그때도 보이는 높이를 다시 잰다.
  viewport.addEventListener("scroll", apply);
  return () => {
    viewport.removeEventListener("resize", apply);
    viewport.removeEventListener("scroll", apply);
  };
}
