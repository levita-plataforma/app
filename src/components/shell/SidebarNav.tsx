"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HelpCircle } from "lucide-react";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav-items";

type SidebarNavProps = {
  enabledModuleKeys: Set<string>;
};

/**
 * Navegación principal de la shell. Un elemento cuyo moduleKey no está en
 * enabledModuleKeys no se renderiza: un módulo deshabilitado no aparece en
 * navegación (ver docs/18-modulos-funcionales.md §15).
 */
export default function SidebarNav({ enabledModuleKeys }: SidebarNavProps) {
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter(
    (item) => item.moduleKey === null || enabledModuleKeys.has(item.moduleKey),
  );

  function closeMobileSidebar() {
    document.querySelector(".shell-sidebar")?.setAttribute("data-open", "false");
  }

  return (
    <>
      <ul className="shell-nav">
        {visibleItems.map((item) => {
          const isActive =
            item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="shell-nav-link"
                aria-current={isActive ? "page" : undefined}
                onClick={closeMobileSidebar}
              >
                <Icon aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="shell-sidebar-footer">
        <Link href={SETTINGS_ITEM.href} className="shell-nav-link">
          <SETTINGS_ITEM.icon aria-hidden="true" />
          {SETTINGS_ITEM.label}
        </Link>
        <Link href="/app/ayuda" className="shell-nav-link">
          <HelpCircle aria-hidden="true" />
          Ayuda y soporte
        </Link>
      </div>
    </>
  );
}
