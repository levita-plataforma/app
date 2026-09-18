import type { Metadata } from "next";
import { Users, CalendarDays, MessageCircle, Shield } from "lucide-react";
import CtaSection from "@/components/marketing/CtaSection";

export const metadata: Metadata = {
  title: "Producto | LEVITA",
  description:
    "LEVITA centraliza personas, equipos, programación, eventos, comunicación, recursos, seguimiento e informes en un único lugar para tu iglesia.",
  alternates: { canonical: "/producto" },
  openGraph: { title: "Producto | LEVITA", url: "/producto", type: "website" },
};

export default function ProductoPage() {
  return (
    <main>
      <section className="mkt-section">
        <div className="mkt-shell">
          <div className="mkt-section-head">
            <span className="mkt-eyebrow">Producto</span>
            <h1 className="mkt-heading mkt-heading--xl">Todo en un solo lugar</h1>
            <p className="mkt-lede">
              LEVITA reúne personas, equipos, programación, eventos, comunicación,
              recursos, seguimiento e informes en una sola plataforma, para que tu
              equipo dedique menos tiempo a la logística y más a las personas.
            </p>
          </div>
        </div>
      </section>

      <section className="mkt-section mkt-section--alt">
        <div className="mkt-shell">
          <div className="mkt-feature-grid">
            <div className="mkt-feature">
              <span className="mkt-feature-icon"><Users aria-hidden="true" /></span>
              <h3>Personas y familias</h3>
              <p>
                Directorio de miembros, visitantes y familias, con etiquetas, grupos
                y seguimiento histórico de cada persona.
              </p>
            </div>
            <div className="mkt-feature">
              <span className="mkt-feature-icon"><CalendarDays aria-hidden="true" /></span>
              <h3>Servicios y eventos</h3>
              <p>
                Áreas, equipos, turnos, disponibilidad y cobertura, además de
                calendario y eventos con inscripciones y aforo.
              </p>
            </div>
            <div className="mkt-feature">
              <span className="mkt-feature-icon"><MessageCircle aria-hidden="true" /></span>
              <h3>Comunicación</h3>
              <p>
                Avisos, mensajes segmentados y notificaciones para mantener a tu
                comunidad cerca, sin depender de canales sueltos.
              </p>
            </div>
            <div className="mkt-feature">
              <span className="mkt-feature-icon"><Shield aria-hidden="true" /></span>
              <h3>Seguridad multi-iglesia</h3>
              <p>
                Cada iglesia con sus propios datos, aislados del resto, con permisos
                claros por persona y por función.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-shell">
          <CtaSection
            title="Descubre LEVITA en una demo"
            description="Te mostramos la plataforma con los módulos que tu iglesia necesita."
          />
        </div>
      </section>
    </main>
  );
}
