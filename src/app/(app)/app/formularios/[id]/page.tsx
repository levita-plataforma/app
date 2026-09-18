import { notFound } from "next/navigation";
import Link from "next/link";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { getForm } from "@/server/forms/forms-service";
import { ensureEventsModule } from "../module-gate";
import FormularioEditor from "./FormularioEditor";

export default async function FormularioFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await requireTenantContext();
  const disabled = await ensureEventsModule(tenant.churchId);
  if (disabled) return disabled;

  const [form, canManage, canManageSensitive] = await Promise.all([
    getForm(tenant.churchId, id),
    hasCapability(tenant.churchId, "form.manage"),
    hasCapability(tenant.churchId, "form.sensitive.manage"),
  ]);

  if (!form) notFound();

  return (
    <>
      <section>
        <Link href="/app/formularios" style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}>
          ← Formularios
        </Link>
        <h1 style={{ fontSize: 21, fontWeight: 600, marginTop: 6 }}>{form.name}</h1>
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 2 }}>
          {form.archivedAt ? "Archivado" : form.active ? "Activo" : "Inactivo"} · v{form.currentVersion} ·{" "}
          {form.submissionCount} respuesta{form.submissionCount === 1 ? "" : "s"}
        </p>
      </section>

      <FormularioEditor form={form} canManage={canManage} canManageSensitive={canManageSensitive} />
    </>
  );
}
