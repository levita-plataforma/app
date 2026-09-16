import { redirect } from "next/navigation";
import { BrandMark } from "@/components/Logo";
import SidebarNav from "@/components/shell/SidebarNav";
import ShellHeader from "@/components/shell/ShellHeader";
import { getTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import "../app-shell.css";

/**
 * Layout de la aplicación autenticada. Resuelve el contexto de tenant una
 * sola vez (getTenantContext usa React cache) y los módulos habilitados
 * para ocultar navegación no disponible. Ver Fase 0 §22-23.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenant = await getTenantContext();

  if (!tenant) {
    redirect("/acceso");
  }

  const supabase = await createSupabaseServerClient();

  const [{ data: enabledModules }, { data: person }, { data: roles }] = await Promise.all([
    supabase
      .from("church_modules")
      .select("module_key")
      .eq("church_id", tenant.churchId)
      .in("status", ["enabled", "trial"]),
    supabase.from("people").select("first_name, last_name").eq("id", tenant.personId).single(),
    supabase
      .from("church_people_roles")
      .select("role_key, roles(name)")
      .eq("church_id", tenant.churchId)
      .limit(1),
  ]);

  const enabledModuleKeys = new Set(
    (enabledModules ?? []).map((m) => m.module_key as string),
  );

  const displayName = person
    ? [person.first_name, person.last_name].filter(Boolean).join(" ")
    : "Tu cuenta";

  const roleRow = roles?.[0] as { role_key: string; roles: { name: string } | { name: string }[] | null } | undefined;
  const rolesRelation = roleRow?.roles;
  const roleName = Array.isArray(rolesRelation) ? rolesRelation[0]?.name : rolesRelation?.name;
  const roleLabel = roleName ?? "Miembro";

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="shell-brand">
          <BrandMark style={{ color: "var(--shell-brand)" }} />
          <span>LEVITA</span>
        </div>

        <div className="shell-church">
          <p className="shell-church-name">{tenant.churchName}</p>
        </div>

        <SidebarNav enabledModuleKeys={enabledModuleKeys} />
      </aside>

      <div className="shell-main">
        <ShellHeader tenant={tenant} displayName={displayName} roleLabel={roleLabel} />
        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
