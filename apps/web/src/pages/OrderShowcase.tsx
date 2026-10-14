import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Crown, Loader2, LogIn, Play, Video } from "lucide-react";
import type { KaraokeSummaryDTO } from "@djgabo/shared";
import { CdgDemoModal } from "../components/CdgDemoModal";
import { api } from "../lib/apiClient";
import { publicKaraokeDisplay } from "../lib/publicCatalogPresentation";
import { VISITOR_KARAOKE_PRICE_USD } from "../lib/orderWhatsApp";
import { useAuth } from "../lib/authContext";

export function OrderShowcase({ loginReturn }: { loginReturn: string }) {
  const { user } = useAuth();
  const [playing, setPlaying] = useState<KaraokeSummaryDTO | null>(null);
  const { data: recent = [], isLoading, isError } = useQuery({
    queryKey: ["home-newest-karaokes"],
    queryFn: () => api.get<KaraokeSummaryDTO[]>("/public/karaokes/search?sort=recent"),
    staleTime: 30_000,
  });
  const sample = recent.find((item) => item.demoAvailable) ?? null;
  // Configurable MP4 example; until supplied, show a real CD+G demo with a clear label.
  const sampleMp4 = import.meta.env.VITE_ORDER_SAMPLE_MP4_URL as string | undefined;

  return (
    <>
      <section aria-label="Ejemplo de karaoke" className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="overflow-hidden rounded-[14px] border border-primary/20 bg-card">
          <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-primary">Conoce nuestro trabajo</div>
              <h2 className="mt-1 text-[18px] font-extrabold">Así se ve un karaoke DJGABO</h2>
            </div>
            <span className="rounded-full border border-white/[0.1] px-2 py-1 text-[10px] text-muted-foreground">EJEMPLO</span>
          </div>
          {sampleMp4 ? (
            <video className="aspect-video w-full bg-black object-contain" src={sampleMp4} controls playsInline preload="metadata" aria-label="Video de ejemplo MP4 DJGABO" />
          ) : sample ? (
            <button type="button" onClick={() => setPlaying(sample)} className="group relative block aspect-video w-full overflow-hidden bg-gradient-to-br from-[#252015] via-[#111115] to-black text-center">
              {sample.coverUrl && <img src={sample.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25 blur-sm" />}
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-black transition group-hover:scale-110"><Play className="ml-1 h-7 w-7 fill-current" /></span>
                <span className="max-w-full truncate text-[14px] font-bold">{publicKaraokeDisplay(sample).label}</span>
                <span className="text-[11px] text-white/75">Ver demostración en el reproductor karaoke</span>
              </span>
            </button>
          ) : (
            <div className="flex aspect-video items-center justify-center gap-3 bg-black px-5 text-center text-[12px] text-muted-foreground">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Video className="h-6 w-6 text-primary" />}
              {isLoading ? "Cargando demostración..." : "El ejemplo estará disponible próximamente."}
            </div>
          )}
          <p className="px-4 py-3 text-[11px] leading-5 text-muted-foreground sm:px-5">
            {sampleMp4 ? "Ejemplo de video MP4." : "Demo real en CD+G del catálogo DJGABO. Los pedidos particulares de visitantes se entregan en MP4."}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-[14px] border border-white/[0.08] bg-card p-4 sm:p-5">
            <div className="flex items-center gap-2"><Video className="h-4 w-4 text-primary" /><h3 className="text-[14px] font-bold">Soy visitante</h3></div>
            <div className="mt-2 flex items-baseline gap-2">
              <strong className="font-mono text-[30px] font-black">{"US$" + VISITOR_KARAOKE_PRICE_USD}</strong>
              <span className="text-[11px] text-muted-foreground">por karaoke</span>
            </div>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">Video karaoke MP4 de hasta 5 minutos. Pago coordinado por WhatsApp.</p>
            <a href="#solicitar-karaoke" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/[0.12] px-3 py-2.5 text-[12px] font-bold hover:bg-white/[0.05]">Solicitar MP4 <ArrowRight className="h-4 w-4" /></a>
          </div>
          <div className="rounded-[14px] border border-primary/30 bg-primary/[0.05] p-4 sm:p-5">
            <div className="flex items-center gap-2"><Crown className="h-4 w-4 text-primary" /><h3 className="text-[14px] font-bold">Soy cliente VIP</h3></div>
            <div className="mt-2 text-[23px] font-black text-primary">Pedidos gratis</div>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">Karaokes CD+G según los cupos y vigencia de tu membresía.</p>
            {user ? (
              <a href="#solicitar-karaoke" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-[12px] font-bold text-black hover:brightness-95">Consultar mis pedidos <ArrowRight className="h-4 w-4" /></a>
            ) : (
              <Link to="/login" state={{ from: loginReturn }} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-[12px] font-bold text-black hover:brightness-95"><LogIn className="h-4 w-4" /> Ingresar como VIP</Link>
            )}
          </div>
        </div>
      </section>

      <section aria-label="Últimos karaokes del catálogo">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[17px] font-extrabold">Últimos karaokes agregados</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">Ejemplos reales del catálogo. Escucha las demostraciones disponibles.</p>
          </div>
          <Link to="/panel" className="text-[12px] font-semibold text-primary hover:underline">Ver más →</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {recent.slice(0, 8).map((karaoke) => {
            const display = publicKaraokeDisplay(karaoke);
            return (
              <button key={karaoke.id} type="button" disabled={!karaoke.demoAvailable} onClick={() => setPlaying(karaoke)} className="group overflow-hidden rounded-[10px] border border-white/[0.08] bg-card text-left transition hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60">
                <span className="relative block aspect-video overflow-hidden bg-gradient-to-br from-primary/10 to-black">
                  {karaoke.coverUrl ? <img src={karaoke.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" /> : <span className="flex h-full items-center justify-center text-[18px] font-bold text-primary">DJGABO</span>}
                  {karaoke.demoAvailable && <span className="absolute bottom-2 right-2 rounded-full bg-black/75 p-2 text-white"><Play className="h-4 w-4" /></span>}
                </span>
                <span className="block px-3 py-3">
                  <span className="block truncate text-[12px] font-semibold" title={display.title}>{display.title}</span>
                  <span className="mt-1 block truncate text-[11px] text-muted-foreground">{display.artist}</span>
                  <span className="mt-2 block text-[10px] font-semibold text-primary">{karaoke.demoAvailable ? "▶ Ver demo" : "Demo no disponible"}</span>
                </span>
              </button>
            );
          })}
        </div>
        {isError && <p className="mt-3 text-[12px] text-muted-foreground">No se pudieron cargar los últimos karaokes en este momento.</p>}
      </section>

      {playing && <CdgDemoModal karaokeId={playing.id} title={publicKaraokeDisplay(playing).label} onClose={() => setPlaying(null)} />}
    </>
  );
}
