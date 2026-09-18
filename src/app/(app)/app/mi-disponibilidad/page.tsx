import { CalendarX2 } from "lucide-react";
import { getTenantContext } from "@/server/tenant/tenant-context";
import { loadMyAvailability } from "@/server/availability/availability-service";
import PeriodosSection from "./PeriodosSection";
import PautaSemanalSection from "./PautaSemanalSection";
import FrecuenciaSection from "./FrecuenciaSection";
import "./mi-disponibilidad.css";

/**
 * «Mi disponibilidad» (Fase 5, DI-01). Todo lo de esta pantalla es de la
 * persona autenticada en su iglesia activa: cuándo no puede servir (periodos
 * concretos y pauta semanal) y con qué frecuencia quiere hacerlo.
 *
 * La iglesia sale del contexto de tenant del servidor, nunca de la URL ni de
 * un campo del formulario (ver docs/adr/0001). Las lecturas van con el cliente
 * del usuario, así que RLS decide; las escrituras, solo por las RPC de
 * `20260923000100_disponibilidad.sql`.
 */

export default async function MiDisponibilidadPage() {
  const tenant = await getTenantContext();

  if (!tenant || !tenant.personId) {
    return (
      <>
        <PageHeader churchName={null} />
        <div className="shell-card shell-empty-state">
          <h3>Todavía no podemos mostrar tu disponibilidad</h3>
          <p>
            Tu cuenta no está vinculada a una ficha de persona en ninguna iglesia. Pide a la
            administración de tu iglesia que vincule tu cuenta y vuelve a entrar aquí.
          </p>
        </div>
      </>
    );
  }

  const data = await loadMyAvailability(tenant.churchId, tenant.personId);

  return (
    <>
      <PageHeader churchName={tenant.churchName} />

      <PeriodosSection
        timezone={data.timezone}
        upcoming={data.upcomingPeriods}
        past={data.pastPeriods}
      />
      <PautaSemanalSection timezone={data.timezone} items={data.weekly} />
      <FrecuenciaSection global={data.global} areas={data.areas} />
    </>
  );
}

function PageHeader({ churchName }: { churchName: string | null }) {
  return (
    <section className="dp-page-header">
      <div className="dp-title-row">
        <span className="dp-module-icon">
          <CalendarX2 size={18} aria-hidden="true" />
        </span>
        <div>
          <h1>Mi disponibilidad</h1>
          <p className="dp-subtitle">
            {churchName
              ? `Cuándo no puedes servir y con qué frecuencia quieres hacerlo en ${churchName}.`
              : "Cuándo no puedes servir y con qué frecuencia quieres hacerlo."}
          </p>
        </div>
      </div>
    </section>
  );
}
