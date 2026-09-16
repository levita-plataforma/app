import { Users, CalendarDays, UsersRound, TrendingUp } from "lucide-react";
import ModuleGrid from "@/components/shell/ModuleGrid";
import StatCard from "@/components/shell/StatCard";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

export default async function InicioPage() {
  const tenant = await requireTenantContext();
  const supabase = await createSupabaseServerClient();

  const [{ count: peopleCount }, { count: activitiesCount }, { data: enabledModules }] =
    await Promise.all([
      supabase
        .from("church_people")
        .select("id", { count: "exact", head: true })
        .eq("church_id", tenant.churchId)
        .is("archived_at", null),
      supabase
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("church_id", tenant.churchId)
        .is("archived_at", null),
      supabase
        .from("church_modules")
        .select("module_key")
        .eq("church_id", tenant.churchId)
        .in("status", ["enabled", "trial"]),
    ]);

  const enabledModuleKeys = new Set((enabledModules ?? []).map((m) => m.module_key as string));

  return (
    <>
      <section>
        <h1 style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: 28, fontWeight: 600 }}>
          ¡Bienvenido a {tenant.churchName}!
        </h1>
        <p style={{ color: "var(--shell-text-muted)", marginTop: 4, fontSize: 14 }}>
          Aquí tienes un resumen de la actividad de tu iglesia.
        </p>
      </section>

      <div className="stat-grid">
        <StatCard
          icon={Users}
          value={String(peopleCount ?? 0)}
          label="Personas"
          accentBg="var(--mod-people-bg)"
          accentFg="var(--mod-people-fg)"
        />
        <StatCard
          icon={CalendarDays}
          value={String(activitiesCount ?? 0)}
          label="Actividades"
          accentBg="var(--mod-events-bg)"
          accentFg="var(--mod-events-fg)"
        />
        <StatCard
          icon={UsersRound}
          value="0"
          label="Voluntarios activos"
          accentBg="var(--mod-serving-bg)"
          accentFg="var(--mod-serving-fg)"
        />
        <StatCard
          icon={TrendingUp}
          value="—"
          label="Cobertura de turnos"
          accentBg="var(--mod-analytics-bg)"
          accentFg="var(--mod-analytics-fg)"
        />
      </div>

      <ModuleGrid enabledModuleKeys={enabledModuleKeys} />

      <div className="shell-two-col">
        <div className="shell-card list-card">
          <div className="list-card-header">
            <h2>Próximos eventos</h2>
          </div>
          <div className="shell-empty-state" style={{ padding: "32px 12px" }}>
            <h3>Todavía no hay eventos programados</h3>
            <p>Cuando publiques una actividad, aparecerá aquí.</p>
          </div>
        </div>

        <div className="shell-card list-card">
          <div className="list-card-header">
            <h2>Actividad reciente</h2>
          </div>
          <div className="shell-empty-state" style={{ padding: "32px 12px" }}>
            <h3>Sin actividad todavía</h3>
            <p>Los cambios relevantes de tu iglesia aparecerán aquí.</p>
          </div>
        </div>
      </div>
    </>
  );
}
