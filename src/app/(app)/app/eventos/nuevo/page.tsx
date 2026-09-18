import Link from "next/link";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { listForms } from "@/server/forms/forms-service";
import { ensureEventsModule } from "../module-gate";
import NuevoEventoForm, { type CandidateActivity } from "./NuevoEventoForm";

/**
 * Alta de evento. Dos modos soportados: desde cero (crea activity + events en
 * un flujo) o a partir de una activity type='event' ya existente que aún no
 * tiene fila `events`. El tercer modo (desde plantilla de actividad) se omite
 * aquí: NuevaActividadForm ya cubre plantillas para crear la activity, y una
 * vez creada aparece como candidata en el modo "desde actividad existente" —
 * duplicar esa lógica de plantillas (recurrencia, horarios por defecto) en
 * este formulario habría sido una reimplementación no trivial sin beneficio
 * claro frente a: Actividades → Nueva actividad (con plantilla, type=evento)
 * → volver aquí y elegirla en "desde actividad existente".
 */
export default async function NuevoEventoPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureEventsModule(tenant.churchId);
  if (disabled) return disabled;

  const supabase = await createSupabaseServerClient();

  const [campusRes, forms, candidateRes, { data: church }] = await Promise.all([
    supabase.from("campuses").select("id, name, timezone").eq("church_id", tenant.churchId).is("archived_at", null).order("name"),
    listForms(tenant.churchId, { active: true }),
    supabase
      .from("activities")
      .select("id, title, starts_at, status, campus_id, campuses(name)")
      .eq("church_id", tenant.churchId)
      .eq("type", "event")
      .neq("status", "archived")
      .order("starts_at", { ascending: true })
      .limit(200),
    supabase.from("churches").select("timezone").eq("id", tenant.churchId).maybeSingle(),
  ]);

  const campuses = (campusRes.data ?? []) as { id: string; name: string; timezone: string | null }[];
  const churchTimezone = (church?.timezone as string | null) ?? "UTC";

  // Excluye las activities que ya tienen fila `events` (consulta directa: no
  // hay una función ya expuesta que liste "activities candidatas a evento").
  const activityIds = (candidateRes.data ?? []).map((a) => a.id as string);
  let eventedActivityIds = new Set<string>();
  if (activityIds.length > 0) {
    const { data: existingEvents } = await supabase
      .from("events")
      .select("activity_id")
      .eq("church_id", tenant.churchId)
      .in("activity_id", activityIds);
    eventedActivityIds = new Set((existingEvents ?? []).map((e) => e.activity_id as string));
  }

  const candidates: CandidateActivity[] = (candidateRes.data ?? [])
    .filter((a) => !eventedActivityIds.has(a.id as string))
    .map((a) => {
      const campus = Array.isArray(a.campuses) ? a.campuses[0] : a.campuses;
      return {
        id: a.id as string,
        title: a.title as string,
        startsAt: a.starts_at as string | null,
        status: a.status as string,
        campusName: (campus as { name: string } | null)?.name ?? null,
      };
    });

  return (
    <>
      <section>
        <Link href="/app/eventos" style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}>
          ← Eventos
        </Link>
        <h1 style={{ fontSize: 21, fontWeight: 600, marginTop: 6 }}>Nuevo evento</h1>
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 2 }}>
          Crea un evento desde cero o activa el comportamiento de evento sobre una actividad ya existente.
        </p>
      </section>

      <NuevoEventoForm
        campuses={campuses}
        churchTimezone={churchTimezone}
        forms={forms.map((f) => ({ id: f.id, name: f.name }))}
        candidates={candidates}
      />
    </>
  );
}
