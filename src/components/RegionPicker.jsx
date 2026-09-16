import { useEffect, useRef, useState } from "react";
import { nearbyRegions, searchRegions } from "../api/regionApi.js";
import Modal from "./Modal.jsx";
import styles from "./Modal.module.css";

export default function RegionPicker({ onSelect, onClose }) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const controller = useRef(null);
  useEffect(() => () => { sequence.current++; controller.current?.abort(); }, []);

  async function load(nearby) {
    const requestId = ++sequence.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setResults(null);
    try {
      let rows;
      if (nearby) {
        if (!navigator.geolocation) throw new Error("이 브라우저에서는 위치를 확인할 수 없습니다. 동네 이름으로 검색해 주세요.");
        const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, maximumAge: 60000 }));
        if (requestId !== sequence.current) return;
        rows = await nearbyRegions(position.coords.latitude, position.coords.longitude, abort.signal);
      } else rows = await searchRegions(keyword.trim(), abort.signal);
      if (requestId === sequence.current) setResults(rows);
    } catch (failure) {
      if (requestId !== sequence.current || failure.name === "AbortError") return;
      setError(typeof failure.code === "number" ? "위치를 확인하지 못했습니다. 위치 권한을 확인하거나 동네 이름으로 검색해 주세요." : failure.message);
    } finally { if (requestId === sequence.current) setBusy(false); }
  }
  return <Modal title="동네 선택" onClose={onClose}>
    <p className={styles.note}>선택한 동네의 상품을 보여드려요.</p>
    <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (keyword.trim()) load(false); }}>
      <label className={styles.field}>동네 이름
        <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="예: 역삼동, 강남구" maxLength={82} required />
      </label>
      <button className={styles.primary} disabled={!keyword.trim() || busy}>동네 검색</button>
    </form>
    <div className={styles.actions}><button className={styles.secondary} onClick={() => load(true)} disabled={busy}>현재 위치로 찾기</button></div>
    {busy && <p className={styles.note} role="status">동네를 찾고 있어요…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {results?.length === 0 && <p className={styles.note} role="status">검색된 동네가 없습니다. 다른 이름으로 찾아보세요.</p>}
    <ul className={styles.results}>{results?.map((region) => <li key={region.id}>
      <button onClick={() => onSelect(region)}><strong>{region.dong}</strong><small>{region.fullName}</small></button>
    </li>)}</ul>
  </Modal>;
}
