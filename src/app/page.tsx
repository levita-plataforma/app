import Logo from "@/components/Logo";
import ComingSoonHero from "@/components/ComingSoonHero";

export default function Home() {
  return <div className="page-shell"><header className="site-header"><Logo/><p className="brand-message">Iglesias más conectadas.<br/>Comunidades más vivas.</p></header><ComingSoonHero/><footer className="site-footer"><span aria-hidden="true"/><p>TECNOLOGÍA AL SERVICIO DE LA IGLESIA</p><span aria-hidden="true"/></footer></div>;
}
