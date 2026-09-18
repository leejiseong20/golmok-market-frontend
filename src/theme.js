/**
 * 밝은 화면 · 어두운 화면 전환.
 *
 * 고르기 전에는 시스템 설정을 따르고, 한 번 고르면 그 선택이 시스템보다 우선한다.
 * 선택은 `<html data-theme>` 로 내려가고 색은 index.css 의 토큰이 바꾼다(컴포넌트는 테마를 모른다).
 *
 * 저장소는 localStorage 다. 기기에 남아야 하고 민감한 값이 아니라 동네 선택과 같은 기준이다.
 * 저장이 막힌 환경(비공개 모드)에서도 메모리로 동작한다.
 *
 * 테스트를 위해 저장소·문서·미디어질의를 주입받는다(실제 인스턴스는 파일 맨 아래).
 */
export const THEME_KEY = "golmok.theme";

export function createTheme({ storage, root, media } = {}) {
  let chosen = read();
  const listeners = new Set();

  function read() {
    try {
      const saved = storage?.getItem(THEME_KEY);
      return saved === "dark" || saved === "light" ? saved : null;
    } catch {
      return null;
    }
  }

  function systemPrefersDark() {
    return !!media?.matches;
  }

  /** 지금 실제로 보이는 화면. 고른 값이 없으면 시스템 설정이다. */
  function effective() {
    return chosen ?? (systemPrefersDark() ? "dark" : "light");
  }

  function apply() {
    if (!root) return;
    if (chosen) root.dataset.theme = chosen;
    else delete root.dataset.theme;
  }

  function set(value) {
    chosen = value === "dark" || value === "light" ? value : null;
    try {
      if (chosen) storage?.setItem(THEME_KEY, chosen);
      else storage?.removeItem(THEME_KEY);
    } catch { /* 저장이 막혀도 이번 세션에서는 동작한다. */ }
    apply();
    listeners.forEach((listener) => listener());
  }

  /** 보이는 화면의 반대로 바꾼다. 시스템을 따르던 중이라도 여기서부터는 고른 값이 우선한다. */
  function toggle() {
    set(effective() === "dark" ? "light" : "dark");
  }

  function subscribe(listener) {
    listeners.add(listener);
    // 시스템 설정이 바뀌면 고른 값이 없을 때만 화면이 따라간다.
    const onSystemChange = () => { if (!chosen) listeners.forEach((fn) => fn()); };
    media?.addEventListener?.("change", onSystemChange);
    return () => {
      listeners.delete(listener);
      media?.removeEventListener?.("change", onSystemChange);
    };
  }

  apply();
  return { effective, get: () => chosen, set, toggle, subscribe };
}

const browser = typeof window !== "undefined";
export const theme = createTheme({
  storage: browser ? window.localStorage : null,
  root: browser ? document.documentElement : null,
  media: browser && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null,
});
