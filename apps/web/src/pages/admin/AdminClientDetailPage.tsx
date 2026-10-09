import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/apiClient";
import { Badge, Button, Skeleton } from "../../components/primitives";

interface ClientDeviceRow {
  id: string;
  name: string | null;
  lastSeenAt: string;
  active: boolean;
}

interface ClientDetail {
  id: string;
  name: string;
  email: string;
  whatsapp: string | null;
  activationPending: boolean;
  status: "ACTIVE" | "SUSPENDED" | "EXPIRED";
  planId: string | null;
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  maxDevices: number;
  collections: { id: string; title: string; enabled: boolean; expiresAt: string | null }[];
  devices: ClientDeviceRow[];
}
interface Plan {
  id: string;
  name: string;
}

function toInputDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [savedMsg, setSavedMsg] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "client", id],
    queryFn: () => api.get<ClientDetail>(`/admin/clients/${id}`),
    enabled: Boolean(id),
  });
  const { data: plans } = useQuery({ queryKey: ["admin", "plans"], queryFn: () => api.get<Plan[]>("/admin/plans") });

  const updateClient = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/admin/clients/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "client", id] });
      qc.invalidateQueries({ queryKey: ["admin", "clients"] });
      setSavedMsg("Guardado");
      setTimeout(() => setSavedMsg(""), 1500);
    },
  });

  const toggleAccess = useMutation({
    mutationFn: (vars: { collectionId: string; enabled: boolean }) =>
      api.post(`/admin/clients/${id}/access`, { collectionId: vars.collectionId, enabled: vars.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "client", id] }),
  });

  const deactivateDevice = useMutation({
    mutationFn: (sessionId: string) => api.post(`/admin/clients/${id}/devices/${sessionId}/deactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "client", id] }),
  });

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <Link to="/admin/clientes" className="text-sm text-ink-secondary hover:text-ink">
          ← Clientes
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">{data.name}</h1>
        <p className="text-sm text-ink-secondary">{data.email}</p>
        {data.whatsapp && <p className="mt-1 text-sm text-ink-secondary">WhatsApp: +{data.whatsapp}</p>}
      </div>

      {data.activationPending && (
        <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          Solicitud de activación VIP pendiente. Verifica este cliente en tu lista histórica y asigna su plan y vigencia.
        </div>
      )}

      <section className="space-y-4 rounded-lg border border-graphite-border bg-graphite p-5">
        <h2 className="font-display text-base font-semibold text-ink">Membresía</h2>

        <div className="flex flex-wrap gap-2">
          {(["ACTIVE", "SUSPENDED", "EXPIRED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => updateClient.mutate({ status: s })}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                data.status === s ? "border-accent bg-accent-soft text-accent" : "border-graphite-border text-ink-secondary"
              }`}
            >
              {s === "ACTIVE" ? "Activar" : s === "SUSPENDED" ? "Suspender" : "Marcar vencido"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="text-sm text-ink-secondary">
            Plan
            <select
              value={data.planId ?? ""}
              onChange={(e) => updateClient.mutate({ planId: e.target.value || null })}
              className="mt-1 w-full rounded-md border border-graphite-border bg-graphite-elevated px-3 py-2 text-sm text-ink"
            >
              <option value="">Sin plan</option>
              {plans?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-ink-secondary">
            Máx. dispositivos
            <input
              type="number"
              min={1}
              max={20}
              defaultValue={data.maxDevices}
              onBlur={(e) => updateClient.mutate({ maxDevices: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-graphite-border bg-graphite-elevated px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="text-sm text-ink-secondary">
            Inicio de suscripción
            <input
              type="date"
              defaultValue={toInputDate(data.subscriptionStart)}
              onBlur={(e) => updateClient.mutate({ subscriptionStart: e.target.value ? new Date(e.target.value).toISOString() : null })}
              className="mt-1 w-full rounded-md border border-graphite-border bg-graphite-elevated px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="text-sm text-ink-secondary">
            Vencimiento (renovar)
            <input
              type="date"
              defaultValue={toInputDate(data.subscriptionEnd)}
              onBlur={(e) => updateClient.mutate({ subscriptionEnd: e.target.value ? new Date(e.target.value).toISOString() : null })}
              className="mt-1 w-full rounded-md border border-graphite-border bg-graphite-elevated px-3 py-2 text-sm text-ink"
            />
          </label>
        </div>
        {savedMsg && <p className="text-xs text-accent">{savedMsg}</p>}
      </section>

      <section className="space-y-3 rounded-lg border border-graphite-border bg-graphite p-5">
        <h2 className="font-display text-base font-semibold text-ink">Acceso a colecciones</h2>
        <div className="divide-y divide-graphite-border">
          {data.collections.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-2.5">
              <span className="text-sm text-ink">{c.title}</span>
              <Button
                variant={c.enabled ? "primary" : "secondary"}
                onClick={() => toggleAccess.mutate({ collectionId: c.id, enabled: !c.enabled })}
                className="px-3 py-1.5 text-xs"
              >
                {c.enabled ? "Otorgado ✓" : "Otorgar acceso"}
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-graphite-border bg-graphite p-5">
        <h2 className="font-display text-base font-semibold text-ink">
          Dispositivos <span className="text-ink-secondary">({data.devices.filter((d) => d.active).length}/{data.maxDevices})</span>
        </h2>
        {data.devices.length === 0 ? (
          <p className="text-sm text-ink-secondary">Este cliente todavía no ha registrado ningún dispositivo.</p>
        ) : (
          <div className="divide-y divide-graphite-border">
            {data.devices.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm text-ink">{d.name ?? "Dispositivo sin nombre"}</p>
                  <p className="text-xs text-ink-tertiary">Última actividad: {formatDateTime(d.lastSeenAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={d.active ? "accent" : "neutral"}>{d.active ? "Activo" : "Desvinculado"}</Badge>
                  {d.active && (
                    <Button
                      variant="danger"
                      className="px-3 py-1.5 text-xs"
                      disabled={deactivateDevice.isPending}
                      onClick={() => deactivateDevice.mutate(d.id)}
                    >
                      Desvincular
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
