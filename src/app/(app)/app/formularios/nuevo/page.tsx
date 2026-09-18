import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { ensureEventsModule } from "../module-gate";
import NuevoFormularioForm from "./NuevoFormularioForm";

export default async function NuevoFormularioPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureEventsModule(tenant.churchId);
  if (disabled) return disabled;

  // requireCapability lanza DomainError si no tiene permiso; el boundary de
  // errores de la app se encarga de mostrarlo. No hay try/catch aquí.
  await requireCapability(tenant.churchId, "form.manage");

  return (
    <>
      <section>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Nuevo formulario</h1>
        <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
          Define los metadatos del formulario. Podrás añadir campos en el siguiente paso.
        </p>
      </section>

      <NuevoFormularioForm />
    </>
  );
}
