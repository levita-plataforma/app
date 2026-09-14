import Logo from "./Logo";
import Icon, { type IconName } from "./Icon";

const features: { title: string; description: string; icon: IconName; tone: string }[] = [
  { title: "Personas", description: "Acompaña y cuida", icon: "people", tone: "blue" },
  { title: "Equipos", description: "Sirve juntos", icon: "teams", tone: "green" },
  { title: "Eventos", description: "Organiza y crece", icon: "calendar", tone: "gold" },
  { title: "Comunicación", description: "Mantén la cercanía", icon: "message", tone: "rose" },
  { title: "Recursos", description: "Todo en un lugar", icon: "folder", tone: "blue" },
  { title: "Informes", description: "Toma mejores decisiones", icon: "chart", tone: "green" },
];
const navigation: { title: string; icon: IconName }[] = [{ title: "Inicio", icon: "home" }, ...features, { title: "Configuración", icon: "settings" }];

export default function ProductPreview() {
  return <figure className="product-preview" aria-label="Maqueta conceptual de la futura plataforma LEVITA">
    <div className="preview-halo" aria-hidden="true"/>
    <div className="orbit" aria-hidden="true"><span className="node node--people"><Icon name="people"/></span><span className="node node--church"><Icon name="church"/></span><span className="node node--heart"><Icon name="heart"/></span><span className="node node--growth"><Icon name="growth"/></span></div>
    <div className="product-window">
      <div className="window-chrome" aria-hidden="true"><div className="window-dots"><i/><i/><i/></div><span className="chrome-line"/><span className="chrome-end"/></div>
      <div className="product-body">
        <aside className="preview-sidebar"><Logo small/><ul>{navigation.map((item, index) => <li className={index === 0 ? "selected" : ""} key={item.title}><Icon name={item.icon}/><span>{item.title}</span></li>)}</ul><div className="sidebar-bottom" aria-hidden="true"><span/> <i/><i/></div></aside>
        <div className="preview-content"><div className="preview-heading"><span className="preview-eyebrow">TU COMUNIDAD, EN UN SOLO LUGAR</span><h2>Una iglesia más conectada</h2><p>Personas · Propósito · Comunidad</p></div><div className="feature-grid">{features.map(feature => <div className={`feature-card tone-${feature.tone}`} key={feature.title}><span className="feature-icon"><Icon name={feature.icon}/></span><h3>{feature.title}</h3><p>{feature.description}</p></div>)}</div><div className="preview-bottom" aria-hidden="true"><span className="status-dot"/><span>Un lugar para conectar y cuidar</span><span className="bottom-line"/></div></div>
      </div>
    </div>
    <figcaption className="sr-only">Vista ilustrativa: personas, equipos, eventos, comunicación, recursos e informes. No representa todavía la interfaz definitiva del producto.</figcaption>
  </figure>;
}
