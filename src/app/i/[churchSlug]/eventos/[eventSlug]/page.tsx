import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicEventBySlug } from "@/server/events/public-events-service";
import { availableSpots, formatEventDateRange, registrationStatusMessage, toneColor } from "./ui";

type PageParams = { churchSlug: string; eventSlug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { churchSlug, eventSlug } = await params;
  const event = await getPublicEventBySlug(churchSlug, eventSlug);

  if (!event) return {};

  return {
    title: `${event.title} | LEVITA`,
    description: event.shortDescription ?? undefined,
    openGraph: {
      title: event.title,
      description: event.shortDescription ?? undefined,
      images: event.coverImageUrl ? [event.coverImageUrl] : undefined,
    },
  };
}

export default async function EventoPublicoPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { churchSlug, eventSlug } = await params;
  const event = await getPublicEventBySlug(churchSlug, eventSlug);

  if (!event) notFound();

  const spots = availableSpots(event);
  const statusInfo = registrationStatusMessage(event.registrationStatus);
  const canRegister = event.registrationStatus === "open" || event.registrationStatus === "full";
  const basePath = `/i/${churchSlug}/eventos/${eventSlug}`;

  return (
    <div style={{ minHeight: "100svh", background: "var(--shell-bg)", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "16 / 9",
          maxHeight: 420,
          background: event.coverImageUrl
            ? `center / cover no-repeat url(${event.coverImageUrl})`
            : "linear-gradient(135deg, var(--shell-brand) 0%, var(--shell-brand-soft) 100%)",
          display: "flex",
          alignItems: "flex-end",
        }}
      >
        {!event.coverImageUrl ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "absolute",
              inset: 0,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 600, color: "#fff", opacity: 0.85, letterSpacing: "0.04em" }}>
              {event.churchName}
            </span>
          </div>
        ) : null}
      </div>

      <main style={{ flex: 1, padding: "24px 18px 40px", maxWidth: 640, margin: "0 auto", width: "100%" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--shell-text)", marginBottom: 8, lineHeight: 1.25 }}>
          {event.title}
        </h1>

        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--shell-brand)", marginBottom: 4 }}>
          {formatEventDateRange(event)}
        </p>

        {event.locationText ? (
          <p style={{ fontSize: 13.5, color: "var(--shell-text-muted)", marginBottom: 16 }}>{event.locationText}</p>
        ) : (
          <div style={{ marginBottom: 16 }} />
        )}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: toneColor[statusInfo.tone],
              padding: "5px 10px",
              borderRadius: "var(--shell-radius-sm)",
              background: "var(--shell-surface)",
              border: "1px solid var(--shell-border)",
            }}
          >
            {statusInfo.label}
          </span>

          {spots !== null && event.registrationStatus !== "full" ? (
            <span style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
              {spots} {spots === 1 ? "plaza disponible" : "plazas disponibles"}
            </span>
          ) : null}
        </div>

        {event.shortDescription ? (
          <p style={{ fontSize: 14.5, color: "var(--shell-text)", marginBottom: 16, fontWeight: 500 }}>
            {event.shortDescription}
          </p>
        ) : null}

        {event.publicDescription ? (
          <p
            style={{
              fontSize: 14,
              color: "var(--shell-text-muted)",
              marginBottom: 24,
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
            }}
          >
            {event.publicDescription}
          </p>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
          {canRegister ? (
            <Link
              href={`${basePath}/inscripcion`}
              style={{
                display: "inline-flex",
                justifyContent: "center",
                padding: "13px 20px",
                borderRadius: "var(--shell-radius-md)",
                background: "var(--shell-brand)",
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {event.registrationStatus === "full" ? "Unirme a la lista de espera" : "Inscríbete"}
            </Link>
          ) : null}

          <a
            href={`${basePath}/ics`}
            style={{
              display: "inline-flex",
              justifyContent: "center",
              padding: "11px 20px",
              borderRadius: "var(--shell-radius-md)",
              border: "1px solid var(--shell-border)",
              background: "var(--shell-surface)",
              color: "var(--shell-text)",
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Añadir al calendario
          </a>
        </div>

        {event.contactEmail || event.contactPhone ? (
          <div className="public-card" style={{ padding: 16, marginBottom: 24 }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--shell-text)", marginBottom: 6 }}>Contacto</p>
            {event.contactEmail ? (
              <p style={{ fontSize: 13, color: "var(--shell-text-muted)" }}>
                <a href={`mailto:${event.contactEmail}`} style={{ color: "var(--shell-brand)" }}>
                  {event.contactEmail}
                </a>
              </p>
            ) : null}
            {event.contactPhone ? (
              <p style={{ fontSize: 13, color: "var(--shell-text-muted)" }}>{event.contactPhone}</p>
            ) : null}
          </div>
        ) : null}

        <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)", textAlign: "center", marginTop: 12 }}>
          Un evento de {event.churchName}, gestionado con LEVITA.
        </p>
      </main>
    </div>
  );
}
