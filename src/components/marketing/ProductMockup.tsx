import { BrandMark } from "@/components/Logo";
import { Home, Users, UsersRound, CalendarClock, Music4, Baby, MessageCircle } from "lucide-react";

/**
 * Mockup ilustrativo del dashboard real de LEVITA, usado en el hero de la
 * home. Reproduce la forma visual de la app autenticada (sidebar + cards
 * por módulo) con los módulos y nombres reales del producto — nunca
 * módulos ficticios.
 */
export default function ProductMockup() {
  return (
    <div className="mkt-mockup">
      <div className="mkt-mockup-halo" aria-hidden="true" />
      <div className="mkt-mockup-window">
        <div className="mkt-mockup-chrome">
          <div className="mkt-mockup-dots">
            <i /><i /><i />
          </div>
          <div className="mkt-mockup-chromeline" />
        </div>
        <div className="mkt-mockup-body">
          <div className="mkt-mockup-sidebar">
            <div className="mkt-mockup-sidebar-logo">
              <BrandMark />
              <span>LEVITA</span>
            </div>
            <ul>
              <li className="is-active"><Home />Inicio</li>
              <li><Users />Personas</li>
              <li><UsersRound />Familias</li>
              <li><CalendarClock />Servicios</li>
              <li><Music4 />Alabanza</li>
              <li><Baby />Niños</li>
              <li><MessageCircle />Comunicación</li>
            </ul>
          </div>
          <div className="mkt-mockup-content">
            <p className="mkt-mockup-eyebrow" style={{ fontSize: 9, letterSpacing: ".14em", color: "var(--navy-soft)", textTransform: "uppercase" }}>
              Resumen de tu iglesia
            </p>
            <h4>Una iglesia más conectada</h4>
            <p>Personas · Servicios · Comunidad</p>
            <div className="mkt-mockup-grid">
              <div className="mkt-mockup-card">
                <span className="mkt-mockup-card-icon" style={{ "--icon-bg": "#ecf2f8", "--icon-color": "#547ca0" } as React.CSSProperties}>
                  <Users />
                </span>
                <p>Personas</p>
              </div>
              <div className="mkt-mockup-card">
                <span className="mkt-mockup-card-icon" style={{ "--icon-bg": "#edf3ee", "--icon-color": "#648674" } as React.CSSProperties}>
                  <CalendarClock />
                </span>
                <p>Servicios</p>
              </div>
              <div className="mkt-mockup-card">
                <span className="mkt-mockup-card-icon" style={{ "--icon-bg": "#f7f0e2", "--icon-color": "#aa8341" } as React.CSSProperties}>
                  <Baby />
                </span>
                <p>Niños</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
