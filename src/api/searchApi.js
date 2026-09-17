import { client } from "./client.js";

/** 최근 24시간 인기 검색어 TOP 5. 서버가 1분 동안 결과를 기억한다. 로그인하지 않아도 된다. */
export const fetchPopularKeywords = (signal) => client.request("/search/keywords/popular", { signal });
