import { NextResponse } from "next/server";
import { getPublicEventBySlug } from "@/server/events/public-events-service";
import { generateEventIcs } from "@/server/events/ics-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ churchSlug: string; eventSlug: string }> },
) {
  const { churchSlug, eventSlug } = await params;
  const event = await getPublicEventBySlug(churchSlug, eventSlug);

  if (!event) {
    return new NextResponse("Not found", { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://levitaapp.com";
  const publicUrl = `${appUrl}/i/${churchSlug}/eventos/${eventSlug}`;

  const ics = generateEventIcs({
    eventId: event.eventId,
    title: event.title,
    description: event.publicDescription ?? event.shortDescription,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    locationText: event.locationText,
    publicUrl,
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="evento.ics"',
    },
  });
}
