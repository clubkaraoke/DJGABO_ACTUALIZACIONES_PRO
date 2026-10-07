import { Check, FolderOpen } from "lucide-react";
import { VipShell } from "../components/VipShell";

function Benefit({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[12px] leading-5">
      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <span>{children}</span>
    </li>
  );
}

function Detail({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-5 mt-0.5 text-[11px] leading-5 text-muted-foreground">
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-white/[0.06] pt-3 text-[12px] font-extrabold text-foreground">
      {children}
    </div>
  );
}

export default function PackagesPage() {
  return (
    <VipShell>
      <div className="space-y-5">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-wider text-primary">
            <FolderOpen className="h-3.5 w-3.5" /> PACKS KARAOKE
          </div>
          <h1 className="max-w-3xl text-2xl font-black leading-tight">
            Paquetes karaoke para Fiesta en casa, Eventos o Bares
          </h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
            Colecciones karaoke ordenadas y catalogadas en formatos MP4 y CDG, con herramientas profesionales DJGABO.
          </p>
        </div>

        <div className="border-t border-white/[0.06]" />

        <div className="flex flex-wrap justify-center gap-5">
          <div className="flex w-full max-w-[330px] flex-col rounded-[10px] border border-white/[0.06] bg-card p-5">
            <div className="text-[15px] font-bold">Basic</div>
            <div className="mt-1 text-[12px] text-muted-foreground">
              Perfecto para cantar en casa y reuniones pequeñas.
            </div>
            <div className="my-4 flex items-end gap-2">
              <span className="font-mono text-3xl font-black">$49</span>
              <span className="pb-1 font-mono text-[11px] text-muted-foreground">USD · 150 GB</span>
            </div>
            <ul className="mb-5 flex-1 space-y-2">
              <Benefit>10.000 Karaokes español MP4</Benefit>
              <Benefit>4.000 Karaokes inglés MP4</Benefit>
              <Benefit>Géneros variados</Benefit>
            </ul>
            <button className="rounded-md border border-white/[0.08] bg-secondary py-2.5 text-[13px] font-semibold">
              Consultar paquete
            </button>
          </div>

          <div className="relative flex w-full max-w-[350px] flex-col rounded-[10px] border border-primary bg-card p-5">
            <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 font-mono text-[10px] font-bold text-black">
              MÁS POPULAR
            </div>
            <div className="text-[15px] font-bold">Pro</div>
            <div className="mt-1 text-[12px] text-muted-foreground">
              Ideal para DJs y fiestas grandes o eventos.
            </div>
            <div className="my-4 flex items-end gap-2">
              <span className="font-mono text-3xl font-black">$249</span>
              <span className="pb-1 font-mono text-[11px] text-muted-foreground">USD · 300 GB</span>
            </div>

            <ul className="space-y-2">
              <Benefit>28.000 Karaokes español MP3+G</Benefit>
              <Benefit>4.000 Karaokes inglés MP3+G</Benefit>
              <Benefit>5.000 Top Hits 2026-2021</Benefit>
            </ul>

            <SectionTitle>Herramientas Pro</SectionTitle>
            <div className="mt-2 flex items-start gap-2 text-[12px] font-semibold"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />Reproductor Karaoke</div>
            <Detail>Cambia el tono de las canciones para adaptarlas a cada voz.</Detail>

            <div className="mt-2.5 flex items-start gap-2 text-[12px] font-semibold"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />Buscador Karaoke</div>
            <Detail>Encuentra tus karaokes en segundos desde tu PC o desde un disco duro externo conectado.</Detail>

            <SectionTitle>Acceso VIP</SectionTitle>
            <div className="mt-2 flex items-start gap-2 text-[12px] font-semibold"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />6 meses de actualizaciones</div>
            <Detail>Incluidos gratis.</Detail>

            <div className="mt-2.5 flex items-start gap-2 text-[12px] font-semibold"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />5 karaokes a pedido por mes</div>
            <Detail>Incluidos gratis.</Detail>

            <button className="mt-5 rounded-md bg-primary py-2.5 text-[13px] font-semibold text-black">
              Consultar paquete
            </button>
          </div>

          <div className="flex w-full max-w-[370px] flex-col rounded-[10px] border border-white/[0.06] bg-card p-5">
            <div className="text-[15px] font-bold">Premium</div>
            <div className="mt-1 text-[12px] text-muted-foreground">
              Ideal para bares y karaokes que buscan el repertorio más completo.
            </div>
            <div className="my-4 flex items-end gap-2">
              <span className="font-mono text-3xl font-black">$349</span>
              <span className="pb-1 font-mono text-[11px] text-muted-foreground">USD · 800 GB</span>
            </div>

            <ul className="space-y-2">
              <Benefit>28.000 Karaokes español MP3+G</Benefit>
              <Benefit>28.000 Karaokes inglés MP3+G</Benefit>
              <Benefit>5.000 Top Hits 2026-2021</Benefit>
            </ul>

            <SectionTitle>Extras Premium</SectionTitle>
            <div className="mt-2 flex items-start gap-2 text-[12px] font-semibold"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />1.500 Karaokes Internacionales</div>
            <Detail>Francés, italiano, portugués y japonés.</Detail>

            <div className="mt-2.5 flex items-start gap-2 text-[12px] font-semibold"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />2.000 Karaokes Extras Gold</div>
            <Detail>Salsas y cumbias exclusivas para ampliar tu repertorio.</Detail>

            <SectionTitle>Herramientas Pro</SectionTitle>
            <div className="mt-2 flex items-start gap-2 text-[12px] font-semibold"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />Reproductor Karaoke</div>
            <Detail>Cambia el tono de las canciones para adaptarlas a cada voz.</Detail>

            <div className="mt-2.5 flex items-start gap-2 text-[12px] font-semibold"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />Buscador Karaoke</div>
            <Detail>Encuentra tus karaokes en segundos desde tu PC o desde un disco duro externo conectado.</Detail>

            <div className="mt-2.5 flex items-start gap-2 text-[12px] font-semibold"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />Sistema de Pedidos de Canciones</div>
            <Detail>Recibe solicitudes de tus clientes directamente en WhatsApp.</Detail>

            <SectionTitle>Acceso VIP</SectionTitle>
            <div className="mt-2 flex items-start gap-2 text-[12px] font-semibold"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />12 meses de actualizaciones</div>
            <Detail>Incluidos gratis.</Detail>

            <div className="mt-2.5 flex items-start gap-2 text-[12px] font-semibold"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />15 karaokes a pedido por mes</div>
            <Detail>Incluidos gratis.</Detail>

            <button className="mt-5 rounded-md border border-white/[0.08] bg-secondary py-2.5 text-[13px] font-semibold">
              Consultar paquete
            </button>
          </div>
        </div>
      </div>
    </VipShell>
  );
}
