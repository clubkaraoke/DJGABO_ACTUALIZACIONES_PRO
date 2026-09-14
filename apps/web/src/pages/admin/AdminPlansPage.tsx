import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/apiClient";
import { Button, Skeleton } from "../../components/primitives";

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  active: boolean;
  maxDevices: number;
}

export default function AdminPlansPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "plans"], queryFn: () => api.get<Plan[]>("/admin/plans") });
  const [form, setForm] = useState({ name: "", slug: "", maxDevices: 2 });

  const createPlan = useMutation({
    mutationFn: () => api.post("/admin/plans", form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "plans"] });
      setForm({ name: "", slug: "", maxDevices: 2 });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createPlan.mutate();
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-ink">Planes</h1>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {data?.map((p) => (
            <div key={p.id} className="rounded-lg border border-graphite-border bg-graphite p-4">
              <p className="font-display font-semibold text-ink">{p.name}</p>
              <p className="text-xs text-ink-tertiary">{p.slug}</p>
              <p className="mt-2 text-sm text-ink-secondary">Máx. {p.maxDevices} dispositivos</p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-sm space-y-3 rounded-lg border border-graphite-border bg-graphite p-5">
        <h2 className="font-display text-base font-semibold text-ink">Nuevo plan</h2>
        <input
          required
          placeholder="Nombre"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full rounded-md border border-graphite-border bg-graphite-elevated px-3 py-2 text-sm text-ink"
        />
        <input
          required
          placeholder="slug (ej. pro-anual)"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          className="w-full rounded-md border border-graphite-border bg-graphite-elevated px-3 py-2 text-sm text-ink"
        />
        <input
          type="number"
          min={1}
          max={20}
          value={form.maxDevices}
          onChange={(e) => setForm({ ...form, maxDevices: Number(e.target.value) })}
          className="w-full rounded-md border border-graphite-border bg-graphite-elevated px-3 py-2 text-sm text-ink"
        />
        <Button type="submit" className="w-full">
          Crear plan
        </Button>
      </form>
    </div>
  );
}
