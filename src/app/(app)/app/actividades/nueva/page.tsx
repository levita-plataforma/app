import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { canCreateAnywhere, getCreationScopes } from "@/server/activities/activities-service";
import { listActivityTemplates } from "@/server/activities/activity-templates-service";
import { toDomainError } from "@/server/activities/rpc";
import { isActivityType, type ActivityVisibility } from "@/lib/activities/constants";
import { localDateKey } from "@/lib/activities/time";
import NuevaActividadForm, { type TemplateOption } from "./NuevaActividadForm";
import "../actividades.css";

type SearchParams = { plantilla?: string; tipo?: string };

type PersonRow = { id: string; first_name: string; last_name: string | null; preferred_name: string | null };

export default async function NuevaActividadPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const tenant = await requireTenantContext();
  const scopes = await getCreationScopes(tenant.churchId);

  if (!canCreateAnywhere(scopes)) {
    return (
      <>
        <Link href="/app/actividades" className="act-back-link">
          ← Actividades
        </Link>
        <div className="shell-card shell-empty-state">
          <span className="act-module-icon">
            <CalendarPlus size={18} aria-hidden="true" />
          </span>
          <h3>No puedes crear actividades</h3>
          <p>Tu rol no permite crear actividades en la iglesia ni en ninguna sede. Pide acceso a un administrador.</p>
        </div>
      </>
    );
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: church }, campusRes, templates, templateRes, peopleRes] =
    await Promise.all([
      supabase.from("churches").select("timezone").eq("id", tenant.churchId).maybeSingle(),
      supabase
        .from("campuses")
        .select("id, name, timezone")
        .eq("church_id", tenant.churchId)
        .is("archived_at", null)
        .order("name"),
      listActivityTemplates(tenant.churchId, { onlyActive: true }),
      supabase
        .from("activity_templates")
        .select("id, default_title, visibility, location_text, description")
        .eq("church_id", tenant.churchId)
        .is("archived_at", null)
        .eq("active", true),
      // Orden por nombre en la consulta: el límite se aplica sobre la lista ya ordenada.
      supabase
        .from("people")
        .select("id, first_name, last_name, preferred_name, church_people!church_people_person_id_fkey!inner(church_id, archived_at)")
        .eq("church_people.church_id", tenant.churchId)
        .is("church_people.archived_at", null)
        .order("first_name")
        .order("last_name")
        .limit(300),
    ]);
  if (campusRes.error) throw toDomainError(campusRes.error, "No se pudieron cargar las sedes.");
  if (templateRes.error) throw toDomainError(templateRes.error, "No se pudieron cargar las plantillas.");
  if (peopleRes.error) throw toDomainError(peopleRes.error, "No se pudieron cargar las personas.");
  const campusRows = campusRes.data;
  const templateRows = templateRes.data;
  const peopleRows = peopleRes.data;

  const churchTimezone = (church?.timezone as string | null) ?? "UTC";
  const createCampusIds = new Set(scopes.createCampusIds);
  const campuses = ((campusRows ?? []) as { id: string; name: string; timezone: string | null }[]).filter(
    (c) => scopes.createChurch || createCampusIds.has(c.id),
  );
  const allowedCampusIds = new Set(campuses.map((c) => c.id));

  const extras = new Map(
    ((templateRows ?? []) as {
      id: string;
      default_title: string | null;
      visibility: ActivityVisibility;
      location_text: string | null;
      description: string | null;
    }[]).map((row) => [row.id, row]),
  );

  const templateOptions: TemplateOption[] = templates
    .filter((t) => (t.campusId === null ? scopes.createChurch || campuses.length > 0 : allowedCampusIds.has(t.campusId)))
    .map((t) => {
      const extra = extras.get(t.id);
      return {
        id: t.id,
        name: t.name,
        type: t.type,
        campusId: t.campusId,
        campusName: t.campusName,
        scheduleKind: t.scheduleKind,
        defaultLocalStartTime: t.defaultLocalStartTime,
        defaultDurationMinutes: t.defaultDurationMinutes,
        areaCount: t.areaCount,
        positionCount: t.positionCount,
        planItemCount: t.planItemCount,
        defaultTitle: extra?.default_title ?? null,
        visibility: extra?.visibility ?? null,
        locationText: extra?.location_text ?? null,
        description: extra?.description ?? null,
      };
    });

  const people = ((peopleRows ?? []) as PersonRow[])
    .map((p) => ({ id: p.id, name: [p.preferred_name || p.first_name, p.last_name].filter(Boolean).join(" ") }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const initialTemplateId = templateOptions.some((t) => t.id === params.plantilla) ? params.plantilla! : null;
  const initialType = params.tipo && isActivityType(params.tipo) ? params.tipo : null;

  return (
    <>
      <section className="act-page-header">
        <div>
          <Link href="/app/actividades" className="act-back-link">
            ← Actividades
          </Link>
          <div className="act-title-row" style={{ marginTop: 6 }}>
            <span className="act-module-icon">
              <CalendarPlus size={18} aria-hidden="true" />
            </span>
            <div>
              <h1>Nueva actividad</h1>
              <p className="act-subtitle">
                Se crea como borrador. Podrás preparar áreas, puestos y el orden antes de publicarla.
              </p>
            </div>
          </div>
        </div>
      </section>

      <NuevaActividadForm
        campuses={campuses}
        allowChurch={scopes.createChurch}
        churchTimezone={churchTimezone}
        templates={templateOptions}
        people={people}
        todayKey={localDateKey(new Date().toISOString(), churchTimezone)}
        initialTemplateId={initialTemplateId}
        initialType={initialType}
      />
    </>
  );
}
