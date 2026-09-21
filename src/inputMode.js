/**
 * 지금 손가락·마우스로 쓰는지, 키보드(Tab)로 옮겨 다니는지를 `<html data-input>` 에 적는다.
 *
 * 창(dialog)을 열면 브라우저가 첫 버튼(닫기)에 초점을 옮기는데, iOS Safari 는 이 초점에도 초점 링을 그렸다.
 * 아무것도 누르지 않았는데 닫기 버튼에 주황 동그라미가 쳐진 것처럼 보였다(실제 아이폰 캡처).
 * 초점 링은 키보드로 옮겨 다니는 사람에게만 필요하다. 그래서 손가락·마우스로 쓰는 동안에는
 * 버튼·링크의 초점 링을 숨기고(index.css), Tab 을 누르는 순간부터 다시 보인다.
 *
 * 입력칸은 대상이 아니다. 글을 쓰는 칸은 어느 방식이든 초점이 보여야 한다.
 * Tab 만 키보드로 본다 — 휴대폰 화상 키보드로 글자를 칠 때도 keydown 이 오기 때문이다.
 * 처음 값은 pointer 다. 아직 아무 입력이 없을 때(주소로 바로 상세를 연 경우 등) 링이 뜨지 않게 하고,
 * 키보드 사용자는 첫 Tab 에서 바로 keyboard 로 바뀐다.
 */
export function watchInputMode(root = document.documentElement, target = document) {
  const set = (mode) => { if (root.dataset.input !== mode) root.dataset.input = mode; };
  const onPointer = () => set("pointer");
  const onKey = (event) => { if (event.key === "Tab") set("keyboard"); };
  set("pointer");
  // capture: 화면 안에서 전파를 멈추는 요소가 있어도 먼저 받는다.
  target.addEventListener("pointerdown", onPointer, true);
  target.addEventListener("keydown", onKey, true);
  return () => {
    target.removeEventListener("pointerdown", onPointer, true);
    target.removeEventListener("keydown", onKey, true);
  };
}
