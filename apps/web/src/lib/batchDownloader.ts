export interface BatchFileInput {
  karaokeId?: string;
  title: string;
  artist: string;
  url: string;
  size: number;
  /** Nombre real del archivo (con su extensión real: .mp4, .mp3, .wav, .zip...) — nunca se inventa aquí. */
  fileName: string;
  mimeType: string;
}

export interface BatchProgress {
  bytesDone: number;
  totalBytes: number;
  filesDone: number;
  totalFiles: number;
  speedBps: number;
  currentFileTitle?: string;
}

export interface BatchDownloadHandle {
  cancel: () => void;
}

export interface BatchDownloadCallbacks {
  onProgress: (progress: BatchProgress) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

function saveBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revocamos en el siguiente tick: algunos navegadores necesitan que la URL
  // siga viva un instante después del click para iniciar la descarga.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

/**
 * DESCARGA MÚLTIPLE REAL (punto 2)
 * =================================
 * Cuando las URLs son http(s) (StorageProvider real, ej. Dropbox), se
 * descarga cada archivo con `fetch` + `ReadableStream`, acumulando bytes
 * REALES leídos (no un temporizador simulado) para reportar progreso, y se
 * guarda con un Blob al terminar. Es secuencial (un archivo a la vez): más
 * simple y predecible que paralelizar, a costa de no aprovechar todo el
 * ancho de banda posible — una optimización razonable para V2.
 *
 * Con MockStorageProvider las URLs son "mock://..." y no son fetcheables de
 * verdad (no existe tal esquema), así que se simula el progreso con una
 * velocidad aleatoria — se usa runDemoBatchDownload para ese caso.
 */
export function runRealBatchDownload(
  files: BatchFileInput[],
  totalBytes: number,
  callbacks: BatchDownloadCallbacks,
): BatchDownloadHandle {
  const controller = new AbortController();
  let cancelled = false;

  (async () => {
    let bytesDone = 0;
    let filesDone = 0;
    let lastTick = performance.now();
    let bytesAtLastTick = 0;

    for (const file of files) {
      if (cancelled) return;
      try {
        const res = await fetch(file.url, { signal: controller.signal });
        if (!res.ok || !res.body) {
          throw new Error(`No se pudo descargar "${file.title}" (HTTP ${res.status})`);
        }

        const reader = res.body.getReader();
        const chunks: BlobPart[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (cancelled) {
            await reader.cancel();
            return;
          }
          if (value) {
            chunks.push(value);
            bytesDone += value.byteLength;

            const now = performance.now();
            if (now - lastTick >= 200) {
              const speedBps = ((bytesDone - bytesAtLastTick) / (now - lastTick)) * 1000;
              lastTick = now;
              bytesAtLastTick = bytesDone;
              callbacks.onProgress({ bytesDone, totalBytes, filesDone, totalFiles: files.length, speedBps, currentFileTitle: file.title });
            }
          }
        }

        saveBlob(new Blob(chunks, { type: file.mimeType }), file.fileName);
        filesDone++;
        callbacks.onProgress({ bytesDone, totalBytes, filesDone, totalFiles: files.length, speedBps: 0, currentFileTitle: file.title });
      } catch (err) {
        if (cancelled) return;
        callbacks.onError(err instanceof Error ? err.message : "Error al descargar el archivo");
        return;
      }
    }
    if (!cancelled) callbacks.onDone();
  })();

  return {
    cancel: () => {
      cancelled = true;
      controller.abort();
    },
  };
}

/**
 * Modo demo: MockStorageProvider no tiene archivos reales que transferir,
 * así que se simula una velocidad de descarga plausible. Se usa exactamente
 * la misma forma de callbacks que el modo real para que el componente que
 * los consume no tenga que distinguir un modo del otro.
 */
export function runDemoBatchDownload(totalFiles: number, totalBytes: number, callbacks: BatchDownloadCallbacks): BatchDownloadHandle {
  let cancelled = false;
  let bytesDone = 0;

  const interval = setInterval(() => {
    if (cancelled) return;
    const speedBps = 8_000_000 + Math.random() * 6_000_000; // 8-14 MB/s simulados
    bytesDone = Math.min(totalBytes, bytesDone + speedBps * 0.25);
    const filesDone = Math.min(totalFiles, Math.floor((bytesDone / totalBytes) * totalFiles));
    callbacks.onProgress({ bytesDone, totalBytes, filesDone, totalFiles, speedBps });
    if (bytesDone >= totalBytes) {
      clearInterval(interval);
      callbacks.onDone();
    }
  }, 250);

  return {
    cancel: () => {
      cancelled = true;
      clearInterval(interval);
    },
  };
}
