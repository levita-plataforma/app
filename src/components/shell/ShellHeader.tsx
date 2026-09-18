import { Search, ChevronDown } from "lucide-react";
import type { TenantContext } from "@/server/tenant/tenant-context";
import MobileSidebarToggle from "./MobileSidebarToggle";
import ShellNotificationsBell from "./ShellNotificationsBell";

type ShellHeaderProps = {
  tenant: TenantContext;
  displayName: string;
  roleLabel: string;
};

export default function ShellHeader({ tenant, displayName, roleLabel }: ShellHeaderProps) {
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="shell-header">
      <MobileSidebarToggle />
      <label className="shell-search">
        <Search aria-hidden="true" />
        <input
          type="search"
          placeholder="Buscar personas, eventos, grupos…"
          aria-label="Buscar en LEVITA"
        />
      </label>

      <div className="shell-header-actions">
        <button type="button" className="shell-campus-select">
          Sede principal
          <ChevronDown aria-hidden="true" width={14} height={14} />
        </button>

        {/* Avisos (Fase 5, DI-02): el contador se resuelve en el servidor. */}
        <ShellNotificationsBell churchId={tenant.churchId} />

        <div className="shell-profile">
          <span className="shell-avatar" aria-hidden="true">
            {initials || "?"}
          </span>
          <span>
            <span className="shell-profile-name" style={{ display: "block" }}>
              {displayName}
            </span>
            <span className="shell-profile-role">{roleLabel}</span>
          </span>
        </div>
      </div>
      <span className="sr-only">Iglesia activa: {tenant.churchName}</span>
    </header>
  );
}
