import Link from "next/link";
import { redirect } from "next/navigation";
import AuthCard from "@/components/shell/AuthCard";
import { resolverDestinoAcceso } from "@/server/auth/acceso-servidor";
import { getTenantContext } from "@/server/tenant/tenant-context";
import { switchActiveChurch } from "@/server/tenant/active-church-action";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import "../../app-shell.css";

export const metadata = { title: "Elige dónde entrar · LEVITA" };

/**
 * Elección de contexto para quien es operador de plataforma y también miembro de
 * alguna iglesia, y no tiene un último contexto recordado. Son dos contextos
 * distintos: la consola no es una iglesia más.
 *
 * Para el resto de cuentas esta ruta no muestra nada: redirige al destino que
 * corresponde (consola o app).
 */
export default async function ContextoPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/acceso");

  const destino = await resolverDestinoAcceso();
  if (destino !== "/acceso/contexto") redirect(destino);

  const tenant = await getTenantContext();
  const iglesias = tenant?.memberships ?? [];

  return (
    <AuthCard title="¿Dónde quieres entrar?" subtitle="Tu cuenta tiene acceso a la administración de LEVITA y a tu iglesia.">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Link href="/operacion" className="shell-card" style={opcionStyle}>
          <strong>Administración LEVITA</strong>
          <span style={detalleStyle}>Consola de plataforma: iglesias, altas, soporte y seguridad.</span>
        </Link>

        {iglesias.map((m) => (
          <form key={m.churchId} action={switchActiveChurch}>
            <input type="hidden" name="churchId" value={m.churchId} />
            <button type="submit" className="shell-card" style={{ ...opcionStyle, width: "100%", textAlign: "left", cursor: "pointer" }}>
              <strong>{m.churchName}</strong>
              <span style={detalleStyle}>App de la iglesia.</span>
            </button>
          </form>
        ))}

        <p style={{ ...detalleStyle, margin: "4px 0 0" }}>
          La próxima vez entrarás directamente en el último sitio que hayas usado.
        </p>
      </div>
    </AuthCard>
  );
}

const opcionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "14px 16px",
  textDecoration: "none",
  color: "inherit",
  border: "1px solid var(--shell-border)",
  font: "inherit",
};

const detalleStyle: React.CSSProperties = { fontSize: 12.5, color: "var(--shell-text-muted)" };
