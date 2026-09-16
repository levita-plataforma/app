import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import IglesiaForm from "./IglesiaForm";

export default async function ConfiguracionIglesiaPage() {
  const tenant = await requireTenantContext();
  const canManage = await hasCapability(tenant.churchId, "church.settings.manage");

  const supabase = await createSupabaseServerClient();
  const { data: church } = await supabase
    .from("churches")
    .select("name, slug, timezone, currency, locale, settings, branding")
    .eq("id", tenant.churchId)
    .single();

  if (!church) {
    return (
      <div className="shell-card shell-empty-state">
        <h3>No se pudo cargar la configuración</h3>
        <p>Inténtalo de nuevo en unos segundos.</p>
      </div>
    );
  }

  const settings = (church.settings ?? {}) as Record<string, string | undefined>;
  const branding = (church.branding ?? {}) as Record<string, string | undefined>;

  return (
    <>
      <section>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Datos de la iglesia</h1>
        <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
          {tenant.churchName} · levita.app/i/{church.slug}
        </p>
      </section>

      {canManage ? (
        <IglesiaForm
          name={church.name}
          displayName={branding.display_name ?? ""}
          accentColor={branding.accent_color ?? "#c89b4a"}
          timezone={church.timezone}
          currency={church.currency}
          country={settings.country ?? "España"}
          email={settings.email ?? ""}
          phone={settings.phone ?? ""}
          website={settings.website ?? ""}
        />
      ) : (
        <div className="shell-card shell-empty-state">
          <h3>Solo el propietario o administradores pueden editar esta sección</h3>
          <p>Consulta con el propietario de tu iglesia si necesitas cambiar estos datos.</p>
        </div>
      )}
    </>
  );
}
