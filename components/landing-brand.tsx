import styles from "@/app/landing.module.css";

export function LandingBrand() {
  return (
    <div className={styles.brandFallback} aria-label="INVENTÁRIO">
      <span className={styles.fallbackMark} aria-hidden="true"><span /></span>
      <strong>INVENTÁRIO</strong>
    </div>
  );
}
