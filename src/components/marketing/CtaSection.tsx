import Link from "next/link";

export default function CtaSection({
  title = "¿Listo para dar el siguiente paso?",
  description = "Cuéntanos sobre tu iglesia y te mostramos LEVITA en una demo personalizada.",
  primaryLabel = "Solicitar una demo",
  primaryHref = "/demo",
  secondaryLabel = "Iniciar sesión",
  secondaryHref = "/acceso",
}: {
  title?: string;
  description?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}) {
  return (
    <div className="mkt-cta">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="mkt-cta-actions">
        <Link href={primaryHref} className="mkt-btn mkt-btn--gold">
          {primaryLabel}
        </Link>
        <Link href={secondaryHref} className="mkt-btn mkt-btn--secondary">
          {secondaryLabel}
        </Link>
      </div>
    </div>
  );
}
