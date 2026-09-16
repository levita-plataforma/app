import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import AltaAsistidaForm from "./AltaAsistidaForm";
import "../../app-shell.css";

/**
 * Superficie separada de operación LEVITA (encargo de Fase 1 §16). No
 * reutiliza permisos de church admin: se protege comprobando
 * app.is_platform_operator() directamente, vía RLS de platform_operators.
 */
export default async function AltasAsistidasPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/acceso");

  const { data: isOperator } = await supabase
    .from("platform_operators")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!isOperator) {
    return (
      <div style={{ minHeight: "100svh", display: "grid", placeItems: "center", background: "var(--shell-bg)", padding: 20 }}>
        <div className="shell-card shell-empty-state" style={{ padding: 40 }}>
          <h3>Acceso restringido</h3>
          <p>Esta sección es solo para operación de LEVITA.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100svh", background: "var(--shell-bg)", padding: "40px 20px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Alta asistida de iglesia</h1>
        <p style={{ fontSize: 13, color: "var(--shell-text-muted)", marginBottom: 24 }}>
          Crea el espacio de una iglesia y genera el enlace de invitación para su propietario.
        </p>
        <AltaAsistidaForm />
      </div>
    </div>
  );
}
