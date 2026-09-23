import { useEffect, useState } from "react";
import { fetchMe } from "../api/userApi.js";

/**
 * 관리자 여부. admin 은 null(아직 모름) · true · false. 세션에는 역할이 없어 내 정보의 admin 으로 읽는다.
 * 헤더 버튼과 관리자 틀을 고르는 데만 쓴다. 실제 차단은 서버가 하고, 관리자 API 가 404 면 deny() 로 denied 가 켜진다.
 */
export default function useAdminAccess(userId) {
  const [admin, setAdmin] = useState(null);
  const [denied, setDenied] = useState(false);

  // 계정이 바뀌면 관리자 여부를 새로 묻는다. 실패하면 관리자가 아닌 것으로 본다(버튼이 안 보일 뿐 기능은 그대로다).
  useEffect(() => {
    setDenied(false);
    if (!userId) { setAdmin(false); return undefined; }
    const abort = new AbortController();
    setAdmin(null);
    fetchMe(abort.signal).then((me) => { if (!abort.signal.aborted) setAdmin(me?.admin === true); })
      .catch(() => { if (!abort.signal.aborted) setAdmin(false); });
    return () => abort.abort();
  }, [userId]);

  return { admin, denied, deny: () => setDenied(true) };
}
