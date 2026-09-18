import { useEffect, useRef, useState } from "react";
import { nearbyRegions, searchRegions } from "../api/regionApi.js";
import Modal from "./Modal.jsx";
import styles from "./Modal.module.css";

/**
 * 위치 실패 사유별 안내. 브라우저가 주는 code 는 1=권한 거부, 2=위치 못 잡음, 3=시간 초과다.
 * iOS 는 시스템 설정에서 브라우저 앱의 위치 접근이 꺼져 있으면 묻지도 않고 1 로 거부한다.
 */
function locationError(failure) {
  if (failure.code === 1) {
    return "위치 권한이 거부됐어요. 브라우저 주소창의 자물쇠에서 위치를 허용하거나, 휴대폰 설정에서 이 브라우저의 위치 접근을 켜 주세요. 동네 이름으로 검색해도 됩니다.";
  }
  if (failure.code === 3) {
    return "위치를 찾는 데 너무 오래 걸렸어요. 실내라면 창가에서 다시 시도하거나 동네 이름으로 검색해 주세요.";
  }
  return "지금은 위치를 확인할 수 없어요. 잠시 뒤 다시 시도하거나 동네 이름으로 검색해 주세요.";
}

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
        // 정확한 좌표까지는 필요 없다(동네 단위). 대략 위치를 빨리 받고, 느린 기기를 위해 15초까지 기다린다.
        const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
          resolve, reject, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }));
        if (requestId !== sequence.current) return;
        rows = await nearbyRegions(position.coords.latitude, position.coords.longitude, abort.signal);
      } else rows = await searchRegions(keyword.trim(), abort.signal);
      if (requestId === sequence.current) setResults(rows);
    } catch (failure) {
      if (requestId !== sequence.current || failure.name === "AbortError") return;
      setError(typeof failure.code === "number" ? locationError(failure) : failure.message);
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
