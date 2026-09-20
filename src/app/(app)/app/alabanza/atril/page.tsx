import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { listWorshipRepertoires, listWorshipRepertoireSongs } from "@/server/worship/worship-service";
import { ensureWorshipModule } from "../module-gate";
import AtrilSelector from "./AtrilSelector";
import AtrilViewer from "./AtrilViewer";

export default async function AtrilPage({
  searchParams,
}: {
  searchParams: Promise<{ repertorio?: string }>;
}) {
  const tenant = await requireTenantContext();
  const disabled = await ensureWorshipModule(tenant.churchId);
  if (disabled) return disabled;

  await hasCapability(tenant.churchId, "worship.atril.use");

  const { repertorio } = await searchParams;

  const repertoires = await listWorshipRepertoires(tenant.churchId);

  if (!repertorio) {
    return <AtrilSelector repertoires={repertoires} />;
  }

  const items = await listWorshipRepertoireSongs(tenant.churchId, repertorio);
  const current = repertoires.find((r) => r.id === repertorio);

  if (!current || items.length === 0) {
    return <AtrilSelector repertoires={repertoires} emptyMessage="Aún no hay un repertorio disponible para abrir." />;
  }

  return <AtrilViewer repertoireName={current.name} items={items} />;
}
