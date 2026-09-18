import type { Metadata } from "next";
import ContactoForm from "./ContactoForm";

export const metadata: Metadata = {
  title: "Contacto | LEVITA",
  description: "Ponte en contacto con el equipo de LEVITA.",
  alternates: { canonical: "/contacto" },
  openGraph: { title: "Contacto | LEVITA", url: "/contacto", type: "website" },
};

export default function ContactoPage() {
  return (
    <main>
      <section className="mkt-section">
        <div className="mkt-shell">
          <div className="mkt-section-head mkt-section-head--center" style={{ marginBottom: 40 }}>
            <span className="mkt-eyebrow">Contacto</span>
            <h1 className="mkt-heading mkt-heading--lg">Hablemos</h1>
            <p className="mkt-body" style={{ margin: "18px auto 0" }}>
              ¿Tienes una pregunta general? Escríbenos y te responderemos lo antes
              posible.
            </p>
          </div>
          <ContactoForm />
        </div>
      </section>
    </main>
  );
}
