import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import ImportarWizard from "./ImportarWizard";

export default async function ImportarPersonasPage() {
  const tenant = await requireTenantContext();
  await requireCapability(tenant.churchId, "people.import");

  return (
    <>
      <section>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Importar personas</h1>
        <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
          Sube un archivo CSV, revisa el mapeo y confirma antes de crear nada.
        </p>
      </section>

      <ImportarWizard />
    </>
  );
}
