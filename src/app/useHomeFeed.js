import { useEffect, useRef, useState } from "react";
import { fetchProducts } from "../api/productApi.js";

const emptyFeed = { items: [], cursor: null, hasNext: false, loading: false, loadingMore: false, error: "" };

/**
 * 홈 상품 목록(커서 페이징 + 무한 스크롤).
 *
 * - 조건(동네·카테고리·정렬·검색어·사용자)이 바뀌면 처음부터 다시 부른다. 늦게 온 이전 조건의 응답은 버전으로 버린다.
 * - more() 는 다음 페이지. 이미 받은 항목과 겹치면 뺀다. 요청이 겹치지 않게 막는다(morePending).
 * - reload() 는 같은 조건으로 다시 부른다(다시 시도·차단 뒤·저장 뒤·서버가 다시 켜졌을 때).
 * - patchItems 는 목록 항목을 서버 응답으로 고친다(찜 수 등). 목록을 다시 받지 않는다.
 *
 * @param enabled 홈 화면일 때만 부른다. 다른 화면에서는 진행 중인 요청을 끊는다.
 */
export default function useHomeFeed({ enabled, region, categoryId, sort, keyword, userId }) {
  const [feed, setFeed] = useState(emptyFeed);
  const [retry, setRetry] = useState(0);
  const feedVersion = useRef(0);
  const moreController = useRef(null);
  const morePending = useRef(false);

  useEffect(() => {
    if (!enabled) return undefined;
    const version = ++feedVersion.current;
    const abort = new AbortController();
    moreController.current?.abort(); morePending.current = false;
    setFeed({ ...emptyFeed, loading: !!region });
    if (region) fetchProducts({ regionId: region.id, categoryId, sort, keyword, signal: abort.signal })
      .then((page) => {
        if (!abort.signal.aborted && version === feedVersion.current)
          setFeed({ ...emptyFeed, items: page.content, cursor: page.nextCursor, hasNext: page.hasNext });
      }).catch((error) => {
        if (!abort.signal.aborted && version === feedVersion.current) setFeed({ ...emptyFeed, error: error.message });
      });
    return () => { abort.abort(); moreController.current?.abort(); };
  }, [enabled, region?.id, categoryId, sort, keyword, retry, userId]);

  async function more() {
    if (morePending.current || feed.loading || !feed.hasNext) return;
    morePending.current = true;
    const version = feedVersion.current;
    const abort = new AbortController(); moreController.current = abort;
    setFeed((old) => ({ ...old, loadingMore: true, error: "" }));
    try {
      const page = await fetchProducts({ regionId: region.id, categoryId, sort, keyword, cursor: feed.cursor, signal: abort.signal });
      if (!abort.signal.aborted && version === feedVersion.current) setFeed((old) => {
        const known = new Set(old.items.map((item) => item.id));
        return { ...old, items: [...old.items, ...page.content.filter((item) => !known.has(item.id))],
          cursor: page.nextCursor, hasNext: page.hasNext, loadingMore: false };
      });
    } catch (error) {
      if (!abort.signal.aborted && version === feedVersion.current) setFeed((old) => ({ ...old, error: error.message, loadingMore: false }));
    } finally { if (version === feedVersion.current) morePending.current = false; }
  }

  return {
    feed,
    more,
    reload: () => setRetry((value) => value + 1),
    patchItems: (apply) => setFeed((old) => ({ ...old, items: old.items.map(apply) })),
  };
}
