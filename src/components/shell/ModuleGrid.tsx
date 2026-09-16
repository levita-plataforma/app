import Link from "next/link";
import { NAV_ITEMS } from "./nav-items";

const ACCENT_VARS: Record<string, { bg: string; fg: string }> = {
  people: { bg: "var(--mod-people-bg)", fg: "var(--mod-people-fg)" },
  families: { bg: "var(--mod-families-bg)", fg: "var(--mod-families-fg)" },
  serving: { bg: "var(--mod-serving-bg)", fg: "var(--mod-serving-fg)" },
  worship: { bg: "var(--mod-worship-bg)", fg: "var(--mod-worship-fg)" },
  groups: { bg: "var(--mod-groups-bg)", fg: "var(--mod-groups-fg)" },
  discipleship: { bg: "var(--mod-discipleship-bg)", fg: "var(--mod-discipleship-fg)" },
  events: { bg: "var(--mod-events-bg)", fg: "var(--mod-events-fg)" },
  kids: { bg: "var(--mod-kids-bg)", fg: "var(--mod-kids-fg)" },
  communications: { bg: "var(--mod-communications-bg)", fg: "var(--mod-communications-fg)" },
  pastoral: { bg: "var(--mod-pastoral-bg)", fg: "var(--mod-pastoral-fg)" },
  giving: { bg: "var(--mod-giving-bg)", fg: "var(--mod-giving-fg)" },
  facilities: { bg: "var(--mod-facilities-bg)", fg: "var(--mod-facilities-fg)" },
  analytics: { bg: "var(--mod-analytics-bg)", fg: "var(--mod-analytics-fg)" },
  integrations: { bg: "var(--mod-integrations-bg)", fg: "var(--mod-integrations-fg)" },
};

const MODULE_SUBTITLES: Record<string, string> = {
  people: "Conoce y cuida a tu comunidad",
  families: "Hogares más fuertes",
  serving: "Organiza turnos y equipos",
  worship: "Repertorio y planificación",
  groups: "Crea comunidad",
  discipleship: "Forma y acompaña",
  events: "Organiza y gestiona",
  kids: "Seguro y confiable",
  communications: "Mantén la cercanía",
  pastoral: "Apoyo pastoral",
  giving: "Generosidad que transforma",
  facilities: "Espacios y recursos",
  analytics: "Toma mejores decisiones",
  integrations: "Conecta tu iglesia",
};

type ModuleGridProps = {
  enabledModuleKeys: Set<string>;
};

/**
 * Grid "Módulos de la plataforma" del Inicio (ver imagenes/layout0.png).
 * Solo se listan módulos habilitados para el tenant activo.
 */
export default function ModuleGrid({ enabledModuleKeys }: ModuleGridProps) {
  const items = NAV_ITEMS.filter(
    (item) => item.moduleKey !== null && enabledModuleKeys.has(item.moduleKey),
  );

  if (items.length === 0) {
    return (
      <div className="shell-card shell-empty-state">
        <h3>Todavía no hay módulos habilitados</h3>
        <p>Activa módulos desde Configuración para empezar a usar LEVITA.</p>
      </div>
    );
  }

  return (
    <section>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Módulos de la plataforma</h2>
      <div className="module-grid">
        {items.map((item) => {
          const accent = ACCENT_VARS[item.accent] ?? ACCENT_VARS.people;
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="shell-card module-card">
              <span className="module-icon" style={{ background: accent.bg, color: accent.fg }}>
                <Icon aria-hidden="true" />
              </span>
              <span>
                <span className="module-title" style={{ display: "block" }}>
                  {item.label}
                </span>
                <span className="module-subtitle">{MODULE_SUBTITLES[item.moduleKey!] ?? ""}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
