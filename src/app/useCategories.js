import { useEffect, useState } from "react";
import { fetchCategories } from "../api/productApi.js";

/** 카테고리 목록. 로그인 사용자가 바뀌면 다시 부른다. retry 는 "카테고리 다시 시도"·서버 복구 때 쓴다. */
export default function useCategories(userId) {
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    setError("");
    fetchCategories(abort.signal).then((rows) => { if (!abort.signal.aborted) setCategories(rows); })
      .catch((failure) => { if (!abort.signal.aborted) setError(failure.message); });
    return () => abort.abort();
  }, [retry, userId]);

  return { categories, error, retry: () => setRetry((value) => value + 1) };
}
