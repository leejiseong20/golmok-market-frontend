import { useLayoutEffect, useRef, useState } from "react";
import { thumbnailUrl } from "../api/imageUrl.js";
import { reorder as moveItem } from "../data/reorder.js";
import styles from "./PhotoSorter.module.css";

/**
 * 상품 사진 줄. 가로로 늘어놓고 끌어서 순서를 바꾼다. 맨 앞이 대표 사진이다.
 *
 * 예전에는 사진마다 ← → 버튼이 있어 두 장만 넘어도 화면이 아래로 길어졌다.
 *
 * 끌고 있는 사진은 **포인터를 그대로 따라다닌다.** 화면이 가만히 있으면 지금 끌리는 중인지 알 수 없다.
 * 자리를 내주는 다른 사진들은 FLIP 으로 미끄러지듯 움직인다. 순서가 바뀌면 브라우저는 새 위치로 즉시 그리므로,
 * 바뀌기 직전 위치로 되돌려 놓고 새 위치까지 애니메이션을 직접 준다.
 *
 * 마우스와 손가락을 같은 코드로 다루려고 포인터 이벤트를 쓴다(HTML5 드래그는 모바일에서 동작하지 않는다).
 * 손가락은 길게 누른 뒤에야 끌기가 시작된다. 바로 시작하면 줄을 좌우로 넘기려던 손짓이 사진 이동이 된다.
 *
 * 끌기만 두면 키보드로는 순서를 바꿀 수 없다. 사진에 초점을 두고 ← → 로도 옮길 수 있게 하고,
 * 바뀐 결과는 화면 밖 안내(aria-live)로 읽어 준다.
 */
const LONG_PRESS_MS = 220;
const DRAG_THRESHOLD = 6;
const SLIDE_MS = 180;
/** 줄 위아래로 이만큼까지는 아직 줄 안에 있는 것으로 본다. */
const ROW_MARGIN = 60;

