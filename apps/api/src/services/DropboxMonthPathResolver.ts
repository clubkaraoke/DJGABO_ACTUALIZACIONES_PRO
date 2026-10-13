import { hasExplicitMonthName, parseMonthFolder, parseYearFolder, type StorageProvider } from "@djgabo/storage";

/**
 * Old collection.storagePath values are not always paths accepted by the current
 * Dropbox namespace. Resolve the month through real folder entries from the
 * configured Dropbox root, never through guessed labels or a user-supplied path.
 */
export async function resolveDropboxMonthPath(
  provider: StorageProvider,
  year: number,
  month: number,
  preferredPath?: string,
  syncRoot?: string,
): Promise<string> {
  const queue: Array<{path:string;depth:number}> = [
    ...(preferredPath ? [{path:preferredPath,depth:0}] : []),
    ...(syncRoot && syncRoot!==preferredPath ? [{path:syncRoot,depth:0}] : []),
    {path:"/",depth:0},
  ];
  const seen=new Set<string>();
  let inspected=0;

  while(queue.length && inspected<300){
    const current=queue.shift()!;
    const key=current.path.toLocaleLowerCase();
    if(seen.has(key))continue;
    seen.add(key);
    let entries;
    try {
      entries=await provider.listFolder(current.path);
    } catch(err){
      if((err as {reason?:string})?.reason==="NOT_FOUND")continue;
      throw err;
    }
    inspected++;
    const segments=current.path.split("/").filter(Boolean);
    const currentYear=segments.some(segment=>parseYearFolder(segment)===year);
    if(currentYear && segments.some(segment=>hasExplicitMonthName(segment) && parseMonthFolder(segment)===month))
      return current.path;

    if(current.depth>=7)continue;
    for(const entry of entries){
      if(!entry.isFolder)continue;
      const childSegments=entry.path.split("/").filter(Boolean);
      const yearMatch=childSegments.some(segment=>parseYearFolder(segment)===year);
      const monthMatch=childSegments.some(segment=>hasExplicitMonthName(segment) && parseMonthFolder(segment)===month);
      if(yearMatch && monthMatch) return entry.path;

      // Never descend into another month. Only walk year/collection wrappers.
      const childMonth=parseMonthFolder(entry.name);
      const childYear=parseYearFolder(entry.name);
      if(childMonth!==null && hasExplicitMonthName(entry.name) && childMonth!==month)continue;
      if(childYear!==null && childYear!==year && childMonth===null)continue;
      queue.push({path:entry.path,depth:current.depth+1});
    }
  }
  throw new Error("MONTH_NOT_FOUND_IN_DROPBOX: "+year+"-"+String(month).padStart(2,"0"));
}
