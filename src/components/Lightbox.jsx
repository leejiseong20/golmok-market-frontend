import { useEffect, useRef } from "react";
import styles from "./Lightbox.module.css";

/**
 * 사진 크게 보기.
 *
 * 상세 모달 안에서는 사진이 작아 상태를 확인하기 어렵다(중고거래에서 사진은 설명만큼 중요하다).
 * 화면 전체를 쓰고, 사진 비율은 그대로 두며(잘라내지 않는다) 좌우로 넘긴다.
 *
 * 상세 모달 위에 다시 dialog 를 띄운다. 브라우저가 최상위 레이어로 올려 주므로 초점 가둠과 ESC 가 그대로 동작한다.
 * 사진 목록과 현재 위치는 상세가 들고 있는 값을 그대로 쓴다(닫으면 보던 사진이 상세에도 남는다).
 */
export default function Lightbox({ images, index, onMove, onClose, title }) {
  const ref = useRef(null);
  const image = images[index];

  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  function onKeyDown(event) {
    if (event.key === "ArrowLeft" && index > 0) onMove(index - 1);
    if (event.key === "ArrowRight" && index < images.length - 1) onMove(index + 1);
  }

  return <dialog ref={ref} className={styles.dialog} aria-label={`${title} 사진 크게 보기`}
    onKeyDown={onKeyDown}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <img className={styles.image} src={image.imageUrl} alt={`${title} 사진 ${index + 1}`} />
    <button type="button" className={styles.close} onClick={onClose} aria-label="크게 보기 닫기">×</button>
    {images.length > 1 && <>
      <button type="button" className={styles.prev} onClick={() => onMove(index - 1)}
        disabled={index === 0} aria-label="이전 사진">←</button>
      <button type="button" className={styles.next} onClick={() => onMove(index + 1)}
        disabled={index === images.length - 1} aria-label="다음 사진">→</button>
      <p className={styles.count}>{index + 1} / {images.length}</p>
    </>}
  </dialog>;
}
