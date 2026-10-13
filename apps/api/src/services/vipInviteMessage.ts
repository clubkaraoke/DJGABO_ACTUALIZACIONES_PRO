import type { PlanOffer } from "./planOffers.js";

export function createVipInviteMessage(inviteUrl:string, verificationCode:string, annual:Pick<PlanOffer,"freeRequestsPerMonth">):string {
  const lines=[
    "🎤 *¡ESTRENAMOS TU NUEVO PANEL VIP DJGABO!*",
    "",
    "Como cliente VIP, ahora tienes un *panel exclusivo* para gestionar tus actualizaciones y futuras compras.",
    "",
    "✅ *Retoma tus actualizaciones* y descarga las carpetas que te faltan.",
  ];
  if(annual.freeRequestsPerMonth>0){
    const amount=annual.freeRequestsPerMonth;
    lines.push(`✅ *Solicita ${amount} ${amount===1?"karaoke GRATIS":"karaokes GRATIS"} cada mes* con tu membresía.`);
  }
  lines.push(
    "✅ *Accede a tus colecciones y novedades las 24 horas.*",
    "",
    "📢 *Ya no enviaremos las actualizaciones por WhatsApp:* ahora podrás consultarlas y descargarlas directamente desde tu panel.",
    "",
    "🔐 *ACTIVA TU ACCESO VIP*",
    "🌐 *Registro:* "+inviteUrl,
    "🔑 *Código personal:* "+verificationCode,
    "⏳ *Válido por 24 horas.*",
    "",
    "*DJGABO ACTUALIZACIONES PRO*"
  );
  return lines.join("\n");
}
