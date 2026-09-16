import Link from "next/link";
import RegistroForm from "./RegistroForm";
import AuthCard from "@/components/shell/AuthCard";
import "../../app-shell.css";

export default function RegistroPage() {
  return (
    <AuthCard title="Crea tu cuenta" subtitle="El primer paso para dar de alta tu iglesia en LEVITA.">
      <RegistroForm />
      <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 18, textAlign: "center" }}>
        ¿Ya tienes cuenta?{" "}
        <Link href="/acceso" style={{ color: "var(--shell-brand)", fontWeight: 600 }}>
          Acceder
        </Link>
      </p>
    </AuthCard>
  );
}
