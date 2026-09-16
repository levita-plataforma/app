"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, CirclePlay, Copy, Pencil } from "lucide-react";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import type { ActivityTemplateSummary } from "@/server/activities/activity-templates-service";
import { ACTIVITY_TYPE_INFO, SCHEDULE_KIND_LABELS } from "@/lib/activities/constants";
import { formatDuration } from "@/lib/activities/time";
import { primaryButtonStyle, secondaryButtonStyle } from "../../servicios/ui";
import { archivarPlantillaAction, duplicarPlantillaAction } from "./actions";

export type TemplateCardData = ActivityTemplateSummary & { canManage: boolean; canUse: boolean };

type Pending = { id: string; kind: "duplicate" | "archive" } | null;

const MAX_AREA_NAMES = 3;

export default function PlantillasList({ templates }: { templates: TemplateCardData[] }) {
  const [open, setOpen] = useState<Pending>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; href?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function openDuplicate(t: TemplateCardData) {
    setOpen({ id: t.id, kind: "duplicate" });
    setDuplicateName(`${t.name} (copia)`);
    setError(null);
  }

  function duplicate(t: TemplateCardData) {
    startTransition(async () => {
      const result = await duplicarPlantillaAction(t.id, duplicateName);
      setError(result.error);
      if (!result.error) {
        setOpen(null);
        setMessage({
          text: `Plantilla duplicada: «${duplicateName.trim() || `${t.name} (copia)`}».`,
          href: result.id ? `/app/actividades/plantillas/${result.id}` : undefined,
        });
      }
    });
  }

  function toggleArchive(t: TemplateCardData) {
    const archive = !t.archivedAt;
    startTransition(async () => {
      const result = await archivarPlantillaAction(t.id, archive);
      setError(result.error);
      if (!result.error) {
        setOpen(null);
        setMessage({ text: archive ? `«${t.name}» se ha archivado.` : `«${t.name}» se ha restaurado.` });
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {error ? (
        <p role="alert" className="tpl-error">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="tpl-success">
          {message.text}{" "}
          {message.href ? (
            <Link href={message.href} style={{ color: "var(--shell-brand)" }}>
              Abrir copia
            </Link>
          ) : null}
        </p>
      ) : null}

      <ul className="tpl-grid" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {templates.map((t) => {
          const isOpen = open?.id === t.id;
          const shownAreas = t.areaNames.slice(0, MAX_AREA_NAMES);
          const hiddenAreas = t.areaNames.length - shownAreas.length;
          return (
            <li key={t.id} className={`shell-card tpl-card${t.archivedAt ? " is-archived" : ""}`}>
              <div className="tpl-card-head">
                <div style={{ minWidth: 0 }}>
                  <h2 className="tpl-card-title">
                    {t.canManage ? (
                      <Link
                        href={`/app/actividades/plantillas/${t.id}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {t.name}
                      </Link>
                    ) : (
                      t.name
                    )}
                  </h2>
                  <p className="serving-meta">{t.campusName ?? "Toda la iglesia"}</p>
                </div>
              </div>

              <div className="tpl-chips">
                <span className="serving-chip tpl-type-chip">{ACTIVITY_TYPE_INFO[t.type].label}</span>
                {t.archivedAt ? (
                  <span className="serving-chip is-muted">Archivada</span>
                ) : t.active ? (
                  <span className="serving-chip is-success">Activa</span>
                ) : (
                  <span className="serving-chip is-warning">Inactiva</span>
                )}
                {t.scheduleKind === "flexible" ? (
                  <span className="serving-chip">{SCHEDULE_KIND_LABELS.flexible}</span>
                ) : null}
              </div>

              <dl className="tpl-facts">
                <div>
                  <dt>Hora de inicio</dt>
                  <dd>{t.scheduleKind === "flexible" ? "Sin hora fija" : (t.defaultLocalStartTime ?? "—")}</dd>
                </div>
                <div>
                  <dt>Duración</dt>
                  <dd>{formatDuration(t.defaultDurationMinutes)}</dd>
                </div>
                <div style={{ gridColumn: "1 / -1", minWidth: 0 }}>
                  <dt>Áreas ({t.areaCount})</dt>
                  <dd className="tpl-truncate" title={t.areaNames.join(", ")}>
                    {t.areaCount === 0
                      ? "Sin áreas de servicio"
                      : `${shownAreas.join(", ")}${hiddenAreas > 0 ? ` y ${hiddenAreas} más` : ""}`}
                  </dd>
                </div>
                <div>
                  <dt>Puestos</dt>
                  <dd>{t.positionCount}</dd>
                </div>
                <div>
                  <dt>Bloques del plan</dt>
                  <dd>{t.planItemCount}</dd>
                </div>
              </dl>

              {isOpen && open?.kind === "duplicate" ? (
                <form
                  className="tpl-inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    duplicate(t);
                  }}
                >
                  <label htmlFor={`tpl-dup-${t.id}`} style={authLabelStyle}>
                    Nombre de la copia
                  </label>
                  <input
                    id={`tpl-dup-${t.id}`}
                    value={duplicateName}
                    maxLength={120}
                    onChange={(e) => setDuplicateName(e.target.value)}
                    style={{ ...authInputStyle, width: "100%", minHeight: 44 }}
                    autoFocus
                  />
                  <div className="tpl-actions">
                    <button type="submit" disabled={pending} className="tpl-btn" style={primaryButtonStyle(pending)}>
                      {pending ? "Duplicando…" : "Duplicar"}
                    </button>
                    <button type="button" onClick={() => setOpen(null)} className="tpl-btn" style={secondaryButtonStyle()}>
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : null}

              {isOpen && open?.kind === "archive" ? (
                <div className="tpl-inline-form" role="group" aria-label="Confirmar">
                  <p style={{ fontSize: 13 }}>
                    {t.archivedAt
                      ? `¿Restaurar «${t.name}»? Volverá a aparecer en el listado.`
                      : `¿Archivar «${t.name}»? Dejará de ofrecerse al crear actividades. Las actividades ya creadas no cambian.`}
                  </p>
                  <div className="tpl-actions">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => toggleArchive(t)}
                      className="tpl-btn"
                      style={primaryButtonStyle(pending)}
                    >
                      {t.archivedAt ? "Restaurar" : "Archivar"}
                    </button>
                    <button type="button" onClick={() => setOpen(null)} className="tpl-btn" style={secondaryButtonStyle()}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="tpl-card-actions">
                {t.canUse ? (
                  <Link
                    href={`/app/actividades/nueva?plantilla=${t.id}`}
                    className="tpl-btn"
                    style={primaryButtonStyle()}
                  >
                    <CirclePlay size={14} aria-hidden="true" /> Usar
                  </Link>
                ) : null}
                {t.canManage ? (
                  <>
                    <Link
                      href={`/app/actividades/plantillas/${t.id}`}
                      className="tpl-btn"
                      style={secondaryButtonStyle()}
                      aria-label={`Editar ${t.name}`}
                    >
                      <Pencil size={14} aria-hidden="true" /> Editar
                    </Link>
                    <button
                      type="button"
                      className="tpl-btn"
                      style={secondaryButtonStyle()}
                      disabled={pending}
                      onClick={() => openDuplicate(t)}
                      aria-label={`Duplicar ${t.name}`}
                    >
                      <Copy size={14} aria-hidden="true" /> Duplicar
                    </button>
                    <button
                      type="button"
                      className="tpl-btn"
                      style={secondaryButtonStyle()}
                      disabled={pending}
                      onClick={() => {
                        setOpen({ id: t.id, kind: "archive" });
                        setError(null);
                      }}
                      aria-label={`${t.archivedAt ? "Restaurar" : "Archivar"} ${t.name}`}
                    >
                      {t.archivedAt ? (
                        <>
                          <ArchiveRestore size={14} aria-hidden="true" /> Restaurar
                        </>
                      ) : (
                        <>
                          <Archive size={14} aria-hidden="true" /> Archivar
                        </>
                      )}
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
