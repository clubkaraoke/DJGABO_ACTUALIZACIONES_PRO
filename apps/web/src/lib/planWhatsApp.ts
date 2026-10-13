/** Subscription payments are confirmed by DJGABO manually, never charged online. */
export function planSubscriptionWhatsappUrl(plan:{name:string;price:string}) {
  const message="Hola, DJGABO. Deseo suscribirme al *Plan VIP "+plan.name+" (US$"+plan.price+")*. ¿Cómo puedo realizar el pago?";
  return "https://wa.me/51921675846?text="+encodeURIComponent(message);
}
