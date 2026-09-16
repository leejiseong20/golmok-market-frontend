import { useEffect, useRef } from "react";
import styles from "./Modal.module.css";

export default function Modal({ title, onClose, children, busy = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return <dialog ref={ref} className={styles.dialog} aria-label={title}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className={styles.content}>
      <header className={styles.header}><h2>{title}</h2>
        <button type="button" onClick={onClose} disabled={busy} aria-label="닫기">×</button>
      </header>
      {children}
    </div>
  </dialog>;
}
