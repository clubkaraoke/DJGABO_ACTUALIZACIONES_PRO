import type { CollectionSummaryDTO } from "@djgabo/shared";

export function CollectionPreparingModal({collection,onClose}:{collection:CollectionSummaryDTO;onClose:()=>void}) {
  return <div role="dialog" aria-modal="true" aria-label="Actualización en preparación" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4" onClick={onClose}>
    <div className="w-full max-w-md space-y-3 rounded-xl border border-white/10 bg-card p-7 text-center shadow-2xl" onClick={e=>e.stopPropagation()}>
      <div className="text-4xl" aria-hidden>🎵</div>
      <h2 className="text-xl font-bold">¡Estamos preparando esta actualización!</h2>
      <p className="text-sm leading-6 text-muted-foreground">Estamos agregando y revisando los nuevos karaokes de {collection.title} para ofrecerte una colección completa.</p>
      <p className="text-sm font-semibold text-primary">¡Muy pronto estará disponible! Mantente atento.</p>
      <button type="button" autoFocus onClick={onClose} className="rounded-md bg-primary px-8 py-2 text-sm font-bold text-black">Entendido</button>
    </div>
  </div>;
}
