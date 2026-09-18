import type { Metadata } from "next";
import { Users, CalendarClock, Baby, MessageCircle, HeartHandshake, Shield } from "lucide-react";
import Hero from "@/components/marketing/Hero";
import ModulesShowcase, { MODULES } from "@/components/marketing/ModulesShowcase";
import CtaSection from "@/components/marketing/CtaSection";
import Link from "next/link";

export const metadata: Metadata = {
  title: "LEVITA | La plataforma para gestionar tu iglesia",
  description:
    "LEVITA es la plataforma que conecta, organiza y fortalece tu iglesia: personas, equipos, servicios, grupos, eventos, comunicación y mucho más desde un único lugar.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "LEVITA | La plataforma para gestionar tu iglesia",
    description:
      "Gestiona personas, equipos, servicios, grupos, eventos, comunicación y mucho más desde un único lugar.",
    url: "/",
    type: "website",
  },
};

const FEATURED_MODULE_KEYS = ["people", "serving", "kids", "communications", "pastoral"];

export default function MarketingHomePage() {
  const featured = MODULES.filter((m) => FEATURED_MODULE_KEYS.includes(m.key));

  return (
    <main>
      <Hero />

      <section className="mkt-section mkt-section--alt">
        <div className="mkt-shell">
          <div className="mkt-section-head mkt-section-head--center">
            <span className="mkt-eyebrow">Tecnología al servicio de la iglesia</span>
            <h2 className="mkt-heading mkt-heading--lg">
              Sencilla, cercana y pensada para servir a tu comunidad
            </h2>
            <p className="mkt-body" style={{ margin: "18px auto 0" }}>
              LEVITA existe para que tu equipo dedique menos tiempo a la logística y más
              tiempo a las personas: organización clara, comunicación cercana y datos
              protegidos para que tu iglesia crezca con seguridad.
            </p>
          </div>
          <div className="mkt-feature-grid">
            <div className="mkt-feature">
              <span className="mkt-feature-icon"><Users aria-hidden="true" /></span>
              <h3>Personas en el centro</h3>
              <p>Conoce, acompaña y cuida a cada persona de tu comunidad, no solo un número.</p>
            </div>
            <div className="mkt-feature">
              <span className="mkt-feature-icon"><CalendarClock aria-hidden="true" /></span>
              <h3>Organización sin caos</h3>
              <p>Equipos, turnos y eventos coordinados desde un único lugar.</p>
            </div>
            <div className="mkt-feature">
              <span className="mkt-feature-icon"><Shield aria-hidden="true" /></span>
              <h3>Seguridad desde el diseño</h3>
              <p>Cada iglesia con sus propios datos, aislados y protegidos.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-shell">
          <div className="mkt-section-head">
            <span className="mkt-eyebrow">Módulos de la plataforma</span>
            <h2 className="mkt-heading mkt-heading--lg">Todo lo que tu iglesia necesita</h2>
            <p className="mkt-body">
              Activa solo los módulos que tu iglesia necesita hoy, y añade más cuando
              crezcas.
            </p>
          </div>
          <ModulesShowcase modules={featured} />
          <div style={{ marginTop: 28 }}>
            <Link href="/modulos" className="mkt-btn mkt-btn--secondary">
              Ver los 14 módulos
            </Link>
          </div>
        </div>
      </section>

      <section className="mkt-section mkt-section--alt">
        <div className="mkt-shell">
          <div className="mkt-section-head mkt-section-head--center">
            <span className="mkt-eyebrow">Diseñado para crecer con tu iglesia</span>
            <h2 className="mkt-heading mkt-heading--lg">De una sede a muchas, sin fricción</h2>
            <p className="mkt-body" style={{ margin: "18px auto 0" }}>
              Una o varias sedes, distintos ministerios y equipos, permisos claros por
              persona y módulos que activas según lo que tu iglesia necesita. La misma
              plataforma te acompaña mientras creces.
            </p>
          </div>
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-shell">
          <div className="mkt-feature-grid">
            <div className="mkt-feature">
              <span className="mkt-feature-icon"><Baby aria-hidden="true" /></span>
              <h3>Niños, con seguridad</h3>
              <p>Salas, responsables acreditados y recogida siempre autorizada.</p>
            </div>
            <div className="mkt-feature">
              <span className="mkt-feature-icon"><MessageCircle aria-hidden="true" /></span>
              <h3>Comunicación cercana</h3>
              <p>Avisos y mensajes segmentados para mantener a tu comunidad al día.</p>
            </div>
            <div className="mkt-feature">
              <span className="mkt-feature-icon"><HeartHandshake aria-hidden="true" /></span>
              <h3>Acompañamiento pastoral</h3>
              <p>Seguimiento cercano de las personas que más lo necesitan.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-shell">
          <CtaSection />
        </div>
      </section>
    </main>
  );
}