export default function PhotoSorter({ photos, onReorder, onRemove, children }) {
  const [dragging, setDragging] = useState(null);
  const [notice, setNotice] = useState("");
  const listRef = useRef(null);
  const start = useRef(null);
  const longPress = useRef(null);
  const dragged = useRef(null);      // 끌고 있는 사진의 요소와 잡은 지점
  const pointer = useRef({ x: 0, y: 0 });
  const slots = useRef([]);          // 끌기 시작할 때의 칸 위치. 자리는 그대로고 안에 든 사진만 바뀐다.
  const rects = useRef(new Map());   // 다시 그리기 직전의 위치(FLIP 비교용)

  const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const cells = () => [...(listRef.current?.querySelectorAll("[data-url]") ?? [])];

  function snapshot() {
    rects.current = new Map(cells().map((el) => [el.dataset.url, el.getBoundingClientRect()]));
  }

  /** 순서가 바뀐 뒤, 자리를 옮긴 사진들을 이전 위치에서 새 위치로 미끄러뜨린다. */
  useLayoutEffect(() => {
    if (reduceMotion()) { snapshot(); return; }
    for (const el of cells()) {
      const before = rects.current.get(el.dataset.url);
      // 끌고 있는 사진은 포인터를 따라가므로 여기서 건드리지 않는다.
      if (!before || el.dataset.url === dragged.current?.url) continue;
      const after = el.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (!dx && !dy) continue;
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = `transform ${SLIDE_MS}ms ease`;
        el.style.transform = "";
      });
    }
    // 끌던 사진은 새 칸으로 옮겨졌다. 그리기 전에 포인터 위치로 다시 맞춰 한 칸씩 튀지 않게 한다.
    if (dragged.current) follow(pointer.current.x, pointer.current.y);
    snapshot();
  }, [photos]);

  function announce(from, to) {
    setNotice(`사진을 ${from + 1}번에서 ${to + 1}번으로 옮겼어요.${to === 0 ? " 대표 사진이 됩니다." : ""}`);
  }

  function reorder(from, to) {
    const next = moveItem(photos, from, to);
    if (next === photos) return;
    onReorder(next);
    announce(from, to);
  }

  /** 끌고 있는 사진을 지금 포인터 위치로 옮긴다. 자리(칸)가 바뀌어도 잡은 지점이 유지된다. */
  function follow(clientX, clientY) {
    const info = dragged.current;
    if (!info) return;
    const box = info.element.getBoundingClientRect();
    const left = box.left - info.tx;   // 변형을 걷어낸 원래 위치
    const top = box.top - info.ty;
    info.tx = clientX - info.grabX - left;
    info.ty = clientY - info.grabY - top;
    info.element.style.transform = `translate(${info.tx}px, ${info.ty}px)`;
  }

  function beginDrag(index, element, clientX, clientY) {
    const box = element.getBoundingClientRect();
    // 칸의 위치는 끌기 내내 그대로다. 미끄러지는 중인 칸의 순간 위치로 계산하면 자리 판정이 흔들린다.
    slots.current = cells().map((el) => el.getBoundingClientRect());
    dragged.current = {
      element, url: photos[index], tx: 0, ty: 0,
      grabX: clientX - box.left, grabY: clientY - box.top,
    };
    setDragging(index);
    follow(clientX, clientY);
  }

  /**
   * 포인터 위치가 몇 번째 자리인지 찾는다. 칸의 가운데를 지나면 그 자리를 차지한다.
   * 줄 위아래로 크게 벗어나면 자리를 바꾸지 않는다. 손이 살짝 흔들렸다고 사진이 맨 뒤로 날아가면 안 된다.
   */
  function indexAt(clientX, clientY) {
    const boxes = slots.current;
    if (!boxes.length) return dragging;
    const top = Math.min(...boxes.map((box) => box.top));
    const bottom = Math.max(...boxes.map((box) => box.bottom));
    if (clientY < top - ROW_MARGIN || clientY > bottom + ROW_MARGIN) return dragging;
    for (let i = 0; i < boxes.length; i++) {
      if (clientX < boxes[i].left + boxes[i].width / 2) return i;
    }
    return boxes.length - 1; // 줄 끝을 넘어가면 맨 뒤
  }

  function onPointerDown(event, index) {
    if (event.button !== undefined && event.button !== 0) return;
    // 기본 동작(글자·이미지 선택)을 막는다. 끌 때 사진이 파랗게 선택돼 보이던 원인이다.
    event.preventDefault();
    const element = event.currentTarget;
    const { clientX, clientY } = event;
    pointer.current = { x: clientX, y: clientY };
    start.current = { index, x: clientX, y: clientY, moved: false };
    // 브라우저가 이 포인터를 이미 놓친 경우가 있다(붙잡기에 실패해도 끌기는 계속된다).
    try { element.setPointerCapture(event.pointerId); } catch { /* 무시 */ }
    if (event.pointerType !== "mouse") {
      longPress.current = setTimeout(() => beginDrag(index, element, clientX, clientY), LONG_PRESS_MS);
    }
  }

  function onPointerMove(event, index) {
    const info = start.current;
    if (!info) return;
    const far = Math.abs(event.clientX - info.x) > DRAG_THRESHOLD || Math.abs(event.clientY - info.y) > DRAG_THRESHOLD;
    if (dragging === null) {
      // 손가락은 길게 누르기 전에 움직이면 줄을 넘기려는 것이다. 끌기를 시작하지 않는다.
      if (far && event.pointerType === "mouse") beginDrag(index, event.currentTarget, event.clientX, event.clientY);
      else if (far) { clearTimeout(longPress.current); start.current = null; }
      return;
    }
    info.moved = true;
    pointer.current = { x: event.clientX, y: event.clientY };
    // 끌고 있는 동안에는 화면이 함께 움직이지 않게 한다.
    event.preventDefault();
    follow(event.clientX, event.clientY);

    const to = indexAt(event.clientX, event.clientY);
    const next = moveItem(photos, dragging, to);
    if (next !== photos) {
      onReorder(next);
      setDragging(to);
    }
  }

  function onPointerUp() {
    clearTimeout(longPress.current);
    const info = dragged.current;
    if (info) {
      // 놓으면 제자리로 스르륵 들어간다. 갑자기 튀면 어디에 놓였는지 눈이 따라가지 못한다.
      const element = info.element;
      element.style.transition = reduceMotion() ? "" : `transform ${SLIDE_MS}ms ease`;
      element.style.transform = "";
      setTimeout(() => { element.style.transition = ""; }, SLIDE_MS);
    }
    if (dragging !== null && start.current?.moved) announce(start.current.index, dragging);
    dragged.current = null;
    start.current = null;
    slots.current = [];
    setDragging(null);
  }

  function onKeyDown(event, index) {
    if (event.key === "ArrowLeft") { event.preventDefault(); reorder(index, index - 1); }
    if (event.key === "ArrowRight") { event.preventDefault(); reorder(index, index + 1); }
  }

  return <>
    <ul className={styles.row} ref={listRef}>
      <li className={styles.cell}>{children}</li>
      {photos.map((url, index) => <li key={url} data-url={url}
        className={styles.cell + (dragging === index ? " " + styles.lifted : "")}>
        <div
          className={styles.photo + (dragging === index ? " " + styles.dragging : "")}
          tabIndex={0}
          role="button"
          aria-label={`사진 ${index + 1}${index === 0 ? " (대표)" : ""}. 끌어서 옮기거나 좌우 방향키로 순서를 바꿀 수 있어요.`}
          onPointerDown={(event) => onPointerDown(event, index)}
          onPointerMove={(event) => onPointerMove(event, index)}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={(event) => onKeyDown(event, index)}>
          <img src={thumbnailUrl(url)} alt="" draggable={false} />
          {index === 0 && <span className={styles.badge}>대표</span>}
        </div>
        <button type="button" className={styles.remove} onClick={() => onRemove(index)}
          aria-label={`사진 ${index + 1} 삭제`}>×</button>
      </li>)}
    </ul>
    <p className="sr-only" role="status">{notice}</p>
  </>;
}
