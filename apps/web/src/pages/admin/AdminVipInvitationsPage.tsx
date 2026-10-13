import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/apiClient";
import { Button, Skeleton } from "../../components/primitives";

interface Contact {
  phone: string;
  reference_email: string | null;
  used_user_id: string | null;
  used_at: number | null;
  revoked: number;
  verification_expires: number | null;
}
interface InviteData { inviteUrl: string | null; contacts: Contact[]; }
export default function AdminVipInvitationsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["vip-invitations"], queryFn: () => api.get<InviteData>("/admin/vip-invitations") });
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [lastCode, setLastCode] = useState<{ phone: string; code: string; message: string; whatsappUrl: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["vip-invitations"] });
  const add = useMutation({
    mutationFn: () => api.post("/admin/vip-invitations", { whatsapp: phone, email: email || undefined }),
    onSuccess: () => { setPhone(""); setEmail(""); setError(""); refresh(); },
    onError: (e: Error) => setError(e.message),
  });
  const revoke = useMutation({
    mutationFn: (p: string) => api.del("/admin/vip-invitations/" + encodeURIComponent(p)),
    onSuccess: refresh, onError: (e: Error) => setError(e.message),
  });
  const generate = useMutation({
    mutationFn: (p: string) => api.post<{ code: string; message: string; whatsappUrl: string }>("/admin/vip-invitations/" + encodeURIComponent(p) + "/code", {}),
    onSuccess: (v, p) => { setLastCode({ ...v, phone: p }); setError(""); refresh(); },
    onError: (e: Error) => setError(e.message),
  });
  return <div className="space-y-6">
    <div>
      <h1 className="font-display text-2xl font-bold">Invitaciones VIP · Clientes antiguos</h1>
      <p className="mt-2 text-sm text-ink-secondary">
        Un enlace para todos, con lista autorizada y código personal que tú envías al WhatsApp del cliente.
      </p>
    </div>
    <section className="max-w-2xl space-y-3 rounded-lg border border-graphite-border bg-graphite p-4">
      <h2 className="font-semibold">Enlace compartido de registro</h2>
      <div className="break-all rounded-md bg-graphite-elevated p-3 font-mono text-xs">{data?.inviteUrl || "Enlace no configurado en Railway"}</div>
      <Button disabled={!data?.inviteUrl} onClick={() => void navigator.clipboard.writeText(data?.inviteUrl || "")}>Copiar enlace</Button>
      <p className="text-xs text-ink-secondary">El enlace por sí solo no concede acceso. Cada cliente necesita WhatsApp autorizado y un código personal de seis dígitos (válido 24 horas).</p>
    </section>
    <form className="max-w-2xl space-y-3 rounded-lg border border-graphite-border bg-graphite p-4" onSubmit={e => { e.preventDefault(); add.mutate(); }}>
      <h2 className="font-semibold">Agregar WhatsApp autorizado</h2>
      <input required value={phone} onChange={e => setPhone(e.target.value)} placeholder="Código de país + número (ej. 51987654321)" className="w-full rounded-md border border-graphite-border bg-graphite-elevated p-2 text-sm" />
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Correo de referencia (opcional)" className="w-full rounded-md border border-graphite-border bg-graphite-elevated p-2 text-sm" />
      <Button type="submit" disabled={add.isPending}>Autorizar WhatsApp</Button>
    </form>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {lastCode && <section className="max-w-2xl space-y-2 rounded-lg border border-primary/40 bg-primary/[0.07] p-4">
      <p className="font-semibold">Código generado para +{lastCode.phone}: <span className="font-mono text-lg">{lastCode.code}</span></p>
      <p className="text-xs">Mensaje personalizado con beneficios actuales de Admin → Planes. Se muestra solo ahora; envíalo al titular por WhatsApp.</p>
      <div className="rounded-lg border border-graphite-border bg-graphite-elevated p-3">
        <p className="mb-2 text-xs font-semibold text-ink-secondary">Vista previa del texto WhatsApp</p>
        <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-5">{lastCode.message}</pre>
      </div>
      <Button variant="secondary" onClick={()=>void navigator.clipboard.writeText(lastCode.message)}>Copiar mensaje</Button>
      <a href={lastCode.whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Enviar invitación y código por WhatsApp</a>
    </section>}
    {isLoading ? <Skeleton className="h-44 w-full" /> :
      <div className="overflow-x-auto rounded-lg border border-graphite-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-graphite"><tr><th className="p-3">WhatsApp</th><th className="p-3">Correo referencia</th><th className="p-3">Estado</th><th className="p-3">Acciones</th></tr></thead>
          <tbody>{data?.contacts.map(c => <tr key={c.phone} className="border-t border-graphite-border">
            <td className="p-3 font-mono">+{c.phone}</td>
            <td className="p-3 text-xs">{c.reference_email || "—"}</td>
            <td className="p-3">{c.used_user_id ? "Registrado" : c.revoked ? "Revocado" : c.verification_expires && c.verification_expires > Date.now() ? "Código generado" : "Autorizado"}</td>
            <td className="p-3">{!c.used_user_id && !c.revoked ? <div className="flex flex-wrap gap-2">
              <button type="button" className="text-primary" onClick={() => generate.mutate(c.phone)} disabled={generate.isPending}>Generar código</button>
              <button type="button" className="text-danger" onClick={() => { if (window.confirm("¿Revocar invitación?")) revoke.mutate(c.phone); }}>Revocar</button>
            </div> : "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>}
  </div>;
}
