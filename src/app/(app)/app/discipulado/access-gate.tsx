import Link from "next/link";
import { hasCapability } from "@/server/tenant/authorize";

/**
 * Estado de «sin permiso» de Discipulado. `course.read` y `path.read` no los
 * tiene todo el mundo —un responsable de grupo, por ejemplo, no los recibe—,
 * así que quien entre sin ellos debe encontrarse una explicación, no un error
 * ni una pantalla vacía. RLS ya devolvería cero filas; esto lo hace legible.
 */
export async function ensureDiscipleshipRead(
  churchId: string,
  capabilities: ("course.read" | "path.read")[],
  what: string,
): Promise<React.ReactNode | null> {
  const results = await Promise.all(capabilities.map((capability) => hasCapability(churchId, capability)));
  if (results.some(Boolean)) return null;

  return (
    <div className="shell-card shell-empty-state" style={{ padding: "48px 24px" }}>
      <h3>No tienes acceso a {what}</h3>
      <p>Pide a quien administra la iglesia que te dé permiso para consultar esta parte de Discipulado.</p>
      <Link href="/app" style={{ fontSize: 12.5, marginTop: 10, color: "var(--shell-brand)" }}>
        Volver al inicio
      </Link>
    </div>
  );
}
