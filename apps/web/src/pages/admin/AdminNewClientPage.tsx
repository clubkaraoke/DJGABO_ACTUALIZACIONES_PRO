import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/apiClient";
import { Button } from "../../components/primitives";

interface Plan {slug:string;title:string;price:string;freeRequestsPerMonth:number}
interface Created {
  id:string;name:string;email:string;whatsapp:string;planSlug:string;
  subscriptionStart:string;subscriptionEnd:string;
  activationUrl:string;whatsappUrl:string;message:string;activationExpiresHours:number;
}
export default function AdminNewClientPage(){
 const {data:plans=[]}=useQuery({queryKey:["admin","plan-offers"],queryFn:()=>api.get<Plan[]>("/admin/plan-offers")});
 const [name,setName]=useState("");
 const [whatsapp,setWhatsapp]=useState("");
 const [email,setEmail]=useState("");
 const [planSlug,setPlanSlug]=useState("pro-anual");
 const [method,setMethod]=useState("YAPE_PLIN");
 const [amountPaid,setAmountPaid]=useState("");
 const [paymentCurrency,setPaymentCurrency]=useState("PEN");
 const [reference,setReference]=useState("");
 const [confirmed,setConfirmed]=useState(false);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [created,setCreated]=useState<Created|null>(null);
 const plan=plans.find(p=>p.slug===planSlug);
 async function submit(event:FormEvent){
   event.preventDefault();
   setError("");setLoading(true);
   try{
     const result=await api.post<Created>("/admin/clients/manual",{
       name,email,whatsapp,planSlug,paymentMethod:method,
       amountPaid,paymentCurrency,paymentReference:reference||undefined,paymentConfirmed:confirmed
     });
     setCreated(result);
   }catch(e){setError(e instanceof Error?e.message:"No se pudo crear el cliente");}
   finally{setLoading(false);}
 }
 return <div className="max-w-2xl space-y-6">
   <div><Link to="/admin/clientes" className="text-sm text-ink-secondary hover:text-ink">← Clientes</Link>
     <h1 className="mt-2 font-display text-2xl font-bold">Nuevo cliente VIP</h1>
     <p className="mt-1 text-sm text-ink-secondary">Para compradores nuevos con pago confirmado por WhatsApp. No utiliza invitaciones de clientes antiguos.</p>
   </div>
   {created ? <section className="space-y-4 rounded-lg border border-emerald-400/20 bg-graphite p-5">
     <h2 className="text-lg font-bold text-emerald-400">Cliente creado y membresía activada</h2>
     <p className="text-sm">{created.name} · {created.email}</p>
     <p className="text-sm">Vigencia: {new Date(created.subscriptionStart).toLocaleDateString("es-PE")} — {new Date(created.subscriptionEnd).toLocaleDateString("es-PE")}</p>
     <p className="text-xs text-amber-300">Falta que el cliente configure su contraseña. El enlace es privado y válido por 48 horas.</p>
     <div className="rounded-lg border border-graphite-border bg-graphite-elevated p-3">
       <p className="mb-2 text-xs font-semibold">Mensaje listo para WhatsApp</p>
       <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-5">{created.message}</pre>
     </div>
     <div className="flex flex-wrap gap-3">
       <a href={created.whatsappUrl} target="_blank" rel="noopener noreferrer" className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Enviar por WhatsApp</a>
       <Button variant="secondary" onClick={()=>void navigator.clipboard.writeText(created.message)}>Copiar mensaje</Button>
       <Link to={"/admin/clientes/"+created.id} className="rounded-md border border-graphite-border px-4 py-2 text-sm">Ver ficha</Link>
     </div>
   </section> : <form onSubmit={submit} className="space-y-4 rounded-lg border border-graphite-border bg-graphite p-5">
     <label className="block text-sm">Nombre completo
       <input required minLength={2} maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre del comprador" className="mt-1 w-full rounded-md border border-graphite-border bg-graphite-elevated p-3"/>
     </label>
     <label className="block text-sm">WhatsApp con código de país
       <input type="tel" required value={whatsapp} onChange={e=>setWhatsapp(e.target.value)} placeholder="51987654321" className="mt-1 w-full rounded-md border border-graphite-border bg-graphite-elevated p-3"/>
     </label>
     <label className="block text-sm">Correo electrónico
       <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="cliente@correo.com" className="mt-1 w-full rounded-md border border-graphite-border bg-graphite-elevated p-3"/>
     </label>
     <label className="block text-sm">Plan comprado
       <select required value={planSlug} onChange={e=>{setPlanSlug(e.target.value);setAmountPaid("")}} className="mt-1 w-full rounded-md border border-graphite-border bg-graphite-elevated p-3">
         {plans.map(p=><option key={p.slug} value={p.slug}>{p.title} · USundefined</option>)}
       </select>
     </label>
     <p className="rounded-md bg-graphite-elevated p-3 text-xs text-ink-secondary">
       {plan ? "Beneficio actual: "+plan.freeRequestsPerMonth+" karaokes a pedido GRATIS al mes.":"Cargando información vigente del plan…"}
       {" "}Inicio: al activar. Vencimiento: {planSlug==="pro-mensual"?"30 días":planSlug==="pro-semestral"?"6 meses":"12 meses"}.
     </p>
     <div className="grid gap-4 sm:grid-cols-2">
       <label className="block text-sm">Medio de pago
         <select value={method} onChange={e=>{setMethod(e.target.value);if(e.target.value==="PAYPAL")setPaymentCurrency("USD")}} className="mt-1 w-full rounded-md border border-graphite-border bg-graphite-elevated p-3">
           <option value="YAPE_PLIN">Yape / Plin</option><option value="PAYPAL">PayPal</option><option value="OTHER">Otro</option>
         </select>
       </label>
       <label className="block text-sm">Importe pagado
         <input required type="text" inputMode="decimal" pattern="[0-9]+\.[0-9]{2}" value={amountPaid} onChange={e=>setAmountPaid(e.target.value)} placeholder={plan?.price??"0.00"} className="mt-1 w-full rounded-md border border-graphite-border bg-graphite-elevated p-3"/>
         <select value={paymentCurrency} onChange={e=>setPaymentCurrency(e.target.value)} aria-label="Moneda del pago" className="mt-2 w-full rounded-md border border-graphite-border bg-graphite-elevated p-2 text-sm">
           <option value="PEN">Soles (PEN)</option><option value="USD">Dólares (USD)</option><option value="MXN">Pesos mexicanos (MXN)</option><option value="BOB">Bolivianos (BOB)</option><option value="VES">Bolívares (VES)</option>
         </select>
         <span className="mt-1 block text-xs text-ink-tertiary">Registra el importe exacto recibido y su moneda; el precio comercial del plan se mantiene en USD.</span>
       </label>
     </div>
     <label className="block text-sm">Referencia / comprobante (opcional)
       <input maxLength={150} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Número de operación" className="mt-1 w-full rounded-md border border-graphite-border bg-graphite-elevated p-3"/>
     </label>
     <label className="flex items-start gap-2 text-sm">
       <input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/>
       Confirmo que comprobé el pago. Activar la membresía desde hoy.
     </label>
     {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
     <Button type="submit" disabled={loading||!confirmed||!plan||!amountPaid}>{loading?"Creando…":"Crear y activar cliente"}</Button>
     <p className="text-xs text-ink-secondary">El cliente establecerá su contraseña mediante un enlace privado. Nunca recibirás ni conocerás su contraseña.</p>
   </form>}
 </div>;
}
