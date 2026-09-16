"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Search } from "lucide-react";

type FiltersProps = {
  campuses: { id: string; name: string }[];
  tags: { id: string; name: string; color: string | null }[];
  current: {
    q: string;
    relationship: string;
    campus: string;
    tag: string;
    hasAccount: string;
    archived: string;
  };
};

const RELATIONSHIP_OPTIONS = [
  { value: "", label: "Todos los estados" },
  { value: "visitor", label: "Visitante" },
  { value: "connected", label: "Conectado" },
  { value: "member", label: "Miembro" },
  { value: "server", label: "Voluntario" },
  { value: "leader", label: "Líder" },
  { value: "inactive", label: "Inactivo" },
];

/**
 * Filtros combinables que reflejan su estado en la URL (encargo de Fase 2
 * §5), permitiendo compartir/recargar la vista filtrada.
 */
export default function PersonasFilters({ campuses, tags, current }: FiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(current.q);
  const [, startTransition] = useTransition();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams({
      q: current.q,
      relationship: current.relationship,
      campus: current.campus,
      tag: current.tag,
      hasAccount: current.hasAccount,
      archived: current.archived,
      [key]: value,
    });
    for (const [k, v] of [...params.entries()]) {
      if (!v) params.delete(k);
    }
    params.set("page", "1");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="shell-card" style={{ padding: "14px 18px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
      <label className="shell-search" style={{ flex: "1 1 240px", maxWidth: 320 }}>
        <Search aria-hidden="true" />
        <input
          type="search"
          placeholder="Buscar por nombre, email o teléfono…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") updateParam("q", search);
          }}
          onBlur={() => updateParam("q", search)}
          aria-label="Buscar personas"
        />
      </label>

      <select value={current.relationship} onChange={(e) => updateParam("relationship", e.target.value)} style={selectStyle}>
        {RELATIONSHIP_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      <select value={current.campus} onChange={(e) => updateParam("campus", e.target.value)} style={selectStyle}>
        <option value="">Todas las sedes</option>
        {campuses.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      <select value={current.tag} onChange={(e) => updateParam("tag", e.target.value)} style={selectStyle}>
        <option value="">Todas las etiquetas</option>
        {tags.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      <select value={current.hasAccount} onChange={(e) => updateParam("hasAccount", e.target.value)} style={selectStyle}>
        <option value="">Con o sin cuenta</option>
        <option value="yes">Con cuenta</option>
        <option value="no">Sin cuenta</option>
      </select>

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--shell-text-muted)" }}>
        <input
          type="checkbox"
          checked={current.archived === "true"}
          onChange={(e) => updateParam("archived", e.target.checked ? "true" : "")}
        />
        Ver archivadas
      </label>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  border: "1px solid var(--shell-border)",
  borderRadius: "var(--shell-radius-sm)",
  padding: "8px 10px",
  fontSize: 12.5,
  background: "var(--shell-surface)",
  color: "var(--shell-text)",
};
