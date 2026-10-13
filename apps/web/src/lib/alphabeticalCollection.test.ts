import { describe,it,expect } from "vitest";
import type { KaraokeSummaryDTO } from "@djgabo/shared";
import { alphabeticalCollection } from "./alphabeticalCollection";
const song=(id:string,title:string,artist:string)=>({id,code:id,title,artist}) as KaraokeSummaryDTO;
describe("collection A–Z view",()=>{
  it("flattens all displayed folders without losing the originating folder or modifying data",()=>{
    const groups:Array<[string,KaraokeSummaryDTO[]]>=[
      ["Top Hits 02",[song("k3","Zamba","José"),song("k2","Amor","Zoe")]],
      ["Club Karaoke",[song("k1","Árbol","Luna"),song("k4","Amor","Ana")]],
    ];
    const result=alphabeticalCollection(groups);
    expect(result.map(x=>x.karaoke.id)).toEqual(["k4","k2","k1","k3"]);
    expect(result.find(x=>x.karaoke.id==="k1")?.folder).toBe("Club Karaoke");
    expect(groups[0][1][0].title).toBe("Zamba");
  });
  it("returns an empty collection without creating physical folders",()=>{
    expect(alphabeticalCollection([])).toEqual([]);
  });
});
