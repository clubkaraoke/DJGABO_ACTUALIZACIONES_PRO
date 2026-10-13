import { describe,it,expect } from "vitest";
import { MockStorageProvider } from "@djgabo/storage";
import { resolveDropboxMonthPath } from "../src/services/DropboxMonthPathResolver.js";

describe("find a month from the actual Dropbox folder hierarchy",()=>{
  it("falls back from an old missing path to the real 2026 September directory",async()=>{
    const mock=new MockStorageProvider();
    const actual="/CATALOGO/3.- Coleccion Karaoke Hits/15.- Hits Karaoke 2026/09_SEPTIEMBRE_2026";
    mock.seedFile(actual+"/01_Club_Karaoke/ARTISTA - TITULO.wav",{providerFileId:"id:123"});
    mock.seedFile("/CATALOGO/3.- Coleccion Karaoke Hits/15.- Hits Karaoke 2026/08_AGOSTO_2026/01_Club_Karaoke/OTRO.wav");
    const orig=mock.listFolder.bind(mock);
    mock.listFolder=async path=>{
      if(path==="/15.- Hits Karaoke 2026/09_SEPTIEMBRE_2026" || path==="/wrong/year")throw Object.assign(new Error("not_found"),{reason:"NOT_FOUND"});
      return orig(path);
    };
    const resolved=await resolveDropboxMonthPath(mock,2026,9,
      "/15.- Hits Karaoke 2026/09_SEPTIEMBRE_2026","/wrong/year");
    expect(resolved).toBe(actual);
  });
  it("does not select another month or fabricate an empty path",async()=>{
    const mock=new MockStorageProvider();
    mock.seedFile("/ROOT/15.- Hits Karaoke 2026/08_AGOSTO_2026/song.wav");
    await expect(resolveDropboxMonthPath(mock,2026,9,undefined,"/ROOT")).rejects.toThrow("MONTH_NOT_FOUND_IN_DROPBOX");
  });
});
