import styles from "./CategoryBar.module.css";
export default function CategoryBar({ categories, value, onChange }) {
  return <div className={styles.row} aria-label="상품 카테고리">
    <button className={styles.chip + (value === null ? " " + styles.on : "")} aria-pressed={value === null} onClick={() => onChange(null)}>전체</button>
    {categories.map((category) => <button key={category.id} className={styles.chip + (value === category.id ? " " + styles.on : "")}
      aria-pressed={value === category.id} onClick={() => onChange(category.id)}>{category.name}</button>)}
  </div>;
}
