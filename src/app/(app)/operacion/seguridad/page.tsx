import Link from "next/link";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { listChurches, tiene } from "@/server/platform/platform-service";
import { requireOperator } from "../guard";
import { fechaCorta } from "../estado-tenant";
import GestionMfa from "./GestionMfa";
import "../../app-shell.css";

/**
 * Seguridad en la consola: iglesias bloqueadas por seguridad y el segundo factor
 * de la propia cuenta.
 *
 * El listado no enseña el motivo interno: se ve en la ficha, y solo con
 * platform.church_security.read. El segundo factor es recomendado, no
 * obligatorio (decisión de Carlos, 21-sep-2026): esta pantalla informa y
 * permite activarlo.
 */
export default async function SeguridadOperacionPage() {
  const resultado = await requireOperator();
  if ("bloqueado" in resultado) return resultado.bloqueado;

  const puedeVerIglesias = tiene(resultado.contexto, "platform.churches.read");
  const bloqueadas = puedeVerIglesias ? (await listChurches({ accessMode: "security_blocked", pageSize: 100 })).items : [];

  // Los factores se leen en el servidor: la pantalla ya sabe en qué estado está al renderizarse.
  const supabase = await createSupabaseServerClient();
  const { data: factores } = await supabase.auth.mfa.listFactors();

  return (
    <div className="consola-pagina">
      <header>
        <h1>Seguridad</h1>
        <p className="consola-sub">Iglesias bloqueadas por seguridad y acceso de tu cuenta a la consola.</p>
      </header>

      {puedeVerIglesias && (
        <section className="shell-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15 }}>Iglesias bloqueadas por seguridad ({bloqueadas.length})</h2>
          {bloqueadas.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--shell-text-muted)" }}>Ninguna iglesia bloqueada.</p>
          ) : (
            <table className="serving-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Iglesia</th>
                  <th>Propietario</th>
                  <th>Alta</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {bloqueadas.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.name}
                      <div style={{ fontSize: 11.5, color: "var(--shell-text-muted)" }}>{c.slug}</div>
                    </td>
                    <td>{c.ownerName ?? "—"}</td>
                    <td>{fechaCorta(c.createdAt)}</td>
                    <td>
                      <Link href={`/operacion/iglesias/${c.id}#seguridad`} style={{ fontSize: 12.5 }}>
                        Ver seguridad
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 640 }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>Segundo factor de tu cuenta</h2>
        <GestionMfa factoresIniciales={factores?.all ?? []} />
      </section>
    </div>
  );
}
