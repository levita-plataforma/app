import type { Metadata } from "next";
import { ShieldCheck, Lock, KeyRound, FileClock, Users2, Server } from "lucide-react";
import CtaSection from "@/components/marketing/CtaSection";

export const metadata: Metadata = {
  title: "Seguridad y privacidad | LEVITA",
  description:
    "Cómo LEVITA protege los datos de tu iglesia: aislamiento entre iglesias, permisos por persona, auditoría y protección de datos desde el diseño.",
  alternates: { canonical: "/seguridad" },
  openGraph: { title: "Seguridad y privacidad | LEVITA", url: "/seguridad", type: "website" },
};

const ITEMS = [
  {
    icon: Lock,
    title: "Aislamiento entre iglesias",
    description:
      "Cada iglesia tiene sus propios datos, separados lógicamente del resto. Ninguna iglesia puede ver ni modificar la información de otra.",
  },
  {
    icon: KeyRound,
    title: "Permisos claros por persona",
    description:
      "Cada persona accede solo a lo que su función necesita. Los módulos activados no sustituyen los permisos individuales.",
  },
  {
    icon: Users2,
    title: "Datos sensibles protegidos",
    description:
      "La información sensible, como la de menores o incidencias, se protege con permisos más estrictos que el resto de datos.",
  },
  {
    icon: FileClock,
    title: "Auditoría",
    description:
      "Las acciones relevantes quedan registradas, para que siempre pueda revisarse qué ocurrió y quién lo hizo.",
  },
  {
    icon: Server,
    title: "Seguridad desde el diseño",
    description:
      "El aislamiento entre iglesias y los permisos se aplican en la base de datos, no solo en la interfaz: ocultar un botón nunca es la única protección.",
  },
  {
    icon: ShieldCheck,
    title: "Protección de datos",
    description:
      "Tratamos los datos de tu comunidad con el cuidado que merece la información personal de las personas de tu iglesia.",
  },
];

export default function SeguridadPage() {
  return (
    <main>
      <section className="mkt-section">
        <div className="mkt-shell">
          <div className="mkt-section-head">
            <span className="mkt-eyebrow">Seguridad</span>
            <h1 className="mkt-heading mkt-heading--xl">
              Seguridad y privacidad desde el diseño.
            </h1>
            <p className="mkt-lede">
              La confianza de tu comunidad importa. Así protegemos los datos de tu
              iglesia en LEVITA.
            </p>
          </div>

          <div className="mkt-check-list">
            {ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <div className="mkt-check-item" key={item.title}>
                  <Icon aria-hidden="true" />
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mkt-section mkt-section--alt">
        <div className="mkt-shell">
          <CtaSection
            title="¿Tienes preguntas sobre seguridad?"
            description="Cuéntanos qué necesitas saber sobre cómo protegemos los datos de tu iglesia."
            primaryLabel="Contactar"
            primaryHref="/contacto"
          />
        </div>
      </section>
    </main>
  );
}
