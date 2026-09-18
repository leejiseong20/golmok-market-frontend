/**
 * 잠깐 떴다 사라지는 알림.
 *
 * 그동안 "저장했어요"·"끌어올렸어요" 같은 결과가 화면마다 다른 자리에 떴다(모달 안 문구, 홈 상단 빨간 줄).
 * 지나가는 알림은 한 곳에서 한 모양으로 띄우고, 입력값 오류처럼 그 자리에서 고쳐야 하는 것은
 * 예전처럼 해당 입력칸 옆에 남긴다.
 *
 * 타이머를 주입받아 DOM 없이 테스트한다.
 */
const DURATION = 3200;

export function createToasts({ timer = globalThis } = {}) {
  let items = [];
  let nextId = 1;
  const listeners = new Set();
  const timers = new Map();

  function emit() {
    listeners.forEach((listener) => listener());
  }

  function dismiss(id) {
    const handle = timers.get(id);
    if (handle !== undefined) {
      timer.clearTimeout?.(handle);
      timers.delete(id);
    }
    const next = items.filter((item) => item.id !== id);
    if (next.length === items.length) return;
    items = next;
    emit();
  }

  function show(message, { tone = "info", duration = DURATION } = {}) {
    if (!message) return null;
    const id = nextId++;
    items = [...items, { id, message, tone }];
    emit();
    const handle = timer.setTimeout?.(() => dismiss(id), duration);
    if (handle !== undefined) timers.set(id, handle);
    return id;
  }

  return {
    show,
    success: (message, options) => show(message, { ...options, tone: "success" }),
    error: (message, options) => show(message, { ...options, tone: "error" }),
    dismiss,
    // useSyncExternalStore 가 같은 배열이면 다시 그리지 않도록 목록은 매번 새 배열로 바꾼다.
    list: () => items,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

export const toast = createToasts();
