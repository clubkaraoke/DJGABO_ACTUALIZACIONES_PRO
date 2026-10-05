import { useState, type CSSProperties } from "react";

interface CoverArtProps {
  year: number;
  month: number;
  fallbackUrl?: string | null;
  alt?: string;
  className?: string;
}

const MONTH_NAMES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
] as const;

function highResolutionUrl(year: number, month: number): string | null {
  if (![2024, 2025, 2026].includes(year) || month < 1 || month > 12) return null;
  const monthName = MONTH_NAMES[month - 1]!;
  return `/covers/actualizaciones/${year}/${String(month).padStart(2, "0")}_${monthName}_${year}.webp`;
}

function spriteStyle(year: number, month: number): CSSProperties | null {
  if (![2024, 2025, 2026].includes(year) || month < 1 || month > 12) return null;

  const half = month <= 6 ? 1 : 2;
  const index = (month - 1) % 6;
  const col = index % 3;
  const row = Math.floor(index / 3);

  return {
    backgroundImage: `url("/covers/sprites/${year}_${half}.webp")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "300% 200%",
    backgroundPosition: `${col * 50}% ${row * 100}%`,
    imageRendering: "auto",
  };
}

export function CoverArt({
  year,
  month,
  fallbackUrl,
  alt = "",
  className = "",
}: CoverArtProps) {
  const [highResFailed, setHighResFailed] = useState(false);
  const highRes = highResolutionUrl(year, month);
  const style = spriteStyle(year, month);

  if (highRes && !highResFailed) {
    return (
      <img
        src={highRes}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setHighResFailed(true)}
        className={`object-cover [image-rendering:auto] ${className}`}
      />
    );
  }

  if (style) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`bg-secondary bg-no-repeat ${className}`}
        style={style}
      />
    );
  }

  if (fallbackUrl) {
    return <img src={fallbackUrl} alt={alt} loading="lazy" decoding="async" className={`object-cover ${className}`} />;
  }

  return (
    <div className={`flex items-center justify-center bg-secondary font-mono text-xs font-bold text-muted-foreground ${className}`}>
      DJGABO
    </div>
  );
}
