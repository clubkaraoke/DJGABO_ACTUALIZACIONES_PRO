/**
 * CONVENCIÓN DE PREVIEWS (V1)
 * ===========================
 * El StorageIndexerService NUNCA usa el master completo como preview: si no
 * hay un archivo de preview explícito, el karaoke queda sin preview
 * (previewAssetId = null) y el cliente simplemente no ve el botón "▶
 * Preview" habilitado.
 *
 * Para que un karaoke tenga preview, sube un archivo corto (recomendado:
 * 30-60s, mismo nombre que el master) en una subcarpeta `_PREVIEWS` dentro
 * del mismo mes:
 *
 *   /ACTUALIZACIONES/2026/09 SEPTIEMBRE/GRUPO 5 - MOTOR Y MOTIVO.mp4                 (master)
 *   /ACTUALIZACIONES/2026/09 SEPTIEMBRE/_PREVIEWS/GRUPO 5 - MOTOR Y MOTIVO.mp4        (preview)
 *
 * Ventajas de esta convención sobre usar un ID/hash como nombre:
 *  - Es predecible para quien sube los archivos a mano (mismo nombre, solo
 *    cambia la carpeta) — no depende de calcular ningún código.
 *  - `_PREVIEWS` como subcarpeta del mes nunca se confunde con un mes o año
 *    válido (el parser de carpetas los descarta), así que el indexador no
 *    la recorre como si fuera contenido nuevo.
 *
 * V2 (futuro, no implementado): recortar automáticamente los primeros N
 * segundos del master en el propio StorageProvider en vez de requerir un
 * archivo aparte — ver docs/STORAGE.md.
 */
export function resolvePreviewKey(masterStorageKey: string): string {
  const idx = masterStorageKey.lastIndexOf("/");
  const dir = masterStorageKey.slice(0, idx);
  const fileName = masterStorageKey.slice(idx + 1);
  return `${dir}/_PREVIEWS/${fileName}`;
}
