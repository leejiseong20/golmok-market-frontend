import { useEffect, useRef, useState } from "react";
import { fetchProduct } from "../api/productApi.js";

/** 상세 응답을 기억해 둘 기록 수. 뒤로가기로 돌아온 상세를 다시 요청(조회수 증가)하지 않기 위한 것이라 많을 필요가 없다. */
const DETAIL_CACHE_SIZE = 30;

/**
 * 상품 상세. 주소가 곧 "상세 열기"라 effect 에서 불러올 수밖에 없는데, 상세 조회는 조회수를 올린다.
 * 같은 기록 항목(location.key)의 요청은 한 번만 보내고 결과를 기억한다.
 * - StrictMode 가 effect 를 두 번 실행해도 두 번째는 첫 요청을 기다린다(그래서 요청을 abort 하지 않는다).
 * - 프로필을 열었다가 뒤로가기로 돌아온 상세도 다시 세지 않는다.
 * 다른 곳에 갔다가 새로 들어오면 새 기록 항목이라 새 조회로 센다. 실패한 응답은 기억하지 않는다(다시 시도 가능).
 *
 * @param onUserChanged 로그인 사용자가 바뀌었을 때 App 이 할 일(열린 등록·수정 창 닫기)
 */
export default function useProductDetail({ productId, location, userId, onUserChanged }) {
  const [detail, setDetail] = useState(null);
  const [detailRetry, setDetailRetry] = useState(0);
  const detailCache = useRef(new Map());
  // 상세를 받아 둔 사용자. 처음 값을 현재 사용자로 둬야 새로고침 직후(세션 복원)를 "사용자 변경"으로 오인해 상세를 두 번 받지 않는다.
  const detailUserId = useRef(userId ?? null);

  useEffect(() => {
    if (!productId) { setDetail(null); return undefined; }
    const key = `${location.key}:${productId}`;
    const cache = detailCache.current;
    let entry = cache.get(key);
    if (!entry) {
      const initial = location.state?.product;
      entry = { promise: initial?.id === productId ? Promise.resolve(initial) : fetchProduct(productId) };
      cache.set(key, entry);
      if (cache.size > DETAIL_CACHE_SIZE) cache.delete(cache.keys().next().value);
    }
    let active = true;
    setDetail({ key, id: productId, loading: true, data: null, error: "" });
    entry.promise
      .then((data) => { if (active) setDetail({ key, id: productId, loading: false, data, error: "" }); })
      .catch((error) => {
        if (cache.get(key) === entry) cache.delete(key);
        if (active) setDetail({ key, id: productId, loading: false, data: null, error: error.message });
      });
    return () => { active = false; };
  }, [productId, location.key, detailRetry]);

  // 사용자가 바뀌면(로그인·로그아웃) 이전 사용자 기준의 상세(isLiked·isMine)를 다시 받아야 한다.
  useEffect(() => {
    if (detailUserId.current === (userId ?? null)) return;
    detailUserId.current = userId ?? null;
    onUserChanged();
    detailCache.current.clear();
    setDetailRetry((value) => value + 1);
  }, [userId]);

  /** 열린 상세를 서버 응답으로 바꾸고, 기억해 둔 응답도 같이 바꾼다(뒤로가기로 돌아와도 최신 값). */
  function patch(mapper) {
    setDetail((old) => {
      if (!old?.data) return old;
      const data = mapper(old.data);
      const entry = detailCache.current.get(old.key);
      if (entry) entry.promise = Promise.resolve(data);
      return { ...old, data };
    });
  }

  return { detail, retry: () => setDetailRetry((value) => value + 1), patch };
}
