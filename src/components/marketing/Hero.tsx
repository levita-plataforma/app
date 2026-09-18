import Link from "next/link";
import ProductMockup from "./ProductMockup";

export default function Hero() {
  return (
    <section className="mkt-shell">
      <div className="mkt-hero">
        <div className="mkt-hero-copy">
          <span className="mkt-eyebrow">Plataforma para iglesias</span>
          <h1 className="mkt-heading mkt-heading--xl">
            La plataforma que conecta, organiza y fortalece tu iglesia.
          </h1>
          <p className="mkt-lede">
            Gestiona personas, equipos, servicios, grupos, eventos, comunicación
            y mucho más desde un único lugar.
          </p>
          <div className="mkt-hero-actions">
            <Link href="/demo" className="mkt-btn mkt-btn--primary">
              Solicitar una demo
            </Link>
            <Link href="/producto" className="mkt-btn mkt-btn--secondary">
              Ver la plataforma
            </Link>
          </div>
        </div>
        <div className="mkt-hero-visual">
          <ProductMockup />
        </div>
      </div>
    </section>
  );
}
