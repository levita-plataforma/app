import ProductPreview from "./ProductPreview";

export default function ComingSoonHero() {
  return <main className="hero"><div className="hero-copy"><div className="launch-badge"><span aria-hidden="true"/>LANZAMIENTO PRÓXIMO</div><h1>Muy pronto</h1><p className="hero-subtitle">La plataforma completa para iglesias estará disponible en breve.</p><p className="hero-description">Gestiona personas, equipos, eventos, comunicación y mucho más desde un solo lugar. LEVITA está siendo preparada para ayudar a las iglesias a organizar, conectar y cuidar mejor a su comunidad.</p></div><ProductPreview/><div className="launch-location"><span aria-hidden="true"/><p>PRÓXIMAMENTE EN ESPAÑA</p></div></main>;
}
