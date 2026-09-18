/**
 * 목록에서 한 항목을 다른 자리로 옮긴다(자리 바꾸기가 아니라 끼워 넣기).
 *
 * 끌어서 옮길 때는 지나간 사진들이 한 칸씩 밀려야 한다.
 * 두 항목을 맞바꾸면 3번을 1번으로 끌었을 때 1번이 3번 자리로 튀어 순서가 뒤엉킨다.
 *
 * 범위를 벗어나거나 제자리면 원래 배열을 그대로 돌려준다(화면을 다시 그리지 않는다).
 */
export function reorder(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
