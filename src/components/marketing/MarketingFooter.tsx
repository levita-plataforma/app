import Link from "next/link";
import Logo from "@/components/Logo";

export default function MarketingFooter() {
  return (
    <footer className="mkt-footer">
      <div className="mkt-shell">
        <div className="mkt-footer-top">
          <div className="mkt-footer-brand">
            <Logo small />
            <p>Tecnología al servicio de la iglesia.</p>
          </div>

          <div className="mkt-footer-cols">
            <div className="mkt-footer-col">
              <h4>Producto</h4>
              <ul>
                <li><Link href="/producto">Producto</Link></li>
                <li><Link href="/modulos">Módulos</Link></li>
                <li><Link href="/para-iglesias">Para iglesias</Link></li>
              </ul>
            </div>
            <div className="mkt-footer-col">
              <h4>Seguridad</h4>
              <ul>
                <li><Link href="/seguridad">Seguridad y privacidad</Link></li>
              </ul>
            </div>
            <div className="mkt-footer-col">
              <h4>Contacto</h4>
              <ul>
                <li><Link href="/demo">Solicitar demo</Link></li>
                <li><Link href="/contacto">Contacto</Link></li>
              </ul>
            </div>
            <div className="mkt-footer-col">
              <h4>Cuenta</h4>
              <ul>
                <li><Link href="/acceso">Iniciar sesión</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mkt-footer-bottom">
          <p>Tecnología al servicio de la iglesia</p>
          <p>© {new Date().getFullYear()} LEVITA</p>
        </div>
      </div>
    </footer>
  );
}
