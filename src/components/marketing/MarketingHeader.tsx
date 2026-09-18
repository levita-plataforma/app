"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import Logo from "@/components/Logo";

const NAV_LINKS = [
  { href: "/producto", label: "Producto" },
  { href: "/modulos", label: "Módulos" },
  { href: "/para-iglesias", label: "Para iglesias" },
  { href: "/seguridad", label: "Seguridad" },
];

export default function MarketingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="mkt-header">
      <div className="mkt-header-inner">
        <Link href="/" aria-label="LEVITA — inicio" style={{ textDecoration: "none" }}>
          <Logo small />
        </Link>

        <nav className="mkt-nav" aria-label="Navegación principal">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="mkt-header-ctas">
          <Link href="/acceso" className="mkt-btn mkt-btn--secondary">
            Iniciar sesión
          </Link>
          <Link href="/demo" className="mkt-btn mkt-btn--primary">
            Solicitar demo
          </Link>
          <button
            type="button"
            className="mkt-menu-toggle"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <nav className="mkt-mobile-nav" data-open={open} aria-label="Navegación móvil">
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>
            {link.label}
          </Link>
        ))}
        <Link href="/acceso" onClick={() => setOpen(false)}>
          Iniciar sesión
        </Link>
      </nav>
    </header>
  );
}
