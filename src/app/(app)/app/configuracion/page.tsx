import Link from "next/link";
import { Building2, MapPinned } from "lucide-react";

const SECTIONS = [
  { href: "/app/configuracion/iglesia", icon: Building2, title: "Datos de la iglesia", description: "Nombre, contacto, dirección y personalización visual." },
  { href: "/app/configuracion/sedes", icon: MapPinned, title: "Sedes", description: "Gestiona la sede principal y añade nuevas sedes." },
];

export default function ConfiguracionPage() {
  return (
    <>
      <section>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Configuración</h1>
        <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
          Personaliza LEVITA para tu iglesia.
        </p>
      </section>

      <div className="module-grid">
        {SECTIONS.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href} className="shell-card module-card">
            <span className="module-icon" style={{ background: "var(--shell-active-bg)", color: "var(--shell-brand)" }}>
              <Icon aria-hidden="true" />
            </span>
            <span>
              <span className="module-title" style={{ display: "block" }}>{title}</span>
              <span className="module-subtitle">{description}</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
