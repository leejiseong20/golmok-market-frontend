import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import { isAdminDenied } from "../api/adminApi.js";
import { toast } from "../toast.js";

/**
 * 관리자 목록(커서 페이지) 불러오기. 회원·상품·조치 기록이 같은 규칙을 쓴다.
 *
 * - filterKey 가 바뀌면 처음부터 다시 부른다(늦게 온 이전 조건의 응답은 버린다).
 * - 관리자가 아니라는 답(404 RESOURCE_NOT_FOUND)이면 onNotFound — 화면은 없는 페이지로 바뀐다.
 * - "더 보기"는 이미 받은 항목과 겹치면 뺀다(그 사이 새 기록이 생겨 경계가 밀릴 수 있다).
 */
export default function useAdminList(fetchPage, filterKey, onNotFound) {
  const [list, setList] = useState({ items: [], loading: true, error: "", cursor: null, hasNext: false });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    setList((old) => ({ ...old, loading: true, error: "" }));
    fetchPage(null, abort.signal)
      .then((page) => {
        if (abort.signal.aborted) return;
        setList({ items: page.content, loading: false, error: "", cursor: page.nextCursor, hasNext: page.hasNext });
      })
      .catch((error) => {
        if (abort.signal.aborted) return;
        if (isAdminDenied(error)) { onNotFound(); return; }
        setList((old) => ({ ...old, items: [], loading: false, error: error.message }));
      });
    return () => abort.abort();
    // fetchPage 는 렌더마다 새로 만들어진다. 조건은 filterKey 로만 판단한다.
  }, [filterKey, reload]);

  async function more() {
    if (!list.hasNext || list.loading) return;
    try {
      const page = await fetchPage(list.cursor);
      setList((old) => {
        const known = new Set(old.items.map((item) => item.id));
        return { ...old, items: [...old.items, ...page.content.filter((item) => !known.has(item.id))],
          cursor: page.nextCursor, hasNext: page.hasNext };
      });
    } catch (error) {
      toast.error(error.message);
    }
  }

  return { list, more, reload: () => setReload((value) => value + 1) };
}

/**
 * 목록 조건을 주소 쿼리에 둔다. 새로고침·현황판 링크(예: 정지된 회원만)로 같은 조건을 다시 열 수 있다.
 * 조건을 바꿀 때는 기록을 쌓지 않는다(탭을 누를 때마다 뒤로가기가 한 칸씩 늘면 관리 화면을 빠져나가기 어렵다).
 */
export function useSearchFilters() {
  const [params, setParams] = useSearchParams();
  const change = (next) => setParams((previous) => {
    const updated = new URLSearchParams(previous);
    Object.entries(next).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") updated.delete(key);
      else updated.set(key, String(value));
    });
    return updated;
  }, { replace: true });
  return [params, change];
}

/**
 * 다른 관리 화면에서 "이 대상 열기"로 넘어왔는지. 주소가 아니라 navigate state 로 받는다 —
 * 주소 쿼리가 바뀌면 App 이 스크롤을 맨 위로 옮겨, 상세를 열고 닫을 때마다 목록 위치를 잃는다.
 * location.key 는 이 라우터 설정에서 늘 "default" 라(App 참고) 이동마다 새로 만들어지는 state 객체로 알아챈다.
 */
export function useOpenRequest(setOpenId) {
  const { state } = useLocation();
  useEffect(() => {
    const requested = Number(state?.open);
    if (Number.isSafeInteger(requested) && requested > 0) setOpenId(requested);
  }, [state]);
}
