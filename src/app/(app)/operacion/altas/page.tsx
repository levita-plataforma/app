import AltaAsistidaForm from "./AltaAsistidaForm";
import { requireOperator } from "../guard";
import "../../app-shell.css";

/**
 * Alta asistida de iglesias.
 *
 * Usa la misma guarda que el resto del panel en vez de comprobar a mano la
 * pertenencia a `platform_operators`, que era lo que hacía antes. La diferencia
 * importa: desde la Fase 14, pertenecer al equipo y poder crear iglesias son
 * cosas distintas, y aquí se pedía solo la primera.
 *
 * La guarda no es la protección —quien no tenga la capacidad recibe 42501 de la
 * base igualmente, desde CA-0.2—: lo que evita es enseñar un formulario que va
 * a fallar al enviarlo.
 */
export default async function AltasAsistidasPage() {
  const acceso = await requireOperator("platform.churches.create");
  if ("bloqueado" in acceso) return acceso.bloqueado;

  return (
    <div style={{ minHeight: "100svh", background: "var(--shell-bg)", padding: "40px 20px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Alta asistida de iglesia</h1>
        <p style={{ fontSize: 13, color: "var(--shell-text-muted)", marginBottom: 24 }}>
          Crea el espacio de una iglesia y genera el enlace de invitación para su propietario.
        </p>
        <AltaAsistidaForm />
      </div>
    </div>
  );
}
