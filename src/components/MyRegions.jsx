import { useState } from "react";
import { deleteMyRegion, markPrimaryRegion, verifyMyRegion } from "../api/userApi.js";
import styles from "./MyRegions.module.css";

const MAX_REGIONS = 2;

/**
 * 내 동네 관리. 인증은 브라우저 위치로만 한다.
 *
 * 동네 이름을 골라서 인증하게 하면 "가보지도 않은 동네"를 등록할 수 있어
 * 동네 인증이라는 장치 자체가 의미를 잃는다. 둘러보기용 동네 선택(RegionPicker)과 다른 이유다.
 */
export default function MyRegions({ regions, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      onChange(await action());
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function verify() {
    if (busy) return;
    if (!navigator.geolocation) {
      setError("이 브라우저에서는 위치를 확인할 수 없어요.");
      return;
    }
    setBusy(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          onChange(await verifyMyRegion(position.coords.latitude, position.coords.longitude));
        } catch (failure) {
          setError(failure.message);
        } finally {
          setBusy(false);
        }
      },
      () => {
        setError("위치를 확인하지 못했어요. 위치 권한을 허용해 주세요.");
        setBusy(false);
      },
      { timeout: 10000, maximumAge: 60000 });
  }

  return <section className={styles.panel} aria-label="내 동네">
    <div className={styles.head}>
      <h2 className={styles.h2}>내 동네</h2>
      <span className={styles.count}>{regions.length} / {MAX_REGIONS}</span>
    </div>

    {regions.length === 0
      ? <p className={styles.empty}>아직 인증한 동네가 없어요. 현재 위치로 동네를 인증해 보세요.</p>
      : <ul className={styles.list}>
          {regions.map((region) => <li key={region.id} className={styles.item}>
            <span className={styles.name}>
              {region.name}
              {region.isPrimary && <span className={styles.badge}>대표</span>}
            </span>
            <span className={styles.verify}>인증 {region.verifyCount}회</span>
            <span className={styles.buttons}>
              {!region.isPrimary && <button type="button" disabled={busy}
                onClick={() => run(() => markPrimaryRegion(region.id))}>대표로</button>}
              <button type="button" disabled={busy}
                onClick={() => run(() => deleteMyRegion(region.id))}>삭제</button>
            </span>
          </li>)}
        </ul>}

    {error && <p className={styles.error} role="alert">{error}</p>}

    <button type="button" className={styles.primary} onClick={verify}
      disabled={busy || regions.length >= MAX_REGIONS}>
      {busy ? "처리 중…" : "현재 위치로 동네 인증"}
    </button>
    {regions.length >= MAX_REGIONS &&
      <p className={styles.note}>동네는 최대 {MAX_REGIONS}개까지 인증할 수 있어요. 바꾸려면 하나를 삭제해 주세요.</p>}
  </section>;
}
