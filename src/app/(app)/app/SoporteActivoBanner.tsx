import { createSupabaseServerClient } from "@/server/supabase/server-client";

/**
 * Indicador de que hay una sesión de soporte de LEVITA activa en esta iglesia.
 * Solo un booleano: no dice quién es el operador, por qué ni hasta cuándo.
 * Para cualquiera que no sea miembro de la iglesia, la base responde false.
 */
export default async function SoporteActivoBanner({ churchId }: { churchId: string }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("support_session_active_for_church", { p_church_id: churchId });

  if (!data) return null;

  return (
    <p
      role="status"
      style={{
        margin: 0,
        padding: "8px 16px",
        fontSize: 12.5,
        background: "var(--shell-warning-bg, #fff4d6)",
        color: "var(--shell-text, #3b2f00)",
        borderBottom: "1px solid var(--shell-border, #e8d9a6)",
      }}
    >
      Una sesión de soporte de LEVITA está activa.
    </p>
  );
}
