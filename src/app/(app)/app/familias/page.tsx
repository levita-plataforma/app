import { requireTenantContext } from "@/server/tenant/tenant-context";
import { listHouseholds } from "@/server/people/households-service";
import { hasCapability } from "@/server/tenant/authorize";
import FamiliasManager from "./FamiliasManager";

export default async function FamiliasPage() {
  const tenant = await requireTenantContext();
  const [households, canManage] = await Promise.all([
    listHouseholds(tenant.churchId),
    hasCapability(tenant.churchId, "people.manage"),
  ]);

  return (
    <>
      <section>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Familias</h1>
        <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
          Hogares más fuertes, iglesias más fuertes.
        </p>
      </section>

      <FamiliasManager households={households} canManage={canManage} />
    </>
  );
}
