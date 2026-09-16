import AccesoForm from "./AccesoForm";
import { BrandMark } from "@/components/Logo";
import "../app-shell.css";

export default function AccesoPage() {
  return (
    <div
      style={{
        minHeight: "100svh",
        display: "grid",
        placeItems: "center",
        background: "var(--shell-bg)",
        padding: 20,
      }}
    >
      <div
        className="shell-card"
        style={{ width: "100%", maxWidth: 380, padding: "32px 28px" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <BrandMark style={{ width: 24, height: 28, color: "var(--shell-brand)" }} />
          <span
            style={{
              fontFamily: "var(--font-serif), Georgia, serif",
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: "0.1em",
              color: "var(--shell-text)",
            }}
          >
            LEVITA
          </span>
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Accede a tu iglesia</h1>
        <p style={{ fontSize: 13, color: "var(--shell-text-muted)", marginBottom: 20 }}>
          Introduce tu correo y contraseña para continuar.
        </p>

        <AccesoForm />
      </div>
    </div>
  );
}
