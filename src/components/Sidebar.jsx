import PopularKeywords from "./PopularKeywords.jsx";
import styles from "./Sidebar.module.css";

/** PC 오른쪽 기둥. 위에서부터 행동 유도 → 기능 → 읽을거리 순으로 무게를 낮춘다. */
export default function Sidebar({ onRegionClick, onKeyword }) {
  return <aside className={styles.aside}><div className={styles.sticky}>
    <div className={styles.promo}><h2 className={styles.promoH2}>가까운 이웃의 물건을 찾아보세요</h2>
      <p className={styles.promoP}>동네를 선택하고 필요한 물건을 검색해 보세요. 카테고리와 가격순 정렬로 더 쉽게 찾을 수 있어요.</p>
      <button className="btn btn-primary btn-block" onClick={onRegionClick}>동네 선택하기</button>
    </div>
    <div className={styles.panel}><PopularKeywords variant="list" onSelect={onKeyword} /></div>
    <div className={styles.plain}><h2 className={styles.h2}>거래 전 확인하세요</h2>
      <ul className={styles.tips}><li>직거래는 사람이 많은 공공장소에서 만나세요.</li>
        <li>물건의 상태와 구성품을 꼼꼼히 확인하세요.</li><li>개인정보와 인증번호는 공유하지 마세요.</li></ul>
    </div>
  </div></aside>;
}
