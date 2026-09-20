import Link from "next/link";
import { Plus, ArrowLeft } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { listWorshipRepertoires } from "@/server/worship/worship-service";
import { ensureWorshipModule } from "../module-gate";
import { primaryButtonStyle, formatDateTime } from "../ui";

export default async function RepertoriosPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureWorshipModule(tenant.churchId);
  if (disabled) return disabled;

  const [repertoires, canManage] = await Promise.all([
    listWorshipRepertoires(tenant.churchId),
    hasCapability(tenant.churchId, "worship.repertoire.manage"),
  ]);

  return (
    <>
      <section style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/app/alabanza" style={{ color: "var(--shell-text-muted)", display: "flex" }}>
            <ArrowLeft size={18} />
          </Link>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Repertorios</h1>
        </div>
        {canManage ? (
          <Link href="/app/alabanza/repertorios/nuevo" style={primaryButtonStyle()}>
            <Plus size={14} /> Nuevo repertorio
          </Link>
        ) : null}
      </section>

      <section className="shell-card" style={{ padding: 20 }}>
        {repertoires.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "32px 16px" }}>
            <p style={{ fontWeight: 600 }}>No hay repertorios todavía.</p>
            <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
              Crea un repertorio para agrupar canciones en un orden concreto.
            </p>
            {canManage ? (
              <Link href="/app/alabanza/repertorios/nuevo" style={{ ...primaryButtonStyle(), marginTop: 14 }}>
                <Plus size={14} /> Crear repertorio
              </Link>
            ) : null}
          </div>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {repertoires.map((repertoire) => (
              <li key={repertoire.id}>
                <Link
                  href={`/app/alabanza/repertorios/${repertoire.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: "var(--shell-radius-sm)",
                    border: "1px solid var(--shell-border)",
                    textDecoration: "none",
                    color: "var(--shell-text)",
                  }}
                >
                  <div>
                    <p style={{ fontSize: 13.5, fontWeight: 600 }}>{repertoire.name}</p>
                    <p style={{ fontSize: 12, color: "var(--shell-text-muted)", marginTop: 2 }}>
                      Actualizado el {formatDateTime(repertoire.updatedAt)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
