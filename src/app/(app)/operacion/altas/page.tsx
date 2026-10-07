import AltaAsistidaForm from "./AltaAsistidaForm";
import { requireOperator } from "../guard";
import { ACTIVATABLE_MODULE_KEYS, ACTIVATABLE_MODULE_DESCRIPTIONS } from "@/server/church/modules-catalog";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import "../../app-shell.css";

/**
 * Nueva iglesia (alta asistida). La guarda evita enseñar un formulario que va a
 * fallar; la protección real es la base, que exige platform.churches.create.
 */
export default async function AltasAsistidasPage() {
  const acceso = await requireOperator("platform.churches.create");
  if ("bloqueado" in acceso) return acceso.bloqueado;

  // Solo módulos activables con ruta real; nunca los «próximamente».
  const modulos = ACTIVATABLE_MODULE_KEYS.map((key) => ({
    key,
    label: NAV_ITEMS.find((n) => n.moduleKey === key)?.label ?? key,
    description: ACTIVATABLE_MODULE_DESCRIPTIONS[key],
  }));

  return (
    <div className="consola-pagina" style={{ maxWidth: 720 }}>
      <header>
        <h1>Nueva iglesia</h1>
        <p className="consola-sub">
          Crea el tenant, su sede principal, la prueba y los módulos, e invita al propietario. Un alta no termina hasta
          que el propietario acepta y completa el onboarding.
        </p>
      </header>
      <AltaAsistidaForm modulos={modulos} />
    </div>
  );
}
