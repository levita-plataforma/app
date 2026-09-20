import { redirect } from "next/navigation";
import { getOperatorContext, tiene, type OperatorContext, type PlatformCapability } from "@/server/platform/platform-service";

/**
 * Puerta del panel de operación.
 *
 * Quien no tiene sesión va a /acceso. Quien la tiene pero no es del equipo ve un
 * mensaje seco, sin decirle qué le falta ni confirmarle que este sitio existe
 * para alguien: a quien no debería estar aquí no se le dibuja el mapa.
 *
 * Esto no sustituye a nada: cada RPC comprueba la capacidad por su cuenta. La
 * guarda evita pintar una pantalla que luego no haría nada, que es distinto de
 * proteger.
 */
export async function requireOperator(capacidad?: PlatformCapability): Promise<
  { contexto: OperatorContext } | { bloqueado: React.ReactNode }
> {
  const contexto = await getOperatorContext();

  if (!contexto) {
    const { createSupabaseServerClient } = await import("@/server/supabase/server-client");
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/acceso");
    return { bloqueado: <AccesoRestringido /> };
  }

  if (capacidad && !tiene(contexto, capacidad)) {
    return { bloqueado: <SinCapacidad /> };
  }

  return { contexto };
}

function AccesoRestringido() {
  return (
    <div style={{ minHeight: "100svh", display: "grid", placeItems: "center", background: "var(--shell-bg)", padding: 20 }}>
      <div className="shell-card shell-empty-state" style={{ padding: 40, maxWidth: 420, textAlign: "center" }}>
        <h3>Acceso restringido</h3>
        <p>Esta sección es solo para el equipo de operación de LEVITA.</p>
      </div>
    </div>
  );
}

function SinCapacidad() {
  return (
    <div className="shell-card shell-empty-state" style={{ padding: 40, textAlign: "center" }}>
      <h3>No tienes acceso a esta parte</h3>
      <p>Tu cuenta de operación no incluye este permiso. Pídeselo a quien gestiona el equipo.</p>
    </div>
  );
}
