import { redirect } from "next/navigation";
import AuthCard from "@/components/shell/AuthCard";
import InscripcionForm from "./InscripcionForm";
import {
  getPublicEventBySlug,
  getPublicFormForEvent,
  getPublicConsentDefinitions,
} from "@/server/events/public-events-service";

type PageParams = { churchSlug: string; eventSlug: string };

export default async function InscripcionPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { churchSlug, eventSlug } = await params;
  const event = await getPublicEventBySlug(churchSlug, eventSlug);

  if (!event) {
    redirect(`/i/${churchSlug}/eventos/${eventSlug}`);
  }

  if (event.registrationStatus !== "open" && event.registrationStatus !== "full") {
    redirect(`/i/${churchSlug}/eventos/${eventSlug}`);
  }

  const [formFields, consentDefinitions] = await Promise.all([
    getPublicFormForEvent(event.eventId),
    getPublicConsentDefinitions(churchSlug),
  ]);

  return (
    <AuthCard title={`Inscripción · ${event.title}`} subtitle="Completa tus datos para reservar tu plaza.">
      <InscripcionForm
        churchSlug={churchSlug}
        eventSlug={eventSlug}
        eventId={event.eventId}
        registrationType={event.registrationType}
        formFields={formFields}
        consentDefinitions={consentDefinitions}
      />
    </AuthCard>
  );
}
