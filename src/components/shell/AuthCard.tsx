import { BrandMark } from "@/components/Logo";

type AuthCardProps = {
  title: string;
  subtitle: string;
  maxWidth?: number;
  children: React.ReactNode;
};

/**
 * Contenedor visual común para las pantallas de /acceso (login, registro,
 * onboarding, aceptar invitación). Evita reimplementar el wrapper de marca
 * en cada pantalla. Sigue imagenes/layout*.png (ver docs/adr/0016).
 */
export default function AuthCard({ title, subtitle, maxWidth = 380, children }: AuthCardProps) {
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
      <div className="shell-card" style={{ width: "100%", maxWidth, padding: "32px 28px" }}>
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

        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{title}</h1>
        <p style={{ fontSize: 13, color: "var(--shell-text-muted)", marginBottom: 20 }}>{subtitle}</p>

        {children}
      </div>
    </div>
  );
}

export const authInputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: "var(--shell-radius-sm)",
  border: "1px solid var(--shell-border)",
  fontSize: 13.5,
  outline: "none",
  background: "var(--shell-surface)",
  color: "var(--shell-text)",
};

export const authLabelStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--shell-text)",
};

export const authPrimaryButtonStyle = (pending: boolean): React.CSSProperties => ({
  marginTop: 6,
  padding: "10px 16px",
  borderRadius: "var(--shell-radius-md)",
  border: "none",
  background: "var(--shell-text)",
  color: "#fff",
  fontSize: 13.5,
  fontWeight: 600,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.7 : 1,
});
