import Link from "next/link";
import { BrandMark } from "@/components/Logo";
import ProductMockup from "@/components/marketing/ProductMockup";
import AccesoForm from "./AccesoForm";
import "./acceso.css";
import "@/app/(marketing)/marketing.css";

export default function AccesoPage() {
  return (
    <div className="acceso-shell">
      <div className="acceso-visual">
        <div className="acceso-visual-brand">
          <BrandMark />
          <span>LEVITA</span>
        </div>

        <div className="acceso-visual-copy">
          <span className="acceso-eyebrow">Plataforma para iglesias</span>
          <h1>Todo lo que mueve tu iglesia, en un solo lugar.</h1>
          <p>Personas, equipos, servicios, eventos y comunicación en una misma plataforma.</p>
        </div>

        <div className="acceso-visual-mockup" aria-hidden="true">
          <ProductMockup />
        </div>
      </div>

      <div className="acceso-form-side">
        <div className="acceso-form-card">
          <h2>Accede a LEVITA</h2>
          <p className="acceso-form-subtitle">Entra con tu cuenta para continuar.</p>

          <AccesoForm />

          <p className="acceso-footnote">
            ¿Tu iglesia todavía no está en LEVITA? <Link href="/acceso/registro">Crear mi iglesia</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
