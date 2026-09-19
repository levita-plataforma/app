import type { Metadata } from "next";
import AuthCard from "@/components/shell/AuthCard";
import DarDeBajaForm from "./DarDeBajaForm";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Página pública de baja de una categoría opcional de comunicación. No
 * requiere sesión: el propio token (app.unsubscribe_by_token, tenant-safe
 * por construcción) resuelve la iglesia y la persona. La baja solo ocurre
 * al enviar el formulario (POST), nunca al cargar la página, para no
 * quedar expuesta a prefetch/crawlers.
 */
export default async function BajaComunicacionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <AuthCard title="Darte de baja" subtitle="Confirma que quieres dejar de recibir esta categoría de comunicaciones.">
      <DarDeBajaForm token={token} />
    </AuthCard>
  );
}
