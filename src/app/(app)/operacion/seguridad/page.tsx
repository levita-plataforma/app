import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireOperator } from "../guard";
import GestionMfa from "./GestionMfa";
import "../../app-shell.css";

/**
 * Seguridad de la cuenta de operación (Fase 13).
 *
 * El segundo factor es recomendado, no obligatorio (decisión de Carlos,
 * 21-sep-2026), así que esta pantalla no bloquea nada: informa y permite
 * activarlo. El aviso de la portada del panel lleva aquí.
 */
export default async function SeguridadOperacionPage() {
  const resultado = await requireOperator();
  if ("bloqueado" in resultado) return resultado.bloqueado;

  // Los factores se leen aquí y no en el cliente: la pantalla ya sabe en qué
  // estado está al renderizarse, sin un «Cargando…» que diga lo mismo un
  // instante después.
  const supabase = await createSupabaseServerClient();
  const { data: factores } = await supabase.auth.mfa.listFactors();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>
      <section>
        <h1 style={{ fontSize: 21, fontWeight: 600 }}>Seguridad de tu cuenta</h1>
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 4 }}>
          Ajustes de acceso al panel de operación.
        </p>
      </section>

      <GestionMfa factoresIniciales={factores?.all ?? []} />
    </div>
  );
}
