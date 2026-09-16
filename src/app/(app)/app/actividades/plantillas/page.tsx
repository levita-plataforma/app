import Link from "next/link";
import { LayoutTemplate, Plus } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { canCreateAnywhere, getCreationScopes } from "@/server/activities/activities-service";
import { listActivityTemplates } from "@/server/activities/activity-templates-service";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_INFO, isActivityType } from "@/lib/activities/constants";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import { primaryButtonStyle, secondaryButtonStyle } from "../../servicios/ui";
import PlantillasList, { type TemplateCardData } from "./PlantillasList";
import "./plantillas.css";

type SearchParams = { archived?: string; type?: string; campus?: string };

/** Valor del filtro de sede para las plantillas de toda la iglesia. */
const CHURCH_SCOPE = "iglesia";

export default async function PlantillasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const tenant = await requireTenantContext();
  const scopes = await getCreationScopes(tenant.churchId);

  const canManageSomewhere = scopes.templatesChurch || scopes.templatesCampusIds.length > 0;
  const canCreate = canCreateAnywhere(scopes);

  const header = (
    <section className="tpl-header">
      <div className="tpl-header-title">
        <span className="tpl-icon" aria-hidden="true">
          <LayoutTemplate />
        </span>
        <div>
          <h1>Plantillas de actividad</h1>
          <p className="tpl-lead">
            Estructuras reutilizables para crear actividades con horario, áreas de servicio, puestos y orden del
            servicio ya preparados.
          </p>
        </div>
      </div>
      <div className="tpl-actions">
        <Link href="/app/actividades" className="tpl-btn" style={secondaryButtonStyle()}>
          Volver a actividades
        </Link>
        {canManageSomewhere ? (
          <Link href="/app/actividades/plantillas/nueva" className="tpl-btn" style={primaryButtonStyle()}>
            <Plus size={14} aria-hidden="true" /> Nueva plantilla
          </Link>
        ) : null}
      </div>
    </section>
  );

  if (!canManageSomewhere && !canCreate) {
    return (
      <div className="tpl-root">
        {header}
        <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
          <h3>No tienes acceso a las plantillas</h3>
          <p>Las plantillas están disponibles para quienes crean actividades o gestionan plantillas en su iglesia o sede.</p>
        </div>
      </div>
    );
  }

  const includeArchived = canManageSomewhere && params.archived === "true";
  const typeFilter = params.type && isActivityType(params.type) ? params.type : "";
  const campusFilter = params.campus ?? "";

  const supabase = await createSupabaseServerClient();
  const [templates, { data: campusRows }] = await Promise.all([
    listActivityTemplates(tenant.churchId, { includeArchived, onlyActive: !canManageSomewhere }),
    supabase
      .from("campuses")
      .select("id, name")
      .eq("church_id", tenant.churchId)
      .is("archived_at", null)
      .order("name"),
  ]);
  const campuses = (campusRows ?? []) as { id: string; name: string }[];

  const filtered = templates.filter((t) => {
    if (typeFilter && t.type !== typeFilter) return false;
    if (campusFilter === CHURCH_SCOPE && t.campusId !== null) return false;
    if (campusFilter && campusFilter !== CHURCH_SCOPE && t.campusId !== campusFilter) return false;
    return true;
  });

  const cards: TemplateCardData[] = filtered.map((t) => {
    const canManage = scopes.templatesChurch || (t.campusId !== null && scopes.templatesCampusIds.includes(t.campusId));
    const canUse =
      t.active &&
      !t.archivedAt &&
      (scopes.createChurch ||
        (t.campusId === null ? scopes.createCampusIds.length > 0 : scopes.createCampusIds.includes(t.campusId)));
    return { ...t, canManage, canUse };
  });

  const hasFilters = Boolean(typeFilter || campusFilter);
  const selectStyle: React.CSSProperties = { ...authInputStyle, fontSize: 13 };

  return (
    <div className="tpl-root">
      {header}

      <form className="shell-card serving-toolbar tpl-toolbar" method="get">
        <div className="tpl-field" style={{ flex: "1 1 160px" }}>
          <label htmlFor="tpl-filter-type" style={authLabelStyle}>
            Tipo
          </label>
          <select id="tpl-filter-type" name="type" defaultValue={typeFilter} style={selectStyle}>
            <option value="">Todos los tipos</option>
            {ACTIVITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {ACTIVITY_TYPE_INFO[type].label}
              </option>
            ))}
          </select>
        </div>
        {campuses.length > 0 ? (
          <div className="tpl-field" style={{ flex: "1 1 160px" }}>
            <label htmlFor="tpl-filter-campus" style={authLabelStyle}>
              Sede
            </label>
            <select id="tpl-filter-campus" name="campus" defaultValue={campusFilter} style={selectStyle}>
              <option value="">Todas</option>
              <option value={CHURCH_SCOPE}>Toda la iglesia</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {canManageSomewhere ? (
          <label className="tpl-check">
            <input type="checkbox" name="archived" value="true" defaultChecked={includeArchived} />
            Incluir archivadas
          </label>
        ) : null}
        <button type="submit" className="tpl-btn" style={secondaryButtonStyle()}>
          Filtrar
        </button>
        {hasFilters || includeArchived ? (
          <Link href="/app/actividades/plantillas" className="tpl-btn" style={secondaryButtonStyle()}>
            Limpiar
          </Link>
        ) : null}
      </form>

      {!canManageSomewhere ? (
        <p className="tpl-note">
          Puedes usar las plantillas activas para crear actividades. Solo quienes gestionan plantillas pueden
          modificarlas.
        </p>
      ) : null}

      {templates.length === 0 ? (
        <div className="shell-card shell-empty-state" style={{ padding: "48px 24px" }}>
          <span className="tpl-icon" aria-hidden="true" style={{ marginBottom: 4 }}>
            <LayoutTemplate />
          </span>
          <h3>Todavía no hay plantillas</h3>
          <p>
            Una plantilla guarda la forma habitual de una actividad: tipo, horario por defecto, áreas de servicio,
            puestos necesarios y orden del servicio. Al crear una actividad desde ella se copia esa estructura.
          </p>
          <p>Por ejemplo, podrías preparar plantillas como:</p>
          <div className="tpl-empty-examples" aria-label="Ejemplos de plantillas">
            <span className="serving-chip">Culto domingo 11:00</span>
            <span className="serving-chip">Reunión de oración</span>
            <span className="serving-chip">Limpieza semanal</span>
          </div>
          {canManageSomewhere && !includeArchived ? (
            <p className="tpl-note">Si archivaste alguna, marca «Incluir archivadas» para verla.</p>
          ) : null}
          {canManageSomewhere ? (
            <Link
              href="/app/actividades/plantillas/nueva"
              className="tpl-btn"
              style={{ ...primaryButtonStyle(), marginTop: 14 }}
            >
              <Plus size={14} aria-hidden="true" /> Crear la primera plantilla
            </Link>
          ) : (
            <p className="tpl-note">Cuando alguien con permiso cree plantillas, aparecerán aquí.</p>
          )}
        </div>
      ) : cards.length === 0 ? (
        <div className="shell-card shell-empty-state">
          <h3>Ninguna plantilla coincide con los filtros</h3>
          <p>Prueba con otro tipo o sede.</p>
        </div>
      ) : (
        <PlantillasList templates={cards} />
      )}
    </div>
  );
}
