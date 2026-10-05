import { useMemo, useState } from "react";

interface CoverArtProps {
  year: number;
  month: number;
  fallbackUrl?: string | null;
  alt?: string;
  className?: string;
}

const MONTH_NAMES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];

function buildCoverUrl(year: number, month: number): string | null {
  if (![2024, 2025, 2026].includes(year) || month < 1 || month > 12) return null;
  const mm = String(month).padStart(2, "0");
  const monthName = MONTH_NAMES[month - 1];
  return `/covers/actualizaciones/${year}/${mm}_${monthName}_${year}.webp`;
}

export function CoverArt({
  year,
  month,
  fallbackUrl,
  alt = "",
  className = "",
}: CoverArtProps) {
  const coverUrl = useMemo(() => buildCoverUrl(year, month), [year, month]);
  const [failed, setFailed] = useState(false);

  if (coverUrl && !failed) {
    return (
      <img
        src={coverUrl}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`object-cover ${className}`}
      />
    );
  }

  if (fallbackUrl) {
    return (
      <img
        src={fallbackUrl}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={`object-cover ${className}`}
      />
    );
  }

  return (
    <div className={`flex items-center justify-center bg-secondary font-mono text-xs font-bold text-muted-foreground ${className}`}>
      DJGABO
    </div>
  );
}
