"use client";

import "./estructura.css";
import { useMemo, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, GripVertical, ListOrdered, Pencil, Plus, Trash2 } from "lucide-react";
import {
  PLAN_ITEM_TYPES,
  PLAN_ITEM_TYPE_LABELS,
  isActivityEditable,
  type PlanItemType,
} from "@/lib/activities/constants";
import { computePlanTimeline, moveItem, type PlanTimelineEntry } from "@/lib/activities/planning";
import { durationMinutes, formatDuration, formatTime } from "@/lib/activities/time";
import type { ActivityPlanItem } from "@/server/activities/activity-structure-service";
import { addPlanItemAction, removePlanItemAction, reorderPlanAction, updatePlanItemAction } from "./actions";
import type { NamedOption } from "./load";
import { Chip, ConfirmButton, ErrorText, parseIntInput, useRunner } from "./shared";
import type { StructureTabsProps } from "./types";

const DURATION_MAX = 1440;
const OFFSET_MIN = -1440;
const OFFSET_MAX = 4320;

type Optimistic = { base: ActivityPlanItem[]; ids: string[] };

export function PlanTab({ activity, capabilities, data }: StructureTabsProps) {
  const router = useRouter();
  const editable = isActivityEditable(activity.status);
  const canEdit = capabilities.managePlan && editable;
  const timed = activity.scheduleKind === "timed" && activity.startsAt !== null;
  const activityDuration = timed ? durationMinutes(activity.startsAt, activity.endsAt) : null;

  const [optimistic, setOptimistic] = useState<Optimistic | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [reorderPending, startReorder] = useTransition();
  const [reorderError, setReorderError] = useState<string | null>(null);
  const rowRunner = useRunner();

  // El orden optimista solo vale mientras los datos del servidor no cambien.
  const items = useMemo(() => {
    if (!optimistic || optimistic.base !== data.plan) return data.plan;
    const byId = new Map(data.plan.map((item) => [item.id, item]));
    return optimistic.ids.map((id) => byId.get(id)).filter((item): item is ActivityPlanItem => Boolean(item));
  }, [optimistic, data.plan]);

  const timeline = useMemo(() => computePlanTimeline(items, activityDuration), [items, activityDuration]);
  const entryById = new Map(timeline.entries.map((entry) => [entry.id, entry]));

  function clock(minute: number): string {
    if (!activity.startsAt) return "";
    const instant = new Date(new Date(activity.startsAt).getTime() + minute * 60000).toISOString();
    return formatTime(instant, activity.timezone);
  }

  function applyOrder(fromIndex: number, toIndex: number, focusId?: string) {
    if (!canEdit || fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const ids = moveItem(
      items.map((item) => item.id),
      fromIndex,
      toIndex,
    );
    const moved = items[fromIndex];
    setOptimistic({ base: data.plan, ids });
    setAnnouncement(`«${moved.title}» movido a la posición ${ids.indexOf(moved.id) + 1} de ${ids.length}.`);
    if (focusId) {
      requestAnimationFrame(() => {
        const target = document.getElementById(focusId);
        if (target && !(target as HTMLButtonElement).disabled) target.focus();
      });
    }
    setReorderError(null);
    startReorder(async () => {
      try {
        const result = await reorderPlanAction(activity.id, ids);
        if (!result.error) return;
        // Rollback del orden optimista.
        setOptimistic(null);
        if (result.conflict) {
          setReorderError("El orden cambió; recarga. Se muestra la versión más reciente.");
          router.refresh();
        } else {
          setReorderError(result.error);
        }
      } catch {
        setOptimistic(null);
        setReorderError("No se pudo guardar el nuevo orden. Inténtalo de nuevo.");
      }
    });
  }

  function onDrop(e: DragEvent<HTMLLIElement>, targetId: string) {
    e.preventDefault();
    const sourceId = dragId ?? e.dataTransfer.getData("text/plain");
    setDragId(null);
    setOverId(null);
    if (!sourceId || sourceId === targetId) return;
    const ids = items.map((item) => item.id);
    applyOrder(ids.indexOf(sourceId), ids.indexOf(targetId));
  }

  const dragEnabled = canEdit && editingId === null && !adding;
  const exceedsText =
    timeline.exceedsActivity && activityDuration !== null
      ? `El plan dura ${formatDuration(timeline.endMinute)}, la actividad ${formatDuration(activityDuration)}.`
      : null;

  return (
    <div className="est-stack">
      <section className="shell-card est-card" aria-labelledby="est-plan-title">
        <div className="est-section-head">
          <h2 id="est-plan-title">Orden del servicio</h2>
          {canEdit && !adding ? (
            <button
              type="button"
              className="est-btn"
              onClick={() => {
                setEditingId(null);
                setAdding(true);
              }}
            >
              <Plus size={15} aria-hidden />
              Añadir bloque
            </button>
          ) : null}
        </div>

        {items.length > 0 ? (
          <p className="est-plan-summary">
            <span>
              <strong>{items.length}</strong> {items.length === 1 ? "bloque" : "bloques"}
            </span>
            <span>
              Duración planificada: <strong>{formatDuration(timeline.totalDurationMinutes)}</strong>
            </span>
            {timed && activityDuration !== null ? (
              <span>
                Actividad: <strong>{formatDuration(activityDuration)}</strong>
              </span>
            ) : null}
            {timed ? (
              <span>
                De <strong>{clock(timeline.startMinute)}</strong> a <strong>{clock(timeline.endMinute)}</strong>
              </span>
            ) : (
              <span>Sin hora fija: solo se muestran duraciones.</span>
            )}
          </p>
        ) : null}

        {exceedsText ? (
          <p className="est-issues" role="note">
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
              <AlertTriangle size={14} aria-hidden />
              {exceedsText}
            </span>
          </p>
        ) : null}

        {!editable && capabilities.managePlan ? (
          <p className="est-muted">La actividad está cerrada: su orden del servicio ya no se puede modificar.</p>
        ) : null}

        {adding ? (
          <PlanItemForm
            mode="add"
            items={items}
            people={data.people}
            onDone={() => setAdding(false)}
            submit={(input) => addPlanItemAction(activity.id, input)}
          />
        ) : null}

        <p className="est-sr-only" aria-live="polite">
          {announcement}
        </p>
        {reorderPending ? (
          <p className="est-muted" role="status">
            Guardando el nuevo orden…
          </p>
        ) : null}
        <ErrorText message={reorderError} />
        <ErrorText message={rowRunner.error} />

        {items.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "20px 12px" }}>
            <ListOrdered size={22} aria-hidden />
            <h3>Sin orden del servicio</h3>
            <p>
              {canEdit
                ? "Añade bloques (canciones, predicación, avisos…) con su duración en minutos."
                : "Esta actividad todavía no tiene orden del servicio."}
            </p>
          </div>
        ) : (
          <ol className="est-plan-list" aria-label="Bloques del orden del servicio">
            {items.map((item, index) => {
              const entry = entryById.get(item.id);
              if (editingId === item.id) {
                return (
                  <li key={item.id} className="est-plan-row is-editing">
                    <PlanItemForm
                      mode="edit"
                      item={item}
                      items={items}
                      people={data.people}
                      onDone={() => setEditingId(null)}
                      submit={(input) => updatePlanItemAction(item.id, input)}
                    />
                  </li>
                );
              }
              return (
                <li
                  key={item.id}
                  className={`est-plan-row${dragId === item.id ? " is-dragging" : ""}${
                    overId === item.id && dragId !== item.id ? " is-drop-target" : ""
                  }`}
                  draggable={dragEnabled}
                  onDragStart={(e) => {
                    if (!dragEnabled) return;
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", item.id);
                    setDragId(item.id);
                  }}
                  onDragOver={(e) => {
                    if (!dragEnabled || !dragId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (overId !== item.id) setOverId(item.id);
                  }}
                  onDragLeave={() => {
                    if (overId === item.id) setOverId(null);
                  }}
                  onDrop={(e) => onDrop(e, item.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                >
                  {canEdit ? (
                    <span className="est-drag-handle" aria-hidden title="Arrastra para reordenar">
                      <GripVertical size={16} />
                    </span>
                  ) : (
                    <span aria-hidden />
                  )}

                  <PlanTime item={item} entry={entry} timed={timed} clock={clock} />

                  <div className="est-plan-body">
                    <span className="est-chips">
                      <span className="est-plan-type">{PLAN_ITEM_TYPE_LABELS[item.itemType]}</span>
                      <span className="est-plan-title">{item.title}</span>
                    </span>
                    <span className="est-plan-meta">
                      Duración: {item.durationMinutes === null ? "sin indicar" : formatDuration(item.durationMinutes)}
                      {item.startOffsetMinutes !== null
                        ? ` · Inicio fijado a ${item.startOffsetMinutes} min del comienzo`
                        : ""}
                    </span>
                    {item.responsiblePersonName || item.responsibleText ? (
                      <span className="est-plan-meta">
                        Responsable: {item.responsiblePersonName ?? item.responsibleText}
                      </span>
                    ) : null}
                    {item.notes ? <span className="est-plan-meta">{item.notes}</span> : null}
                    {entry && (entry.overlapsPrevious || entry.gapBeforeMinutes > 0) ? (
                      <span className="est-chips">
                        {entry.overlapsPrevious ? (
                          <Chip tone="warning">
                            <AlertTriangle size={12} aria-hidden />
                            Se solapa con el bloque anterior
                          </Chip>
                        ) : null}
                        {entry.gapBeforeMinutes > 0 ? (
                          <Chip tone="muted">Hueco de {formatDuration(entry.gapBeforeMinutes)} antes</Chip>
                        ) : null}
                      </span>
                    ) : null}
                  </div>

                  {canEdit ? (
                    <div className="est-plan-tools">
                      <button
                        type="button"
                        id={`est-up-${item.id}`}
                        className="est-icon-btn"
                        aria-label={`Subir «${item.title}»`}
                        disabled={index === 0}
                        onClick={() => applyOrder(index, index - 1, index - 1 === 0 ? `est-down-${item.id}` : `est-up-${item.id}`)}
                      >
                        <ArrowUp size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        id={`est-down-${item.id}`}
                        className="est-icon-btn"
                        aria-label={`Bajar «${item.title}»`}
                        disabled={index === items.length - 1}
                        onClick={() =>
                          applyOrder(
                            index,
                            index + 1,
                            index + 1 === items.length - 1 ? `est-up-${item.id}` : `est-down-${item.id}`,
                          )
                        }
                      >
                        <ArrowDown size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="est-icon-btn"
                        aria-label={`Editar «${item.title}»`}
                        onClick={() => {
                          setAdding(false);
                          setEditingId(item.id);
                        }}
                      >
                        <Pencil size={15} aria-hidden />
                      </button>
                      <ConfirmButton
                        label={<Trash2 size={15} aria-hidden />}
                        triggerClassName="est-icon-btn"
                        triggerAriaLabel={`Eliminar «${item.title}»`}
                        confirmLabel="Eliminar bloque"
                        disabled={rowRunner.pending}
                        message={`Se eliminará «${item.title}» del orden del servicio.`}
                        onConfirm={() => rowRunner.run(() => removePlanItemAction(item.id))}
                      />
                    </div>
                  ) : (
                    <span aria-hidden />
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function PlanTime({
  item,
  entry,
  timed,
  clock,
}: {
  item: ActivityPlanItem;
  entry: PlanTimelineEntry | undefined;
  timed: boolean;
  clock: (minute: number) => string;
}) {
  if (!timed || !entry) {
    return (
      <div className="est-plan-time">
        <strong>{item.durationMinutes === null ? "—" : formatDuration(item.durationMinutes)}</strong>
      </div>
    );
  }
  return (
    <div className="est-plan-time">
      <strong>{clock(entry.startMinute)}</strong>
      {item.durationMinutes ? <span>hasta {clock(entry.endMinute)}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulario de bloque
// ---------------------------------------------------------------------------

type PlanSubmitInput = Parameters<typeof addPlanItemAction>[1];

function PlanItemForm({
  mode,
  item,
  items,
  people,
  submit,
  onDone,
}: {
  mode: "add" | "edit";
  item?: ActivityPlanItem;
  items: ActivityPlanItem[];
  people: NamedOption[];
  submit: (input: PlanSubmitInput) => Promise<{ error: string | null }>;
  onDone: () => void;
}) {
  const [itemType, setItemType] = useState<PlanItemType>(item?.itemType ?? "song");
  const [title, setTitle] = useState(item?.title ?? "");
  const [duration, setDuration] = useState(
    item ? (item.durationMinutes === null ? "" : String(item.durationMinutes)) : "5",
  );
  const [offset, setOffset] = useState(item?.startOffsetMinutes === null || !item ? "" : String(item.startOffsetMinutes));
  const [responsibleMode, setResponsibleMode] = useState<"person" | "text">(
    item?.responsibleText && !item.responsiblePersonId ? "text" : "person",
  );
  const [personId, setPersonId] = useState(item?.responsiblePersonId ?? "");
  const [responsibleText, setResponsibleText] = useState(item?.responsibleText ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [insertAfter, setInsertAfter] = useState("end");
  const runner = useRunner();
  const prefix = `est-plan-${item?.id ?? "new"}`;

  // La persona actual puede no estar en la lista acotada: se añade.
  const personOptions =
    item?.responsiblePersonId && !people.some((p) => p.id === item.responsiblePersonId)
      ? [{ id: item.responsiblePersonId, name: item.responsiblePersonName ?? "Persona actual" }, ...people]
      : people;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      runner.setError("Indica el título del bloque.");
      return;
    }
    const durationValue = parseIntInput(duration);
    if (durationValue === undefined || (durationValue !== null && (durationValue < 0 || durationValue > DURATION_MAX))) {
      runner.setError(`La duración debe ser un número entero de minutos entre 0 y ${DURATION_MAX}.`);
      return;
    }
    const offsetValue = parseIntInput(offset);
    if (offsetValue === undefined || (offsetValue !== null && (offsetValue < OFFSET_MIN || offsetValue > OFFSET_MAX))) {
      runner.setError(`El inicio debe ser un número entero de minutos entre ${OFFSET_MIN} y ${OFFSET_MAX}.`);
      return;
    }
    const input: PlanSubmitInput = {
      itemType,
      title: title.trim(),
      durationMinutes: durationValue,
      startOffsetMinutes: offsetValue,
      responsiblePersonId: responsibleMode === "person" ? personId || null : null,
      responsibleText: responsibleMode === "text" ? responsibleText.trim() || null : null,
      notes: notes.trim() || null,
    };
    if (mode === "add" && insertAfter !== "end") {
      const index = items.findIndex((i) => i.id === insertAfter);
      if (index >= 0) input.position = index + 1;
    }
    runner.run(() => submit(input), onDone);
  }

  return (
    <form className="est-form" onSubmit={onSubmit} aria-label={mode === "add" ? "Añadir bloque" : "Editar bloque"}>
      <div className="est-form-grid">
        <div className="est-field">
          <label htmlFor={`${prefix}-type`}>Tipo</label>
          <select id={`${prefix}-type`} value={itemType} onChange={(e) => setItemType(e.target.value as PlanItemType)}>
            {PLAN_ITEM_TYPES.map((value) => (
              <option key={value} value={value}>
                {PLAN_ITEM_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="est-field is-wide">
          <label htmlFor={`${prefix}-title`}>Título</label>
          <input
            id={`${prefix}-title`}
            type="text"
            value={title}
            maxLength={200}
            required
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="est-field">
          <label htmlFor={`${prefix}-duration`}>Duración (min)</label>
          <input
            id={`${prefix}-duration`}
            type="number"
            inputMode="numeric"
            min={0}
            max={DURATION_MAX}
            step={1}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </div>
        <div className="est-field">
          <label htmlFor={`${prefix}-offset`}>Inicio fijo (min desde el comienzo, opcional)</label>
          <input
            id={`${prefix}-offset`}
            type="number"
            inputMode="numeric"
            min={OFFSET_MIN}
            max={OFFSET_MAX}
            step={1}
            value={offset}
            aria-describedby={`${prefix}-offset-help`}
            onChange={(e) => setOffset(e.target.value)}
          />
          <span id={`${prefix}-offset-help`} className="est-help">
            Negativo = antes del inicio. Vacío = empieza al terminar el bloque anterior.
          </span>
        </div>
        {mode === "add" && items.length > 0 ? (
          <div className="est-field">
            <label htmlFor={`${prefix}-position`}>Posición</label>
            <select id={`${prefix}-position`} value={insertAfter} onChange={(e) => setInsertAfter(e.target.value)}>
              <option value="end">Al final</option>
              {items.map((i, index) => (
                <option key={i.id} value={i.id}>
                  Después de {index + 1}. {i.title}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <fieldset className="est-fieldset est-field is-wide">
          <legend>Responsable (opcional)</legend>
          <label className="est-radio">
            <input
              type="radio"
              name={`${prefix}-resp-mode`}
              checked={responsibleMode === "person"}
              onChange={() => setResponsibleMode("person")}
            />
            Persona de la iglesia
          </label>
          <label className="est-radio">
            <input
              type="radio"
              name={`${prefix}-resp-mode`}
              checked={responsibleMode === "text"}
              onChange={() => setResponsibleMode("text")}
            />
            Texto libre
          </label>
        </fieldset>
        {responsibleMode === "person" ? (
          <div className="est-field">
            <label htmlFor={`${prefix}-person`}>Persona</label>
            <select id={`${prefix}-person`} value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">Sin responsable</option>
              {personOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="est-field">
            <label htmlFor={`${prefix}-resp-text`}>Responsable</label>
            <input
              id={`${prefix}-resp-text`}
              type="text"
              value={responsibleText}
              maxLength={200}
              placeholder="p. ej. Equipo de alabanza"
              onChange={(e) => setResponsibleText(e.target.value)}
            />
          </div>
        )}
        <div className="est-field is-wide">
          <label htmlFor={`${prefix}-notes`}>Notas (opcional)</label>
          <textarea id={`${prefix}-notes`} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <ErrorText message={runner.error} />
      <div className="est-actions">
        <button type="submit" className="est-btn is-primary" disabled={runner.pending}>
          {runner.pending ? "Guardando…" : mode === "add" ? "Añadir bloque" : "Guardar"}
        </button>
        <button type="button" className="est-btn" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
