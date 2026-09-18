import {
  Users,
  UsersRound,
  CalendarClock,
  Music4,
  UserRound,
  GraduationCap,
  CalendarDays,
  Baby,
  MessageCircle,
  HeartHandshake,
  Coins,
  Building2,
  BarChart3,
  Link2,
  type LucideIcon,
} from "lucide-react";

export type ModuleInfo = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  accent: string;
};

/**
 * Los 14 módulos reales del roadmap de LEVITA, con los mismos nombres e
 * iconos que src/components/shell/nav-items.ts (fuente de verdad de la
 * app). Ningún módulo listado aquí es ficticio.
 */
export const MODULES: ModuleInfo[] = [
  {
    key: "people",
    label: "Personas",
    description: "Conoce, acompaña y cuida mejor a cada persona de tu comunidad.",
    icon: Users,
    accent: "people",
  },
  {
    key: "families",
    label: "Familias",
    description: "Organiza hogares, relaciones y seguimiento familiar.",
    icon: UsersRound,
    accent: "families",
  },
  {
    key: "serving",
    label: "Servicios",
    description: "Coordina equipos, turnos, voluntarios y cobertura.",
    icon: CalendarClock,
    accent: "serving",
  },
  {
    key: "worship",
    label: "Alabanza",
    description: "Repertorio y planificación para tu equipo de adoración.",
    icon: Music4,
    accent: "worship",
  },
  {
    key: "groups",
    label: "Grupos",
    description: "Crea comunidad con grupos, líderes y encuentros.",
    icon: UserRound,
    accent: "groups",
  },
  {
    key: "discipleship",
    label: "Discipulado",
    description: "Forma y acompaña el crecimiento de cada persona.",
    icon: GraduationCap,
    accent: "discipleship",
  },
  {
    key: "events",
    label: "Eventos",
    description: "Organiza y gestiona eventos, inscripciones y aforo.",
    icon: CalendarDays,
    accent: "events",
  },
  {
    key: "kids",
    label: "Niños",
    description: "Salas, responsables acreditados y recogida segura.",
    icon: Baby,
    accent: "kids",
  },
  {
    key: "communications",
    label: "Comunicación",
    description: "Mantén la cercanía con avisos, mensajes y segmentos.",
    icon: MessageCircle,
    accent: "communications",
  },
  {
    key: "pastoral",
    label: "Acompañamiento pastoral",
    description: "Seguimiento cercano de las personas que lo necesitan.",
    icon: HeartHandshake,
    accent: "pastoral",
  },
  {
    key: "giving",
    label: "Ofrendas",
    description: "Generosidad que transforma, con registro claro.",
    icon: Coins,
    accent: "giving",
  },
  {
    key: "facilities",
    label: "Instalaciones",
    description: "Gestiona espacios, recursos y reservas.",
    icon: Building2,
    accent: "facilities",
  },
  {
    key: "analytics",
    label: "Informes",
    description: "Toma mejores decisiones con datos claros.",
    icon: BarChart3,
    accent: "analytics",
  },
  {
    key: "integrations",
    label: "Integraciones",
    description: "Conecta LEVITA con las herramientas que ya usas.",
    icon: Link2,
    accent: "integrations",
  },
];

const ACCENT_COLORS: Record<string, { bg: string; fg: string }> = {
  people: { bg: "#ecf2f8", fg: "#547ca0" },
  families: { bg: "#f2eded", fg: "#947d82" },
  serving: { bg: "#edf3ee", fg: "#648674" },
  worship: { bg: "#f7f0e2", fg: "#aa8341" },
  groups: { bg: "#ecf2f8", fg: "#547ca0" },
  discipleship: { bg: "#f4eddf", fg: "#a7803d" },
  events: { bg: "#edf3ee", fg: "#648674" },
  kids: { bg: "#f7f0e2", fg: "#aa8341" },
  communications: { bg: "#f2eded", fg: "#947d82" },
  pastoral: { bg: "#f2eded", fg: "#947d82" },
  giving: { bg: "#f4eddf", fg: "#a7803d" },
  facilities: { bg: "#ecf2f8", fg: "#547ca0" },
  analytics: { bg: "#edf3ee", fg: "#648674" },
  integrations: { bg: "#ecf2f8", fg: "#547ca0" },
};

export default function ModulesShowcase({ modules = MODULES }: { modules?: ModuleInfo[] }) {
  return (
    <div className="mkt-module-grid">
      {modules.map((m) => {
        const Icon = m.icon;
        const colors = ACCENT_COLORS[m.accent] ?? { bg: "var(--gold-soft)", fg: "var(--gold)" };
        return (
          <div className="mkt-module-card" key={m.key}>
            <span
              className="mkt-module-icon"
              style={{ "--icon-bg": colors.bg, "--icon-color": colors.fg } as React.CSSProperties}
            >
              <Icon aria-hidden="true" />
            </span>
            <h3>{m.label}</h3>
            <p>{m.description}</p>
          </div>
        );
      })}
    </div>
  );
}
