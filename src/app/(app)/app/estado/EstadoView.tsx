import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { switchActiveChurch } from "@/server/tenant/active-church-action";
import type { ChurchMembership, ChurchAccessMode } from "@/server/tenant/tenant-context";
import { ESTADO_COPY } from "./estado-copy";

type RecoveryContext = {
  churchId: string;
  churchName: string;
  accessMode: ChurchAccessMode;
  operational: boolean;
  exportAvailable: boolean;
  archivedAt: string | null;
  retentionEndsAt: string | null;
  subscription: {
    status: string;
    planKey: string;
    trialStartedAt: string;
    trialEndsAt: string | null;
    pastDueSince: string | null;
    graceEndsAt: string | null;
    cancelledAt: string | null;
  } | null;
  history: { event: string; fromStatus: string | null; toStatus: string | null; occurredAt: string }[];
};

const dateFormat = new Intl.DateTimeFormat("es-ES", { dateStyle: "long" });

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return dateFormat.format(new Date(value));
}

/**
 * Superficie de recuperación. Se usa dentro del layout cuando la iglesia no es
 * operativa (en ese caso no se renderiza nada de negocio) y en /app/estado.
 */
export async function EstadoView({
  churchId,
  churchName,
  memberships,
}: {
  churchId: string;
  churchName: string;
  memberships: ChurchMembership[];
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_church_recovery_context", { p_church_id: churchId });

  const otherChurches = memberships.filter((m) => m.churchId !== churchId);

  return (
    <section className="estado-recuperacion" aria-labelledby="estado-titulo">
      <p className="shell-church-name">{churchName}</p>

      {error || !data ? (
        <>
          <h1 id="estado-titulo">Estado de la iglesia</h1>
          <p>Esta pantalla es para el propietario o un administrador de la iglesia.</p>
        </>
      ) : (
        <RecoveryContent context={data as RecoveryContext} />
      )}

      {otherChurches.length > 0 ? (
        <div className="estado-cambiar">
          <h2>Cambiar de iglesia</h2>
          <ul>
            {otherChurches.map((m) => (
              <li key={m.churchId}>
                <form action={switchActiveChurch}>
                  <input type="hidden" name="churchId" value={m.churchId} />
                  <button type="submit" className="btn btn-secondary">
                    {m.churchName}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function RecoveryContent({ context }: { context: RecoveryContext }) {
  const copy = ESTADO_COPY[context.accessMode];
  const sub = context.subscription;
  const isPastDue = sub?.status === "past_due" || (context.accessMode === "suspended" && sub?.pastDueSince);
  const title =
    context.accessMode === "suspended" && isPastDue ? "Suspendida por pago pendiente" : copy.title;

  return (
    <>
      <h1 id="estado-titulo">{title}</h1>
      <p>{copy.summary}</p>

      <dl className="estado-datos">
        {sub?.trialEndsAt && context.accessMode === "trial_expired" ? (
          <>
            <dt>Inicio de la prueba</dt>
            <dd>{formatDate(sub.trialStartedAt)}</dd>
            <dt>Fin de la prueba</dt>
            <dd>{formatDate(sub.trialEndsAt)}</dd>
          </>
        ) : null}
        {context.retentionEndsAt ? (
          <>
            <dt>Fin del periodo de retención</dt>
            <dd>{formatDate(context.retentionEndsAt)}</dd>
          </>
        ) : null}
        {sub?.graceEndsAt ? (
          <>
            <dt>Fin del periodo de gracia</dt>
            <dd>{formatDate(sub.graceEndsAt)}</dd>
          </>
        ) : null}
      </dl>

      {copy.nextSteps.length > 0 ? (
        <>
          <h2>Próximos pasos</h2>
          <ul>
            {copy.nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </>
      ) : null}

      {context.exportAvailable ? (
        <p className="estado-exportacion">
          Exportación de tus datos: disponible según tus permisos. El botón para solicitarla todavía no está conectado en esta pantalla.
        </p>
      ) : null}

      {context.history.length > 0 ? (
        <>
          <h2>Historial de la suscripción</h2>
          <ul className="estado-historial">
            {context.history.map((h) => (
              <li key={`${h.occurredAt}-${h.event}`}>
                {formatDate(h.occurredAt)}: {h.fromStatus ?? "—"} → {h.toStatus ?? "—"}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
