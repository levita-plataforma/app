import type { LucideIcon } from "lucide-react";
import { ArrowUp } from "lucide-react";

type StatCardProps = {
  icon: LucideIcon;
  value: string;
  label: string;
  delta?: string;
  accentBg: string;
  accentFg: string;
};

export default function StatCard({ icon: Icon, value, label, delta, accentBg, accentFg }: StatCardProps) {
  return (
    <div className="shell-card stat-card">
      <span className="stat-icon" style={{ background: accentBg, color: accentFg }}>
        <Icon aria-hidden="true" />
      </span>
      <div>
        <p className="stat-value">{value}</p>
        <p className="stat-label">{label}</p>
      </div>
      {delta ? (
        <p className="stat-delta">
          <ArrowUp aria-hidden="true" width={12} height={12} />
          {delta}
        </p>
      ) : null}
    </div>
  );
}
