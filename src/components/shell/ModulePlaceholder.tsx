import type { LucideIcon } from "lucide-react";

type ModulePlaceholderProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

/**
 * Placeholder para módulos cuyo catálogo, entitlement y navegación ya
 * existen (Fase 0) pero cuyo CRUD funcional llega en una fase posterior
 * del roadmap (ver docs/13-plan-por-fases.md). Evita un 404 al navegar
 * desde el grid de módulos sin fingir una función que aún no existe.
 */
export default function ModulePlaceholder({ icon: Icon, title, description }: ModulePlaceholderProps) {
  return (
    <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
      <span
        className="module-icon"
        style={{ background: "var(--shell-active-bg)", color: "var(--shell-brand)", marginBottom: 4 }}
      >
        <Icon aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      <p style={{ fontSize: 12, color: "var(--shell-text-subtle)", marginTop: 4 }}>
        Este módulo está previsto en el roadmap y llegará en una fase posterior.
      </p>
    </div>
  );
}
