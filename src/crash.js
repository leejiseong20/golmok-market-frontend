/**
 * 화면을 그리다 난 오류(오류 경계가 잡은 것)를 종류로 나눈다.
 *
 * 나눠 불러오는 파일(관리자 화면 등)을 받지 못한 오류는 "다시 시도"로 풀리지 않는다.
 * 배포하면 파일 이름이 바뀌어, 예전 화면을 켜 둔 사람은 없는 파일을 계속 찾기 때문이다. 새로고침만이 답이다.
 * 브라우저마다 문구가 달라 알려진 문구로 가른다.
 */
const CHUNK_MESSAGES = [
  "Failed to fetch dynamically imported module", // Chrome·Edge
  "error loading dynamically imported module", // Firefox
  "Importing a module script failed", // Safari
  "Unable to preload CSS", // Vite 가 나눠진 CSS 를 받지 못했을 때
];

export function isChunkLoadError(error) {
  if (!error) return false;
  if (error.name === "ChunkLoadError") return true;
  const message = String(error.message ?? error);
  return CHUNK_MESSAGES.some((text) => message.includes(text));
}
