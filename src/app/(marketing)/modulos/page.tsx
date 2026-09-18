import type { Metadata } from "next";
import ModulesShowcase from "@/components/marketing/ModulesShowcase";
import CtaSection from "@/components/marketing/CtaSection";

export const metadata: Metadata = {
  title: "Módulos | LEVITA",
  description:
    "Los módulos de LEVITA: Personas, Familias, Grupos, Servicios, Alabanza, Niños, Discipulado, Eventos, Comunicación, Acompañamiento pastoral, Ofrendas, Instalaciones, Informes e Integraciones.",
  alternates: { canonical: "/modulos" },
  openGraph: { title: "Módulos | LEVITA", url: "/modulos", type: "website" },
};

export default function ModulosPage() {
  return (
    <main>
      <section className="mkt-section">
        <div className="mkt-shell">
          <div className="mkt-section-head">
            <span className="mkt-eyebrow">Módulos</span>
            <h1 className="mkt-heading mkt-heading--xl">Activa lo que tu iglesia necesita</h1>
            <p className="mkt-lede">
              LEVITA es modular: activa cada módulo cuando tu iglesia lo necesite,
              sin pagar ni configurar lo que todavía no usas.
            </p>
          </div>
          <ModulesShowcase />
        </div>
      </section>

      <section className="mkt-section mkt-section--alt">
        <div className="mkt-shell">
          <CtaSection
            title="¿Qué módulos necesita tu iglesia?"
            description="Cuéntanos tu situación y te ayudamos a elegir."
            primaryLabel="Solicitar información"
            primaryHref="/demo"
          />
        </div>
      </section>
    </main>
  );
}
