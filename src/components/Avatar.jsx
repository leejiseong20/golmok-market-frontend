import { useState } from "react";
import styles from "./Avatar.module.css";

/**
 * 프로필 사진. 사진이 없거나 불러오지 못하면 닉네임 첫 글자를 보여준다.
 *
 * 마이페이지·이웃 프로필·프로필 수정·채팅·상품 판매자·후기 작성자가 모두 같은 규칙을 쓰도록 한곳에 둔다.
 * 실패한 주소를 기억해 두므로, 사진을 바꾸면(주소가 달라지면) 다시 시도한다.
 * 옆에 닉네임이 항상 함께 보이므로 보조기기에는 읽히지 않게 둔다(aria-hidden).
 */
export default function Avatar({ url, name, size = 40 }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const showImage = url && failedUrl !== url;
  return <span className={styles.avatar} aria-hidden="true"
    style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>
    {showImage
      ? <img src={url} alt="" loading="lazy" onError={() => setFailedUrl(url)} />
      : (name ?? "").slice(0, 1)}
  </span>;
}
