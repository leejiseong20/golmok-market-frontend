import { useSyncExternalStore } from "react";
import { toast } from "../toast.js";
import styles from "./Toaster.module.css";

/**
 * 토스트가 뜨는 자리. App 이 한 번만 그린다.
 *
 * 보조기기에는 aria-live 로 읽히고, 잠깐 뒤 사라지므로 직접 닫을 수도 있게 한다.
 * 모바일에서는 하단 메뉴 위에 뜬다(메뉴를 가리지 않는다).
 */
export default function Toaster() {
  const items = useSyncExternalStore(toast.subscribe, toast.list, toast.list);
  if (!items.length) return null;
  return <div className={styles.wrap} role="status" aria-live="polite">
    {items.map((item) => <button key={item.id} type="button" className={styles.toast + " " + styles[item.tone]}
      onClick={() => toast.dismiss(item.id)} aria-label={`${item.message} · 닫기`}>
      {item.message}
    </button>)}
  </div>;
}
