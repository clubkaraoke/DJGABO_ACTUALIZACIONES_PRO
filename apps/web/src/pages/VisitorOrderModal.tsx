import { ArrowRight, Crown, LogIn, MessageCircle, ShieldCheck, X } from "lucide-react";
import { Link } from "react-router-dom";
import { visitorKaraokeWhatsAppUrl, VISITOR_KARAOKE_PRICE_USD } from "../lib/orderWhatsApp";

export function VisitorOrderModal({ youtubeUrl, loginReturn, hasFreeVipOrders, onClose }: {
  youtubeUrl: string;
  loginReturn: string;
  hasFreeVipOrders: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="visitor-order-heading">
      <div className="w-full max-w-[460px] rounded-[14px] border border-white/[0.12] bg-card p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Crown className="h-6 w-6" /></span>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-2 text-muted-foreground hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <h2 id="visitor-order-heading" className="mt-4 text-[20px] font-black">¿Ya eres cliente VIP?</h2>
        <p className="mt-2 text-[13px] leading-6 text-muted-foreground">Tu membresía podría incluir karaokes CD+G gratuitos. Inicia sesión y comprueba tus pedidos disponibles antes de pagar.</p>
        {hasFreeVipOrders && <p className="mt-3 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.08] p-3 text-[12px] text-emerald-300">Tu cuenta tiene pedidos VIP gratuitos disponibles. Recomendamos utilizarlos primero.</p>}
        <Link to="/login" state={{ from: loginReturn }} onClick={onClose} className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-[13px] font-bold text-black hover:brightness-95"><LogIn className="h-4 w-4" /> Soy VIP · Iniciar sesión</Link>
        {hasFreeVipOrders && <button type="button" onClick={onClose} className="mt-2 w-full rounded-md border border-primary/30 px-4 py-2.5 text-[12px] font-semibold text-primary">Volver y utilizar mi beneficio</button>}
        <div className="my-4 flex items-center gap-3 text-[11px] text-muted-foreground"><div className="h-px flex-1 bg-white/[0.08]" />O continuar como visitante<div className="h-px flex-1 bg-white/[0.08]" /></div>
        <p className="mb-3 text-center text-[12px] text-muted-foreground">Video MP4 hasta 5 minutos · {"US$" + VISITOR_KARAOKE_PRICE_USD} · Pago a coordinar por WhatsApp.</p>
        <a href={visitorKaraokeWhatsAppUrl(youtubeUrl)} target="_blank" rel="noopener noreferrer" onClick={onClose} className="flex w-full items-center justify-center gap-2 rounded-md border border-white/[0.12] px-4 py-3 text-[13px] font-bold hover:bg-white/[0.05]"><MessageCircle className="h-4 w-4" /> Continuar a WhatsApp <ArrowRight className="h-4 w-4" /></a>
        <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Abrir WhatsApp no genera un pago ni consume pedidos VIP. Primero confirmaremos la duración y disponibilidad.</p>
      </div>
    </div>
  );
}
