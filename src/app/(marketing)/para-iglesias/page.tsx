import type { Metadata } from "next";
import CtaSection from "@/components/marketing/CtaSection";

export const metadata: Metadata = {
  title: "Para iglesias | LEVITA",
  description:
    "LEVITA está pensado para iglesias de cualquier tamaño: pequeñas, medianas, grandes y multi-campus, con módulos que se adaptan a cada equipo.",
  alternates: { canonical: "/para-iglesias" },
  openGraph: { title: "Para iglesias | LEVITA", url: "/para-iglesias", type: "website" },
};

const SIZES = [
  {
    title: "Iglesias pequeñas",
    description:
      "Empieza con lo esencial: personas, comunicación y servicios, sin complejidad innecesaria.",
  },
  {
    title: "Iglesias medianas",
    description:
      "Coordina varios equipos y ministerios con permisos claros y comunicación segmentada.",
  },
  {
    title: "Iglesias grandes y multi-campus",
    description:
      "Gestiona varias sedes, ministerios y equipos desde una sola plataforma, con datos siempre aislados por iglesia.",
  },
];

export default function ParaIglesiasPage() {
  return (
    <main>
      <section className="mkt-section">
        <div className="mkt-shell">
          <div className="mkt-section-head">
            <span className="mkt-eyebrow">Para iglesias</span>
            <h1 className="mkt-heading mkt-heading--xl">
              Para tu iglesia, sin importar el tamaño
            </h1>
            <p className="mkt-lede">
              LEVITA se adapta a la realidad de tu iglesia: una sede o varias,
              un equipo pequeño o varios ministerios trabajando a la vez.
            </p>
          </div>

          <div className="mkt-size-grid">
            {SIZES.map((s) => (
              <div className="mkt-size-card" key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mkt-section mkt-section--alt">
        <div className="mkt-shell">
          <div className="mkt-section-head mkt-section-head--center">
            <span className="mkt-eyebrow">Diseñado para crecer con tu iglesia</span>
            <h2 className="mkt-heading mkt-heading--lg">
              Una o varias sedes, distintos ministerios
            </h2>
            <p className="mkt-body" style={{ margin: "18px auto 0" }}>
              Cada iglesia mantiene sus propios datos, equipos y permisos, aislados
              del resto. Los módulos se activan según lo que necesites hoy, y se
              suman a medida que tu iglesia crece.
            </p>
          </div>
        </div>
      </section>

      <section className="mkt-section">
        <div className="mkt-shell">
          <CtaSection
            title="Hablemos sobre tu iglesia"
            description="Cuéntanos tu situación y te ayudamos a decidir por dónde empezar."
            primaryLabel="Solicitar información"
            primaryHref="/demo"
          />
        </div>
      </section>
    </main>
  );
}
