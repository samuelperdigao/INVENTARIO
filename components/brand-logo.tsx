import type { CSSProperties } from "react";

interface BrandLogoProps {
  className?: string;
  compact?: boolean;
  light?: boolean;
  markOnly?: boolean;
  subtitle?: string;
}

export function BrandLogo({ className = "", compact = false, light = false, markOnly = false, subtitle = "Beam Blanks e Blocos" }: BrandLogoProps) {
  const classes = ["brand-logo", compact ? "brand-logo-compact" : "", light ? "brand-logo-light" : "", markOnly ? "brand-logo-mark-only" : "", className].filter(Boolean).join(" ");
  const style = { "--brand-logo-size": compact ? "38px" : "48px" } as CSSProperties;

  return (
    <span className={classes} style={style} aria-label={markOnly ? "INVENTÁRIO" : `INVENTÁRIO, ${subtitle}`}>
      <span className="brand-logo-mark" aria-hidden="true">
        <svg viewBox="0 0 72 72" role="presentation" focusable="false">
          <path className="brand-logo-beam" d="M9 8h54v12H42v32h21v12H9V52h21V20H9z" />
          <path className="brand-logo-highlight" d="M15 14h29v4H15zM15 54h18v4H15z" />
          <path className="brand-logo-check" d="m34 39 7 7 17-20" />
        </svg>
      </span>
      {!markOnly ? <span className="brand-logo-copy"><strong>INVENTÁRIO</strong><small>{subtitle}</small></span> : null}
    </span>
  );
}
