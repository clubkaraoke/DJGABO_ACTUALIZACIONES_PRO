import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { CollectionDetailDTO, CollectionSummaryDTO } from "@djgabo/shared";
import { api } from "../lib/apiClient";
import { ClientPortalShell } from "../components/ClientPortalShell";
import { BatchDownloadModal } from "../components/BatchDownloadModal";
import { EmptyState, Skeleton } from "../components/primitives";

const RICH_CATALOG_START_YEAR = 2024;

function formatDate(iso: string | null): string {
  if (!iso) return "Sin fecha";
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function formatCompactDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

function sortCollections(a: CollectionSummaryDTO, b: CollectionSummaryDTO): number {
  if (a.year !== b.year) return b.year - a.year;
  if (a.month !== b.month) return b.month - a.month;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function matchesSearch(collection: CollectionSummaryDTO, q: string): boolean {
  if (!q) return true;
  return [collection.title, collection.description ?? "", String(collection.year)].some((value) => value.toLowerCase().includes(q));
}

export default function HomePage() {
  const [search, setSearch] = useState("");
  const [downloadCollection, setDownloadCollection] = useState<CollectionSummaryDTO | null>(null);

  const { data: collectionsData, isLoading, isError } = useQuery({
    queryKey: ["collections"],
    queryFn: () => api.get<CollectionSummaryDTO[]>("/collections"),
  });

  const sorted = useMemo(() => [...(collectionsData ?? [])].sort(sortCollections), [collectionsData]);
  const richCollections = useMemo(() => sorted.filter((collection) => collection.year >= RICH_CATALOG_START_YEAR), [sorted]);
  const historicalCollections = useMemo(() => sorted.filter((collection) => collection.year < RICH_CATALOG_START_YEAR), [sorted]);
  const available = useMemo(() => richCollections.filter((collection) => !collection.locked), [richCollections]);
  const latest = available[0] ?? null;
  const previous = available[1] ?? null;

  const { data: latestDetail } = useQuery({
    queryKey: ["collection", latest?.id, "home-preview"],
    queryFn: () => api.get<CollectionDetailDTO>(`/collections/${latest!.id}`),
    enabled: Boolean(latest?.id),
  });

  const q = search.trim().toLowerCase();
  const filteredRich = useMemo(() => richCollections.filter((collection) => matchesSearch(collection, q)), [q, richCollections]);
  const filteredHistorical = useMemo(() => historicalCollections.filter((collection) => matchesSearch(collection, q)), [q, historicalCollections]);

  const newestKaraokes = useMemo(() => {
    if (!latestDetail) return [];
    return [...latestDetail.karaokes]
      .sort((a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime())
      .slice(0, 6);
  }, [latestDetail]);

  const totalKaraokes = available.reduce((sum, collection) => sum + collection.karaokeCount, 0);

  return (
    <ClientPortalShell active="inicio" searchValue={search} onSearchChange={setSearch} searchPlaceholder="Buscar mes o actualización...">
      <div className="mx-auto max-w-[1500px] space-y-9">
        {isLoading && (
          <div className="space-y-6">
            <Skeleton className="h-[360px] w-full rounded-xl" />
            <div className="grid gap-4 md:grid-cols-3">
              <Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" />
            </div>
          </div>
        )}

        {isError && <EmptyState title="No pudimos cargar tus actualizaciones" description="Verifica tu conexión e intenta de nuevo." />}

        {!isLoading && collectionsData?.length === 0 && (
          <EmptyState title="Todavía no tienes actualizaciones" description="Cuando el administrador te dé acceso, aparecerán aquí." />
        )}

        {latest && (
          <>
            <section className="relative overflow-hidden rounded-2xl border border-graphite-border bg-graphite shadow-card">
              <div className="absolute inset-0">
                {latest.coverUrl && <img src={latest.coverUrl} alt="" decoding="async" className="h-full w-full object-cover opacity-35" />}
                <div className="absolute inset-0 bg-gradient-to-r from-[#0a0b0c] via-[#0a0b0c]/95 to-[#0a0b0c]/25" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0b0c]/80 via-transparent to-transparent" />
              </div>
              <div className="relative flex min-h-[360px] max-w-3xl flex-col justify-center px-6 py-10 sm:px-10 lg:px-12">
                <div className="mb-5 flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-accent px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-carbon">Última actualización</span>
                  <span className="text-xs font-medium text-ink-secondary">Disponible para tu plan</span>
                </div>
                <h1 className="font-display text-4xl font-extrabold leading-tight text-ink sm:text-5xl lg:text-6xl">{latest.title}</h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-ink-secondary sm:text-base">{latest.description ?? "Tu colección de actualización ya está lista para revisar, escuchar y descargar."}</p>
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-secondary">
                  <span><strong className="text-ink">{latest.karaokeCount}</strong> karaokes</span>
                  <span>Actualizado {formatDate(latest.updatedAt)}</span>
                  {latest.publishedAt && <span>Publicado {formatDate(latest.publishedAt)}</span>}
                </div>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link to={`/colecciones/${latest.id}`} className="inline-flex items-center justify-center rounded-lg bg-accent px-5 py-3 text-sm font-bold text-carbon transition hover:bg-accent-hover">Ver actualización <span className="ml-2">→</span></Link>
                  <button onClick={() => setDownloadCollection(latest)} className="inline-flex items-center justify-center rounded-lg border border-graphite-border bg-graphite/80 px-5 py-3 text-sm font-semibold text-ink backdrop-blur transition hover:border-accent/40 hover:bg-graphite-elevated">Descargar actualización</button>
                </div>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-graphite-border bg-graphite p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-tertiary">Actualizaciones disponibles</p>
                <p className="mt-2 font-display text-3xl font-extrabold text-ink">{available.length}</p>
                <p className="mt-1 text-xs text-ink-secondary">colecciones activas desde 2024</p>
              </div>
              <div className="rounded-xl border border-graphite-border bg-graphite p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-tertiary">Karaokes incluidos</p>
                <p className="mt-2 font-display text-3xl font-extrabold text-accent">{totalKaraokes.toLocaleString("es-PE")}</p>
                <p className="mt-1 text-xs text-ink-secondary">dentro de tus meses habilitados</p>
              </div>
              <div className="rounded-xl border border-graphite-border bg-graphite p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-tertiary">Última carga</p>
                <p className="mt-2 font-display text-xl font-extrabold text-ink">{formatCompactDate(latest.updatedAt)}</p>
                <p className="mt-1 text-xs text-ink-secondary">{latest.title}</p>
              </div>
            </section>

            <section id="nuevos" className="scroll-mt-28">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2"><h2 className="font-display text-xl font-bold text-ink">Nuevos karaokes</h2><span className="rounded-full bg-accent-soft px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-accent">Recién agregados</span></div>
                  <p className="mt-1 text-sm text-ink-secondary">Una muestra de lo más reciente dentro de {latest.title}.</p>
                </div>
                <Link to={`/colecciones/${latest.id}`} className="text-sm font-semibold text-accent hover:text-accent-hover">Ver todos →</Link>
              </div>
              {newestKaraokes.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {newestKaraokes.map((karaoke) => (
                    <Link key={karaoke.id} to={`/colecciones/${latest.id}`} className="group flex items-center gap-4 rounded-xl border border-graphite-border bg-graphite p-3 transition hover:border-accent/35 hover:bg-graphite-elevated">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-graphite-elevated">
                        {karaoke.coverUrl ? <img src={karaoke.coverUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition group-hover:scale-105" /> : <div className="flex h-full items-center justify-center font-display text-xs font-bold text-ink-tertiary">DJGABO</div>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink">{karaoke.title}</p>
                        <p className="mt-0.5 truncate text-xs text-ink-secondary">{karaoke.artist}</p>
                        <p className="mt-1 text-[11px] text-ink-tertiary">{karaoke.format ?? "Karaoke"}{karaoke.publishedAt ? ` · ${formatCompactDate(karaoke.publishedAt)}` : ""}</p>
                      </div>
                      <span className="text-ink-tertiary transition group-hover:translate-x-0.5 group-hover:text-accent">→</span>
                    </Link>
                  ))}
                </div>
              ) : <Skeleton className="h-24 w-full" />}
            </section>

            <section id="actualizaciones" className="scroll-mt-28">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold text-ink">Últimas entregas</h2>
                  <p className="mt-1 text-sm text-ink-secondary">Lo más reciente de tu suscripción, sin perder de vista la entrega anterior.</p>
                </div>
              </div>
              <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
                {[latest, previous].filter(Boolean).map((collection, index) => collection && (
                  <article key={collection.id} className="relative overflow-hidden rounded-xl border border-graphite-border bg-graphite p-5 sm:p-6">
                    <div className="absolute right-0 top-0 h-full w-2/5 opacity-25">
                      {collection.coverUrl && <img src={collection.coverUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
                      <div className="absolute inset-0 bg-gradient-to-r from-graphite to-transparent" />
                    </div>
                    <div className="relative max-w-xl">
                      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">{index === 0 ? "Entrega actual" : "Entrega anterior"}</span>
                      <h3 className="mt-2 font-display text-2xl font-bold text-ink">{collection.title}</h3>
                      <p className="mt-2 text-sm text-ink-secondary">{collection.karaokeCount} karaokes · actualizado {formatDate(collection.updatedAt)}</p>
                      <Link to={`/colecciones/${collection.id}`} className="mt-5 inline-flex text-sm font-semibold text-accent hover:text-accent-hover">Ver actualización completa →</Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        {richCollections.length > 0 && (
          <section id="historial" className="scroll-mt-28">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold text-ink">Actualizaciones 2024–2026</h2>
                <p className="mt-1 text-sm text-ink-secondary">Experiencia completa: portada, detalle, preview y descarga según tu membresía.</p>
              </div>
              {search && <span className="text-xs text-ink-tertiary">{filteredRich.length} resultados recientes para “{search}”</span>}
            </div>
            {filteredRich.length === 0 ? (
              <EmptyState title="Sin resultados recientes" description={`No encontramos una actualización 2024–2026 que coincida con "${search}".`} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filteredRich.map((collection) => (
                  <article key={collection.id} className={`group overflow-hidden rounded-xl border bg-graphite transition ${collection.locked ? "border-graphite-border opacity-65" : "border-graphite-border hover:border-accent/35"}`}>
                    <Link to={collection.locked ? "#" : `/colecciones/${collection.id}`} className="block">
                      <div className="relative aspect-[16/9] overflow-hidden bg-graphite-elevated">
                        {collection.coverUrl && <img src={collection.coverUrl} alt="" loading="lazy" decoding="async" className={`h-full w-full object-cover transition duration-300 group-hover:scale-105 ${collection.locked ? "grayscale" : ""}`} />}
                        <div className="absolute inset-0 bg-gradient-to-t from-carbon via-carbon/15 to-transparent" />
                        <div className="absolute inset-x-4 bottom-3">
                          <div className="mb-1 flex items-center gap-2">
                            {collection.locked && <span className="rounded-full bg-carbon/80 px-2 py-0.5 text-[10px] font-bold text-ink-secondary">🔒 BLOQUEADO</span>}
                          </div>
                          <h3 className="font-display text-lg font-bold text-ink">{collection.title}</h3>
                          <p className="mt-0.5 text-xs text-ink-secondary">{collection.locked ? "No incluido en tu membresía" : `${collection.karaokeCount} karaokes · ${formatCompactDate(collection.updatedAt)}`}</p>
                        </div>
                      </div>
                    </Link>
                    {!collection.locked && (
                      <div className="flex gap-2 p-3">
                        <Link to={`/colecciones/${collection.id}`} className="flex-1 rounded-lg border border-graphite-border px-3 py-2 text-center text-xs font-semibold text-ink transition hover:bg-graphite-elevated">Abrir</Link>
                        <button onClick={() => setDownloadCollection(collection)} className="flex-1 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-carbon transition hover:bg-accent-hover">Descargar</button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {historicalCollections.length > 0 && (
          <section className="pb-8">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold text-ink">Catálogo histórico</h2>
                <p className="mt-1 text-sm text-ink-secondary">Años anteriores a 2024 en vista compacta de consulta, sin tarjetas pesadas.</p>
              </div>
              {search && <span className="text-xs text-ink-tertiary">{filteredHistorical.length} resultados históricos para “{search}”</span>}
            </div>

            {filteredHistorical.length === 0 ? (
              <div className="rounded-xl border border-graphite-border bg-graphite px-5 py-4 text-sm text-ink-secondary">Sin coincidencias en el catálogo histórico.</div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-graphite-border bg-graphite">
                {filteredHistorical.map((collection, index) => (
                  <div key={collection.id} className={`flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-5 ${index > 0 ? "border-t border-graphite-border" : ""}`}>
                    <span className="w-14 shrink-0 font-display text-sm font-extrabold text-accent">{collection.year}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{collection.title}</p>
                      <p className="mt-0.5 text-xs text-ink-tertiary">Visualización histórica · {collection.karaokeCount} karaokes registrados</p>
                    </div>
                    <span className="rounded-full border border-graphite-border bg-carbon px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ink-tertiary">Listado</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {downloadCollection && <BatchDownloadModal collectionId={downloadCollection.id} title={downloadCollection.title} onClose={() => setDownloadCollection(null)} />}
    </ClientPortalShell>
  );
}
