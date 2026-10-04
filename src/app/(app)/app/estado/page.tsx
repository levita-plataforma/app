import { redirect } from "next/navigation";
import { getTenantContext } from "@/server/tenant/tenant-context";
import { EstadoView } from "./EstadoView";

export const metadata = { title: "Estado de la iglesia · LEVITA" };

export default async function EstadoPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/acceso");

  return (
    <EstadoView
      churchId={tenant.churchId}
      churchName={tenant.churchName}
      memberships={tenant.memberships}
    />
  );
}
