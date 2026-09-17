import Link from "next/link";
import { Bell } from "lucide-react";
import { countMyUnreadNotificationsSafe } from "@/server/notifications/notifications-service";

/**
 * Campana de la cabecera (Fase 5, DI-02): enlace a la bandeja con el número de
 * avisos sin leer.
 *
 * Si la consulta falla, el contador devuelve null y la campana se muestra sin
 * número: la cabecera nunca se rompe por un aviso.
 *
 * Estilos en línea a propósito, como en el resto de la shell (ver
 * src/app/(app)/app/servicios/ui.ts): el sistema visual de la cabecera vive en
 * app-shell.css y esta pieza solo añade la chapa del contador.
 */

const bellStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  textDecoration: "none",
};

const badgeStyle: React.CSSProperties = {
  position: "absolute",
  top: -2,
  right: -2,
  minWidth: 17,
  height: 17,
  padding: "0 4px",
  borderRadius: 9,
  background: "var(--shell-danger)",
  border: "2px solid var(--shell-bg)",
  color: "#fff",
  fontSize: 10,
  fontWeight: 700,
  lineHeight: 1,
  display: "grid",
  placeItems: "center",
};

export default async function ShellNotificationsBell({ churchId }: { churchId: string }) {
  const unread = await countMyUnreadNotificationsSafe(churchId);
  const count = unread ?? 0;

  // A partir de 10 no se da el número exacto: la bandeja lo dice.
  const badge = count > 9 ? "+9" : String(count);
  const label =
    unread === null
      ? "Avisos"
      : count === 0
        ? "Avisos: no tienes avisos sin leer"
        : count === 1
          ? "Avisos: 1 sin leer"
          : `Avisos: ${count} sin leer`;

  return (
    <Link href="/app/avisos" className="shell-bell" style={bellStyle} aria-label={label}>
      <Bell aria-hidden="true" />
      {count > 0 ? (
        <span style={badgeStyle} aria-hidden="true">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
