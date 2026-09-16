import Link from "next/link";
import AccesoForm from "./AccesoForm";
import AuthCard from "@/components/shell/AuthCard";
import "../app-shell.css";

export default function AccesoPage() {
  return (
    <AuthCard title="Accede a tu iglesia" subtitle="Introduce tu correo y contraseña para continuar.">
      <AccesoForm />
      <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 18, textAlign: "center" }}>
        ¿Tu iglesia todavía no está en LEVITA?{" "}
        <Link href="/acceso/registro" style={{ color: "var(--shell-brand)", fontWeight: 600 }}>
          Crear mi iglesia
        </Link>
      </p>
    </AuthCard>
  );
}
