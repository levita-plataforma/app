import Link from "next/link";
import { Send, Clock3, FileText, AlertTriangle, Plus, LayoutTemplate, Users2 } from "lucide-react";
import StatCard from "@/components/shell/StatCard";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { getCommunicationsKpis, listCommunications } from "@/server/communications/communications-service";
import { ensureCommunicationsModule } from "./module-gate";
import { primaryButtonStyle, secondaryButtonStyle, formatDateTime } from "./ui";

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  scheduled: "Programada",
  processing: "Procesando",
  queued: "En cola, sin enviar",
  sent: "Enviada",
  partially_sent: "Enviada parcialmente",
  failed: "Fallida",
  cancelled: "Cancelada",
};

export default async function ComunicacionPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureCommunicationsModule(tenant.churchId);
  if (disabled) return disabled;

  const [kpis, recent, canCreate] = await Promise.all([
    getCommunicationsKpis(tenant.churchId),
    listCommunications(tenant.churchId, { limit: 8 }),
    hasCapability(tenant.churchId, "communications.create"),
  ]);

  return (
    <>
      <section
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Comunicación</h1>
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
            Envía comunicaciones segmentadas a tu comunidad.
          </p>
        </div>
        {canCreate ? (
          <Link href="/app/comunicacion/nueva" style={primaryButtonStyle()}>
            <Plus size={14} /> Nueva comunicación
          </Link>
        ) : null}
      </section>

      <div className="stat-grid">
        <StatCard
          icon={Send}
          value={String(kpis.sentThisMonth)}
          label="Enviadas este mes"
          accentBg="var(--mod-communications-bg)"
          accentFg="var(--mod-communications-fg)"
        />
        <StatCard
          icon={Clock3}
          value={String(kpis.scheduled)}
          label="Programadas"
          accentBg="var(--mod-communications-bg)"
          accentFg="var(--mod-communications-fg)"
        />
        <StatCard
          icon={FileText}
          value={String(kpis.drafts)}
          label="Borradores"
          accentBg="var(--mod-communications-bg)"
          accentFg="var(--mod-communications-fg)"
        />
        <StatCard
          icon={AlertTriangle}
          value={String(kpis.recentFailures)}
          label="Fallos recientes"
          accentBg="var(--mod-communications-bg)"
          accentFg="var(--mod-communications-fg)"
        />
      </div>

      <section style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/app/comunicacion?status=scheduled" style={secondaryButtonStyle()}>
          <Clock3 size={14} /> Programadas
        </Link>
        <Link href="/app/comunicacion/plantillas" style={secondaryButtonStyle()}>
          <LayoutTemplate size={14} /> Plantillas
        </Link>
        <Link href="/app/comunicacion/segmentos" style={secondaryButtonStyle()}>
          <Users2 size={14} /> Segmentos
        </Link>
      </section>

      <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>Últimas comunicaciones</h2>

        {recent.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "32px 16px" }}>
            <p style={{ fontWeight: 600 }}>No hay comunicaciones todavía.</p>
            <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
              Crea tu primera comunicación para mantener informada a tu comunidad.
            </p>
            {canCreate ? (
              <Link href="/app/comunicacion/nueva" style={{ ...primaryButtonStyle(), marginTop: 14 }}>
                <Plus size={14} /> Nueva comunicación
              </Link>
            ) : null}
          </div>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recent.map((comm) => (
              <li key={comm.id}>
                <Link
                  href={`/app/comunicacion/${comm.id}`}
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
                    <p style={{ fontSize: 13.5, fontWeight: 600 }}>{comm.title}</p>
                    <p style={{ fontSize: 12, color: "var(--shell-text-muted)", marginTop: 2 }}>
                      {STATUS_LABELS[comm.status] ?? comm.status} · {formatDateTime(comm.sentAt ?? comm.scheduledAt ?? comm.createdAt)}
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
