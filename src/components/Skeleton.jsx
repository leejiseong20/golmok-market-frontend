import styles from "./Skeleton.module.css";

/**
 * 불러오는 동안 보여줄 뼈대.
 *
 * "불러오고 있어요…" 한 줄만 두면 결과가 도착하는 순간 목록 높이가 갑자기 늘어 화면이 튄다.
 * 실제 카드와 같은 크기의 회색 면을 먼저 깔아 두면 자리가 유지된다.
 *
 * 보조기기에는 목록 전체를 status 하나로 알린다(회색 상자 수십 개를 읽어 주면 방해만 된다).
 */
function Block({ width, height, radius }) {
  return <span className={styles.block} style={{ width, height, borderRadius: radius }} />;
}

function Frame({ label, className, children }) {
  return <div className={className} role="status" aria-busy="true" aria-label={label}>{children}</div>;
}

/** 홈·찜·판매내역 목록. 모바일은 가로형, PC 는 세로형으로 실제 카드와 같은 배치다. */
export function ProductListSkeleton({ count = 6, label = "상품을 불러오는 중" }) {
  return <Frame label={label} className={styles.products}>
    {Array.from({ length: count }, (_, index) => <div key={index} className={styles.productCard}>
      {/* 썸네일 자리. 크기는 실제 카드와 같게 CSS 가 맞춘다. */}
      <Block />
      <div className={styles.lines}>
        <Block height={15} width="80%" />
        <Block height={19} width="45%" />
        <Block height={13} width="60%" />
      </div>
    </div>)}
  </Frame>;
}

/** 채팅 목록. 52px 썸네일 + 두 줄. */
export function ChatListSkeleton({ count = 5 }) {
  return <Frame label="채팅 목록을 불러오는 중" className={styles.rows}>
    {Array.from({ length: count }, (_, index) => <div key={index} className={styles.chatRow}>
      <Block width={52} height={52} radius="var(--radius-sm)" />
      <div className={styles.lines}>
        <Block height={14} width="35%" />
        <Block height={13} width="70%" />
      </div>
    </div>)}
  </Frame>;
}

/** 구매내역·받은 후기처럼 한 줄이 넓은 목록. */
export function BlockListSkeleton({ count = 3, height = 96, label = "불러오는 중" }) {
  return <Frame label={label} className={styles.rows}>
    {Array.from({ length: count }, (_, index) =>
      <Block key={index} height={height} radius="var(--radius)" />)}
  </Frame>;
}
