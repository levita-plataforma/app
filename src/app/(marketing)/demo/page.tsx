import type { Metadata } from "next";
import DemoForm from "./DemoForm";

export const metadata: Metadata = {
  title: "Solicitar una demo | LEVITA",
  description: "Solicita una demo personalizada de LEVITA para tu iglesia.",
  alternates: { canonical: "/demo" },
  openGraph: { title: "Solicitar una demo | LEVITA", url: "/demo", type: "website" },
};

export default function DemoPage() {
  return (
    <main>
      <section className="mkt-section">
        <div className="mkt-shell">
          <div className="mkt-section-head mkt-section-head--center" style={{ marginBottom: 40 }}>
            <span className="mkt-eyebrow">Solicitar una demo</span>
            <h1 className="mkt-heading mkt-heading--lg">Conoce LEVITA de cerca</h1>
            <p className="mkt-body" style={{ margin: "18px auto 0" }}>
              Cuéntanos sobre tu iglesia y te mostraremos la plataforma adaptada a
              lo que necesitas.
            </p>
          </div>
          <DemoForm />
        </div>
      </section>
    </main>
  );
}
