"use client";

import Image from "next/image";
import { useState } from "react";

import styles from "@/app/landing.module.css";

export function LandingBrand() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={styles.brandFallback} aria-label="INVENTÁRIO">
        <span className={styles.fallbackMark} aria-hidden="true">
          <span />
        </span>
        <strong>INVENTÁRIO</strong>
      </div>
    );
  }

  return (
    <Image
      className={styles.brandImage}
      src="/brand/inventario-banner.png"
      alt="INVENTÁRIO"
      width={1400}
      height={360}
      priority
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}
