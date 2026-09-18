import type { Metadata } from "next";
import Link from "next/link";
import AuthCard from "@/components/shell/AuthCard";
import CancelarInscripcionForm from "./CancelarInscripcionForm";
import { getPublicEventBySlug } from "@/server/events/public-events-service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

type PageParams = { churchSlug: string; eventSlug: string };
type SearchParams = { code?: string; token?: string; status?: string; cancelled?: string };

export default async function ConfirmacionPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<SearchParams>;
}) {
  const { churchSlug, eventSlug } = await params;
  const { code, token, status, cancelled } = await searchParams;

  const event = await getPublicEventBySlug(churchSlug, eventSlug);

  if (cancelled === "1") {
    return (
      <AuthCard title="Inscripción cancelada" subtitle="Tu plaza ha quedado liberada.">
        <p style={{ fontSize: 13.5, color: "var(--shell-text-muted)" }}>
          Hemos cancelado tu inscripción correctamente. Si cambias de opinión, puedes volver a inscribirte.
        </p>
        <Link
          href={`/i/${churchSlug}/eventos/${eventSlug}`}
          style={{ display: "inline-block", marginTop: 16, fontSize: 13, fontWeight: 600, color: "var(--shell-brand)" }}
        >
          Volver al evento
        </Link>
      </AuthCard>
    );
  }

  // Honeypot: si el código viene vacío, el envío fue descartado en el
  // servidor como probable bot (§37). Se muestra el mismo mensaje genérico
  // de agradecimiento, sin código ni opción de cancelar, para que el
  // comportamiento sea indistinguible de un envío real.
  const hasValidRegistration = Boolean(code && token);

  const isWaitlisted = status === "waitlisted";

  return (
    <AuthCard
      title={hasValidRegistration && isWaitlisted ? "Estás en lista de espera" : "¡Inscripción confirmada!"}
      subtitle={
        hasValidRegistration
          ? isWaitlisted
            ? "Te avisaremos si se libera una plaza."
            : "Gracias por inscribirte."
          : "Gracias por tu interés."
      }
    >
      {hasValidRegistration ? (
        <>
          <p style={{ fontSize: 13.5, color: "var(--shell-text-muted)", marginBottom: 4 }}>Tu código de inscripción</p>
          <p
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "var(--shell-text)",
              marginBottom: 16,
            }}
          >
            {code}
          </p>

          {event ? (
            <p style={{ fontSize: 13, color: "var(--shell-text-muted)", marginBottom: 16 }}>{event.title}</p>
          ) : null}

          {token ? <CancelarInscripcionForm churchSlug={churchSlug} eventSlug={eventSlug} cancelToken={token} /> : null}
        </>
      ) : (
        <p style={{ fontSize: 13.5, color: "var(--shell-text-muted)" }}>
          Hemos recibido tu solicitud. Si cumple los requisitos, recibirás la confirmación por correo en breve.
        </p>
      )}

      <Link
        href={`/i/${churchSlug}/eventos/${eventSlug}`}
        style={{ display: "inline-block", marginTop: 20, fontSize: 12.5, fontWeight: 600, color: "var(--shell-brand)" }}
      >
        Volver al evento
      </Link>
    </AuthCard>
  );
}
