import { useState } from "react";
import { Link } from "react-router-dom";
import type { CollectionSummaryDTO } from "@djgabo/shared";
import { Button } from "./primitives";
import { BatchDownloadModal } from "./BatchDownloadModal";

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

export function CollectionCard({ collection }: { collection: CollectionSummaryDTO }) {
  const [downloading, setDownloading] = useState(false);

  if (collection.locked) {
    return (
      <div className="group relative overflow-hidden rounded-lg border border-graphite-border bg-graphite">
        <div className="aspect-video w-full bg-graphite-elevated">
          {collection.coverUrl && (
            <img src={collection.coverUrl} alt="" className="h-full w-full object-cover opacity-20 grayscale" />
          )}
        </div>
        <div className="p-4">
          <p className="font-display text-base font-semibold text-ink-secondary">{collection.title}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-tertiary">
            <span aria-hidden>🔒</span> No incluido en tu membresía
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="group overflow-hidden rounded-lg border border-graphite-border bg-graphite transition-colors hover:border-accent/40">
      <Link to={`/colecciones/${collection.id}`} className="block">
        <div className="relative aspect-video w-full overflow-hidden bg-graphite-elevated">
          {collection.coverUrl && (
            <img
              src={collection.coverUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-carbon/90 via-carbon/10 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4">
            <p className="font-display text-lg font-bold text-ink drop-shadow">{collection.title}</p>
            <p className="text-xs text-ink-secondary">
              {collection.karaokeCount} karaokes · Actualizado {formatShortDate(collection.updatedAt)}
            </p>
          </div>
        </div>
      </Link>
      <div className="flex gap-2 p-3">
        <Link to={`/colecciones/${collection.id}`} className="flex-1">
          <Button variant="secondary" className="w-full">
            Abrir
          </Button>
        </Link>
        <Button variant="primary" className="flex-1" onClick={() => setDownloading(true)}>
          Descargar todo
        </Button>
      </div>

      {downloading && (
        <BatchDownloadModal collectionId={collection.id} title={collection.title} onClose={() => setDownloading(false)} />
      )}
    </div>
  );
}
