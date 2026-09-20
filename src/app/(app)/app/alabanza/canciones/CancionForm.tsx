"use client";

import { useActionState } from "react";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import { primaryButtonStyle } from "../ui";
import { WORSHIP_KEY_ROOT_OPTIONS, WORSHIP_KEY_MODE_LABELS } from "../ui";
import type { WorshipSong } from "@/server/worship/worship-service";
import { crearCancionAction, actualizarCancionAction, type CancionFormState } from "./actions";

const initialState: CancionFormState = { error: null };

const fieldWrapStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };

function KeySelect({
  rootName,
  modeName,
  defaultRoot,
  defaultMode,
  label,
}: {
  rootName: string;
  modeName: string;
  defaultRoot?: string;
  defaultMode?: string;
  label: string;
}) {
  return (
    <div style={fieldWrapStyle}>
      <label style={authLabelStyle}>{label}</label>
      <div style={{ display: "flex", gap: 8 }}>
        <select name={rootName} defaultValue={defaultRoot ?? ""} style={{ ...authInputStyle, flex: 1 }}>
          <option value="">Sin definir</option>
          {WORSHIP_KEY_ROOT_OPTIONS.map((root) => (
            <option key={root} value={root}>
              {root}
            </option>
          ))}
        </select>
        <select name={modeName} defaultValue={defaultMode ?? ""} style={{ ...authInputStyle, flex: 1 }}>
          <option value="">—</option>
          <option value="major">{WORSHIP_KEY_MODE_LABELS.major}</option>
          <option value="minor">{WORSHIP_KEY_MODE_LABELS.minor}</option>
        </select>
      </div>
    </div>
  );
}

export default function CancionForm({ song }: { song?: WorshipSong }) {
  const action = song ? actualizarCancionAction.bind(null, song.id) : crearCancionAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {state.error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {state.error}
        </p>
      ) : null}

      <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>Información</p>

        <div style={fieldWrapStyle}>
          <label htmlFor="title" style={authLabelStyle}>
            Título *
          </label>
          <input id="title" name="title" required defaultValue={song?.title} style={authInputStyle} />
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ ...fieldWrapStyle, flex: "1 1 200px" }}>
            <label htmlFor="subtitle" style={authLabelStyle}>
              Subtítulo
            </label>
            <input id="subtitle" name="subtitle" defaultValue={song?.subtitle ?? ""} style={authInputStyle} />
          </div>
          <div style={{ ...fieldWrapStyle, flex: "1 1 200px" }}>
            <label htmlFor="author" style={authLabelStyle}>
              Autor
            </label>
            <input id="author" name="author" defaultValue={song?.author ?? ""} style={authInputStyle} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ ...fieldWrapStyle, flex: "1 1 160px" }}>
            <label htmlFor="language" style={authLabelStyle}>
              Idioma
            </label>
            <input id="language" name="language" defaultValue={song?.language ?? ""} style={authInputStyle} placeholder="es" />
          </div>
          <div style={{ ...fieldWrapStyle, flex: "1 1 120px" }}>
            <label htmlFor="bpm" style={authLabelStyle}>
              BPM
            </label>
            <input id="bpm" name="bpm" type="number" min={1} max={300} defaultValue={song?.bpm ?? ""} style={authInputStyle} />
          </div>
          <div style={{ ...fieldWrapStyle, flex: "1 1 120px" }}>
            <label htmlFor="timeSignature" style={authLabelStyle}>
              Compás
            </label>
            <input
              id="timeSignature"
              name="timeSignature"
              defaultValue={song?.timeSignature ?? ""}
              style={authInputStyle}
              placeholder="4/4"
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <KeySelect
            rootName="originalKeyRoot"
            modeName="originalKeyMode"
            defaultRoot={song?.originalKey?.root}
            defaultMode={song?.originalKey?.mode}
            label="Tonalidad original"
          />
          <KeySelect
            rootName="defaultKeyRoot"
            modeName="defaultKeyMode"
            defaultRoot={song?.defaultKey?.root}
            defaultMode={song?.defaultKey?.mode}
            label="Tonalidad por defecto"
          />
        </div>
      </section>

      <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>Letra</p>
        <textarea
          name="lyrics"
          defaultValue={song?.lyrics ?? ""}
          rows={10}
          style={{ ...authInputStyle, fontFamily: "var(--font-mono, monospace)", resize: "vertical" }}
          placeholder="Letra en texto plano."
        />
      </section>

      <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>Cifra</p>
        <p style={{ fontSize: 12, color: "var(--shell-text-muted)" }}>
          Texto plano. Acordes entre corchetes sobre la letra, por ejemplo: [C]Letra [G]de [Am]prueba.
        </p>
        <textarea
          name="chords"
          defaultValue={song?.chords ?? ""}
          rows={10}
          style={{ ...authInputStyle, fontFamily: "var(--font-mono, monospace)", resize: "vertical" }}
        />
      </section>

      <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>Notas</p>
        <textarea
          name="notes"
          defaultValue={song?.notes ?? ""}
          rows={3}
          style={authInputStyle}
          placeholder="Notas internas, nunca datos pastorales ni financieros."
        />
      </section>

      <div>
        <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
