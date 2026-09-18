/**
 * 목록용 축소본 주소.
 *
 * 목록 카드의 사진은 화면에서 100~400px 인데 원본(수 MB)을 그대로 내려받고 있었다.
 * 서버가 업로드 때 축소본을 만들어 두고, 없으면(webp · 이미 작은 사진 · 기능 도입 전 사진)
 * 같은 주소로 원본을 대신 내려준다. 화면은 실패를 다룰 필요가 없다.
 *
 * 데모의 외부 사진(picsum 등)은 우리 서버 파일이 아니라 그대로 쓴다.
 */
const PREFIX = "/api/images/";

const THUMBNAIL_PREFIX = PREFIX + "thumb/";

export function thumbnailUrl(url) {
  if (typeof url !== "string" || !url.startsWith(PREFIX)) return url;
  // 이미 축소본 주소면 그대로 둔다(두 번 감싸면 없는 경로가 된다).
  if (url.startsWith(THUMBNAIL_PREFIX)) return url;
  return THUMBNAIL_PREFIX + url.slice(PREFIX.length);
}
