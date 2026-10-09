import type { KaraokeSummaryDTO } from "@djgabo/shared";
import { publicKaraokeTypes, type PublicKaraokeType } from "../lib/publicCatalogPresentation";

const TYPE_STYLES: Record<PublicKaraokeType, string> = {
  Karaoke: "bg-[#303036] text-white",
  Coro: "bg-[#FACC15] text-[#171717]",
  "En vivo": "bg-[#7C4DFF] text-white",
  "Live Session": "bg-[#7C4DFF] text-white",
};

/** Compact square-ish pills inspired by kitkaraoke.com. */
export function KaraokeTypeBadges({ karaoke }: { karaoke: Pick<KaraokeSummaryDTO, "title"> }) {
  const types = publicKaraokeTypes(karaoke);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1" aria-label="Tipo de karaoke">
      {types.map((type) => (
        <span
          key={type}
          className={`inline-flex shrink-0 items-center rounded-[4px] px-[7px] py-[2px] text-[10px] font-semibold leading-[15px] ${TYPE_STYLES[type]}`}
        >
          {type}
        </span>
      ))}
    </span>
  );
}

