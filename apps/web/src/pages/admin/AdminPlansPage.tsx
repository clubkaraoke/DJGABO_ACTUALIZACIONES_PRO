import { useState } from "react";
import { useQuery,useMutation,useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/apiClient";
import { Button,Skeleton } from "../../components/primitives";
interface Offer {slug:string;title:string;price:string;period:string;description:string;items:string[];annualBonus:string|null;freeRequestsPerMonth:number}
export default function AdminPlansPage(){
 const qc=useQueryClient();
 const {data,isLoading}=useQuery({queryKey:["admin","plan-offers"],queryFn:()=>api.get<Offer[]>("/admin/plan-offers")});
 const [edit,setEdit]=useState<Offer|null>(null);
 const [benefits,setBenefits]=useState("");
 const [error,setError]=useState("");
 const [quotaInput,setQuotaInput]=useState("");
 const save=useMutation({
 mutationFn:(o:Offer)=>api.patch("/admin/plan-offers/"+o.slug,o),
 onSuccess:()=>{qc.invalidateQueries({queryKey:["admin","plan-offers"]});qc.invalidateQueries({queryKey:["public","plan-offers"]});qc.invalidateQueries({queryKey:["admin","plans"]});setEdit(null);setError("")},
 onError:(e:Error)=>setError(e.message)});
 const begin=(o:Offer)=>{
  setEdit({...o,items:[...o.items]});
  setBenefits(o.items.filter(item=>!/\b\d+\s+karaokes?\s+a\s+pedido\s+gratis\b/i.test(item)).join("\n"));
  setQuotaInput(String(o.freeRequestsPerMonth));
  setError("");
 };
 return <div className="space-y-6">
 <h1 className="font-display text-2xl font-bold">Planes VIP</h1>
 <p className="text-sm text-ink-secondary">Administra precios y textos de los tres planes. Las cuotas y permisos técnicos son independientes.</p>
 {isLoading?<Skeleton className="h-40 w-full"/>:<div className="grid grid-cols-1 gap-4 md:grid-cols-3">{data?.map(o=><div key={o.slug} className="space-y-2 rounded-lg border border-graphite-border bg-graphite p-4">
 <h2 className="font-semibold">{o.title} · {"US$"}{o.price}</h2>
 <p className="text-xs text-ink-secondary">{o.slug}</p>
 <p className="text-sm">{o.description}</p>
 <p className="text-xs font-semibold text-primary">Pedidos gratis reales: {o.freeRequestsPerMonth} por mes</p>
 <ul className="list-disc pl-4 text-xs text-ink-secondary">{o.items.map((item,i)=><li key={i}>{item}</li>)}</ul>
 <Button variant="secondary" onClick={()=>begin(o)}>Editar precio, beneficios y cuotas</Button>
 </div>)}</div>}
 {edit&&<form onSubmit={e=>{e.preventDefault();const n=Number(quotaInput);if(!Number.isInteger(n)||n<0||n>500){setError("La cuota debe estar entre 0 y 500.");return}save.mutate({...edit,freeRequestsPerMonth:n,items:benefits.split("\n").map(s=>s.trim()).filter(Boolean)})}} className="max-w-xl space-y-4 rounded-lg border border-primary/30 bg-graphite p-5">
 <h2 className="text-lg font-semibold">Editar {edit.slug}</h2>
 <label className="block text-sm">Nombre<input required value={edit.title} onChange={e=>setEdit({...edit,title:e.target.value})} className="mt-1 w-full rounded-md bg-graphite-elevated p-2"/></label>
 <label className="block text-sm">Precio en US$<input type="text" required inputMode="decimal" placeholder="189.99" pattern="[0-9]+\.[0-9]{2}" value={edit.price} onChange={e=>setEdit({...edit,price:e.target.value})} className="mt-1 w-full rounded-md bg-graphite-elevated p-2"/></label>
 <label className="block text-sm">Descripción<input required value={edit.description} onChange={e=>setEdit({...edit,description:e.target.value})} className="mt-1 w-full rounded-md bg-graphite-elevated p-2"/></label>
 <label className="block text-sm font-semibold">Karaokes GRATIS al mes (cuota real)<input type="number" min="0" max="500" step="1" required value={quotaInput} onChange={e=>setQuotaInput(e.target.value)} className="mt-1 w-full rounded-md border border-primary/25 bg-graphite-elevated p-2"/></label>
 <p className="text-xs text-ink-secondary">Este número controla los pedidos reales, la oferta pública y las invitaciones VIP. El beneficio se escribe automáticamente.</p>
 <label className="block text-sm">Otros beneficios (una línea por beneficio)<textarea required rows={6} value={benefits} onChange={e=>setBenefits(e.target.value)} className="mt-1 w-full rounded-md bg-graphite-elevated p-2"/></label>
 {edit.slug==="pro-anual"&&<label className="block text-sm">Bonificación destacada<input value={edit.annualBonus||""} onChange={e=>setEdit({...edit,annualBonus:e.target.value})} className="mt-1 w-full rounded-md bg-graphite-elevated p-2"/></label>}
 {error&&<p className="text-sm text-danger" role="alert">{error}</p>}
 <div className="flex gap-2"><Button type="submit" disabled={save.isPending}>{save.isPending?"Guardando…":"Guardar cambios"}</Button><Button variant="secondary" type="button" onClick={()=>setEdit(null)}>Cancelar</Button></div>
 <p className="text-xs text-ink-secondary">Los límites de pedidos gratuitos sí se actualizan al guardar; las reglas de descarga, duración y dispositivos no cambian.</p>
 </form>}
 </div>
}
