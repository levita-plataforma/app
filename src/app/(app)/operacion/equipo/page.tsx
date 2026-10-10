import { listCapabilityCatalog, listTeam } from "@/server/platform/platform-service";
import { requireOperator } from "../guard";
import PanelEquipo from "./PanelEquipo";
import "../../app-shell.css";

/**
 * Equipo de operación de LEVITA (CA-3.1).
 *
 * Hasta ahora, dar de alta a alguien del equipo o cambiarle los permisos exigía
 * entrar a la base de datos a mano: las funciones existían desde CA-0, pero sin
 * wrapper público y sin ninguna pantalla que las llamara.
 *
 * Esto es el equipo de LEVITA, no el de ninguna iglesia. Aquí no se ven
 * personas de las iglesias ni sus datos: solo cuentas de operación y qué puede
 * hacer cada una.
 */
export default async function EquipoPage() {
  const acceso = await requireOperator("platform.operators.manage");
  if ("bloqueado" in acceso) return acceso.bloqueado;

  // Dos lecturas independientes: encadenarlas solo sumaría latencia.
  const [miembros, catalogo] = await Promise.all([listTeam(), listCapabilityCatalog()]);

  return (
    <div className="consola-pagina">
      <header>
        <h1>Equipo</h1>
        <p className="consola-sub">
          Quién trabaja en la operación de LEVITA y qué puede hacer cada uno. Estar en el equipo y tener permisos son
          cosas distintas: se entra sin ninguno.
        </p>
      </header>

      <PanelEquipo miembros={miembros} catalogo={catalogo} />
    </div>
  );
}
