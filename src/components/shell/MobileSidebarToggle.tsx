"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

/**
 * Controla la visibilidad de la sidebar en móvil (<860px). Se cierra al
 * navegar y con Escape. Ver Fase 0 §23 (responsive mobile).
 */
export default function MobileSidebarToggle() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sidebar = document.querySelector(".shell-sidebar");
    if (sidebar) sidebar.setAttribute("data-open", String(open));

    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function onClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest(".shell-sidebar") && !target.closest(".shell-mobile-toggle")) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onClickOutside);
    };
  }, [open]);

  return (
    <button
      type="button"
      className="shell-mobile-toggle"
      aria-label={open ? "Cerrar menú" : "Abrir menú"}
      aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
    >
      {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
    </button>
  );
}
