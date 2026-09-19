import Link from "next/link";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import {
  listCredentialTypes,
  listCredentialsWithFilters,
  type CredentialStatus,
} from "@/server/serving/credentials-service";
import Pagination from "@/components/shell/Pagination";
import { ensureServingModule } from "../module-gate";
import CredencialesManager from "./CredencialesManager";
import { secondaryButtonStyle, fullName } from "../ui";

type SearchParams = {
  estado?: string;
  page?: string;
  pageSize?: string;
};

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "Todas" },
  { key: "valid", label: "Válidas" },
  { key: "pending", label: "Pendientes" },
  { key: "expired", label: "Vencidas" },
  { key: "proximas", label: "Próximas a vencer" },
];

export default async function CredencialesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const tenant = await requireTenantContext();
  const disabled = await ensureServingModule(tenant.churchId);
  if (disabled) return disabled;

  const canRead = await hasCapability(tenant.churchId, "credential.read");
  if (!canRead) {
    return (
      <div className="shell-card shell-empty-state" style={{ padding: "48px 24px" }}>
        <h3>No tienes acceso a credenciales</h3>
        <p>Esta sección requiere el permiso de lectura de credenciales.</p>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 25;
  const estado = params.estado ?? "";

  const [credentialTypes, { items, total }, canManage, canSeeSensitive, { data: peopleRows }] =
    await Promise.all([
      listCredentialTypes(tenant.churchId),
      listCredentialsWithFilters(tenant.churchId, {
        status: estado && estado !== "proximas" ? (estado as CredentialStatus) : undefined,
        expiringWithinDays: estado === "proximas" ? 30 : undefined,
        page,
        pageSize,
      }),
      hasCapability(tenant.churchId, "credential.manage"),
      hasCapability(tenant.churchId, "credential.sensitive.read"),
      supabase
        .from("church_people")
        .select("people!church_people_person_id_fkey!inner(id, first_name, last_name)")
        .eq("church_id", tenant.churchId)
        .is("archived_at", null)
        .limit(500),
    ]);

  const people = (peopleRows ?? [])
    .map((row) => {
      const person = Array.isArray(row.people) ? row.people[0] : row.people;
      return person
        ? {
            id: person.id as string,
            firstName: person.first_name as string,
            lastName: person.last_name as string | null,
          }
        : null;
    })
    .filter((p): p is { id: string; firstName: string; lastName: string | null } => Boolean(p))
    .sort((a, b) => fullName(a.firstName, a.lastName).localeCompare(fullName(b.firstName, b.lastName), "es"));

  return (
    <>
      <section
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Credenciales</h1>
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
            Estado y vigencia de acreditaciones. LEVITA nunca almacena el documento.
          </p>
        </div>
        <Link href="/app/servicios" style={secondaryButtonStyle()}>
          Volver al resumen
        </Link>
      </section>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <Link
            key={f.key || "todas"}
            href={f.key ? `/app/servicios/credenciales?estado=${f.key}` : "/app/servicios/credenciales"}
            className={`serving-chip ${estado === f.key ? "is-success" : "is-muted"}`}
            style={{ textDecoration: "none", padding: "6px 14px" }}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <CredencialesManager
        credentialTypes={credentialTypes}
        credentials={items}
        people={people}
        canManage={canManage}
        canSeeSensitive={canSeeSensitive}
      />

      {total > pageSize ? <Pagination page={page} pageSize={pageSize} total={total} /> : null}
    </>
  );
}
