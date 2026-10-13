import type { KaraokeSummaryDTO } from "@djgabo/shared";
import { publicKaraokeDisplay } from "./publicCatalogPresentation";

export function alphabeticalCollection(groups: Array<[string, KaraokeSummaryDTO[]]>) {
  return groups.flatMap(([folder,karaokes])=>karaokes.map(karaoke=>({folder,karaoke})))
    .sort((a,b)=>
      publicKaraokeDisplay(a.karaoke).title.localeCompare(publicKaraokeDisplay(b.karaoke).title,"es",{sensitivity:"base",numeric:true}) ||
      publicKaraokeDisplay(a.karaoke).artist.localeCompare(publicKaraokeDisplay(b.karaoke).artist,"es",{sensitivity:"base",numeric:true}) ||
      a.karaoke.code.localeCompare(b.karaoke.code,"es",{numeric:true})
    );
}
