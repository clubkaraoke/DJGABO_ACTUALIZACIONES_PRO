import type { Db } from "../db/client.js";
import { sqliteClient } from "../db/client.js";

export interface PlanOffer {
  slug: string;
  title: string;
  price: string;
  period: string;
  description: string;
  items: string[];
  annualBonus: string | null;
  freeRequestsPerMonth: number;
}
interface OfferRow {
  slug:string;title:string;price:string;period:string;description:string;
  items:string;annual_bonus:string|null;free_requests_per_month:number;
}

const FREE_BULLET = /\b\d+\s+karaokes?\s+a\s+pedido\s+gratis\b/i;
export function freeRequestsBullet(amount: number): string {
  return amount === 1 ? "1 karaoke a pedido GRATIS cada mes" : `${amount} karaokes a pedido GRATIS cada mes`;
}
function publicOffer(row:OfferRow):PlanOffer {
  let items: string[] = [];
  try { items = JSON.parse(row.items) as string[]; } catch { items = []; }
  const limit = row.free_requests_per_month;
  const rest=items.filter(line=>!FREE_BULLET.test(line));
  // Keep benefit in its old position for visual continuity, rather than duplicating it.
  const oldPosition=items.findIndex(line=>FREE_BULLET.test(line));
  if(limit>0)rest.splice(oldPosition<0?rest.length:Math.min(oldPosition,rest.length),0,freeRequestsBullet(limit));
  let annualBonus=row.annual_bonus?.replaceAll("{{totalAnual}}",String(limit*12))??null;
  if (row.slug==="pro-anual" && limit===0 && annualBonus && /\b\d+\s+karaokes?\b/i.test(annualBonus)) annualBonus=null;
  if(row.slug==="pro-anual" && annualBonus && /\b\d+\s+karaokes?\b/i.test(annualBonus)){
    annualBonus=annualBonus.replace(/\b\d+(?=\s+karaokes?\b)/i,String(limit*12));
  }
  return {slug:row.slug,title:row.title,price:row.price,period:row.period,
    description:row.description,items:rest,annualBonus,freeRequestsPerMonth:limit};
}
export function listPlanOffers(db:Db):PlanOffer[] {
  return (sqliteClient(db).prepare("SELECT slug,title,price,period,description,items,annual_bonus,free_requests_per_month FROM plan_marketing ORDER BY CASE slug WHEN 'pro-mensual' THEN 1 WHEN 'pro-semestral' THEN 2 ELSE 3 END").all() as OfferRow[]).map(publicOffer);
}
export function getPlanOffer(db:Db,slug:string):PlanOffer | null {
  const row=sqliteClient(db).prepare("SELECT slug,title,price,period,description,items,annual_bonus,free_requests_per_month FROM plan_marketing WHERE slug=?").get(slug) as OfferRow|undefined;
  return row?publicOffer(row):null;
}
export function customBenefitLines(lines:string[]):string[] {
  return lines.filter(line=>!FREE_BULLET.test(line));
}
