"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { crearAltaAsistidaAction, type AltaAsistidaState } from "./actions";

const initialState: AltaAsistidaState = { error: null };

export type ModuloOpcion = { key: string; label: string; description: string };

const PASOS = ["Datos de la iglesia", "Propietario", "Módulos", "Confirmación"] as const;

const PAISES = ["España", "Portugal", "México", "Argentina", "Colombia", "Chile", "Perú", "Estados Unidos", "Otro"];
const IDIOMAS = [
  { valor: "es-ES", texto: "Español (España)" },
  { valor: "es-419", texto: "Español (Latinoamérica)" },
  { valor: "pt-PT", texto: "Portugués (Portugal)" },
  { valor: "pt-BR", texto: "Portugués (Brasil)" },
  { valor: "en-US", texto: "Inglés" },
];
const MONEDAS = ["EUR", "USD", "MXN", "ARS", "COP", "CLP", "PEN", "BRL"];

function sugerirSlug(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Alta asistida en cuatro pasos. Todo vive en un único formulario: los pasos
 * ocultos conservan sus valores y se envían juntos al confirmar. El núcleo
 * (personas, servicios, eventos, comunicación) va siempre; aquí solo se eligen
 * los módulos activables, nunca los «próximamente».
 */
export default function AltaAsistidaForm({ modulos }: { modulos: ModuloOpcion[] }) {
  const [state, formAction, pending] = useActionState(crearAltaAsistidaAction, initialState);
  const [paso, setPaso] = useState(0);
  const [datos, setDatos] = useState({
    name: "",
    slug: "",
    slugTocado: false,
    country: "España",
    locale: "es-ES",
    timezone: "Europe/Madrid",
    currency: "EUR",
    adminEmail: "",
    ownerName: "",
    ownerEmail: "",
    modules: [] as string[],
  });

  const set = (k: keyof typeof datos, v: string) => setDatos((d) => ({ ...d, [k]: v }));
  const correoValido = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

  const errorPaso =
    paso === 0
      ? !datos.name.trim()
        ? "El nombre es obligatorio."
        : !/^[a-z0-9-]+$/.test(datos.slug)
          ? "El identificador solo admite minúsculas, números y guiones."
          : datos.adminEmail && !correoValido(datos.adminEmail)
            ? "El correo administrativo no es válido."
            : null
      : paso === 1
        ? !correoValido(datos.ownerEmail)
          ? "El correo del propietario no es válido."
          : null
        : null;

  if (state.invitationLink) {
    return (
      <div className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>Iglesia creada</h2>
        <p style={{ margin: 0 }}>
          Iglesia, sede principal, prueba de 30 días, módulos e invitación del propietario creados. El alta queda
          pendiente hasta que el propietario acepte y complete el onboarding.
        </p>
        <p style={{ margin: 0, fontWeight: 600 }}>Enlace de invitación del propietario:</p>
        <code style={{ wordBreak: "break-all", background: "var(--shell-active-bg)", padding: 10, borderRadius: "var(--shell-radius-sm)" }}>
          {state.invitationLink}
        </code>
        {/* No hay transporte de correo: si el operador cierra esto creyendo que se envió, no llegará nunca. */}
        <p style={{ margin: 0, color: "var(--shell-text-muted)" }}>
          <strong>No se ha enviado ningún correo.</strong> Cópialo y hazlo llegar al propietario. Se muestra una sola vez
          (solo se guarda su huella) y caduca a los 7 días. Si se pierde, reenvía la invitación desde la ficha.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="shell-button"
            style={{ fontSize: 12.5 }}
            onClick={() => void navigator.clipboard?.writeText(state.invitationLink ?? "")}
          >
            Copiar enlace
          </button>
          {state.churchId && (
            <Link href={`/operacion/iglesias/${state.churchId}`} style={{ fontSize: 12.5, alignSelf: "center" }}>
              Abrir la ficha de la iglesia
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <ol aria-label="Pasos" style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: 0, padding: 0, listStyle: "none", fontSize: 12 }}>
        {PASOS.map((p, i) => (
          <li
            key={p}
            aria-current={i === paso ? "step" : undefined}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid var(--shell-border)",
              fontWeight: i === paso ? 600 : 400,
              color: i <= paso ? "var(--shell-text)" : "var(--shell-text-muted)",
            }}
          >
            {i + 1}. {p}
          </li>
        ))}
      </ol>

      {/* Valores de todos los pasos: se envían juntos al confirmar. */}
      {(["name", "slug", "country", "locale", "timezone", "currency", "adminEmail", "ownerName", "ownerEmail"] as const).map((k) => (
        <input key={k} type="hidden" name={k} value={datos[k]} />
      ))}
      {datos.modules.map((m) => (
        <input key={m} type="hidden" name="modules" value={m} />
      ))}

      {paso === 0 && (
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Datos de la iglesia</legend>
          <Campo etiqueta="Nombre">
            <input
              value={datos.name}
              onChange={(e) =>
                setDatos((d) => ({ ...d, name: e.target.value, slug: d.slugTocado ? d.slug : sugerirSlug(e.target.value) }))
              }
              style={inputStyle}
              autoFocus
            />
          </Campo>
          <Campo etiqueta="Identificador (dirección)">
            <input
              value={datos.slug}
              onChange={(e) => setDatos((d) => ({ ...d, slug: e.target.value, slugTocado: true }))}
              style={inputStyle}
              placeholder="iglesia-central"
            />
          </Campo>
          <div style={filaStyle}>
            <Campo etiqueta="País">
              <select value={datos.country} onChange={(e) => set("country", e.target.value)} style={inputStyle}>
                {PAISES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Idioma">
              <select value={datos.locale} onChange={(e) => set("locale", e.target.value)} style={inputStyle}>
                {IDIOMAS.map((i) => (
                  <option key={i.valor} value={i.valor}>
                    {i.texto}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <div style={filaStyle}>
            <Campo etiqueta="Zona horaria">
              <input value={datos.timezone} onChange={(e) => set("timezone", e.target.value)} style={inputStyle} />
            </Campo>
            <Campo etiqueta="Moneda">
              <select value={datos.currency} onChange={(e) => set("currency", e.target.value)} style={inputStyle}>
                {MONEDAS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Campo>
          </div>
          <Campo etiqueta="Correo administrativo de la iglesia (opcional)">
            <input type="email" value={datos.adminEmail} onChange={(e) => set("adminEmail", e.target.value)} style={inputStyle} />
          </Campo>
        </fieldset>
      )}

      {paso === 1 && (
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Propietario</legend>
          <p style={ayudaStyle}>
            Recibe una invitación y crea su propia cuenta. LEVITA no define ninguna contraseña.
          </p>
          <Campo etiqueta="Nombre (opcional)">
            <input value={datos.ownerName} onChange={(e) => set("ownerName", e.target.value)} style={inputStyle} autoFocus />
          </Campo>
          <Campo etiqueta="Correo">
            <input type="email" value={datos.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} style={inputStyle} />
          </Campo>
        </fieldset>
      )}

      {paso === 2 && (
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Módulos iniciales</legend>
          <p style={ayudaStyle}>Personas, Servicios, Eventos y Comunicación van siempre incluidos.</p>
          {modulos.map((m) => (
            <label key={m.key} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={datos.modules.includes(m.key)}
                onChange={(e) =>
                  setDatos((d) => ({
                    ...d,
                    modules: e.target.checked ? [...d.modules, m.key] : d.modules.filter((x) => x !== m.key),
                  }))
                }
              />
              <span>
                <strong>{m.label}</strong> <span style={{ color: "var(--shell-text-muted)" }}>· {m.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {paso === 3 && (
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Confirmación</legend>
          <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 14px", margin: 0, fontSize: 13 }}>
            <dt>Iglesia</dt>
            <dd style={ddStyle}>{datos.name} · {datos.slug}</dd>
            <dt>Región</dt>
            <dd style={ddStyle}>{datos.country} · {datos.locale} · {datos.timezone} · {datos.currency}</dd>
            <dt>Correo administrativo</dt>
            <dd style={ddStyle}>{datos.adminEmail || "—"}</dd>
            <dt>Propietario</dt>
            <dd style={ddStyle}>{datos.ownerName ? `${datos.ownerName} · ` : ""}{datos.ownerEmail}</dd>
            <dt>Módulos</dt>
            <dd style={ddStyle}>
              Núcleo
              {datos.modules.length > 0 && ` + ${modulos.filter((m) => datos.modules.includes(m.key)).map((m) => m.label).join(", ")}`}
            </dd>
          </dl>
          <p style={ayudaStyle}>
            Se crearán la iglesia, la sede principal, la prueba de 30 días, los módulos, el onboarding y la invitación
            del propietario.
          </p>
        </fieldset>
      )}

      {(errorPaso && paso < 3) || state.error ? (
        <div role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)", display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={{ margin: 0 }}>{state.error ?? errorPaso}</p>
          {state.iglesiaExistenteId ? (
            <Link href={`/operacion/iglesias/${state.iglesiaExistenteId}`} style={{ color: "inherit" }}>
              Abrir la iglesia que ya usa ese identificador
            </Link>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
        <button type="button" className="shell-button" disabled={paso === 0 || pending} onClick={() => setPaso((p) => p - 1)} style={{ fontSize: 12.5 }}>
          Anterior
        </button>
        {/*
          Claves distintas a propósito: si React reutilizara el mismo botón, al
          pulsar «Siguiente» en el paso 3 cambiaría su tipo a submit dentro del
          mismo clic y el formulario se enviaría sin que nadie confirmara.
        */}
        {paso < 3 ? (
          <button key="siguiente" type="button" className="shell-button" disabled={Boolean(errorPaso)} onClick={() => setPaso((p) => p + 1)} style={{ fontSize: 12.5 }}>
            Siguiente
          </button>
        ) : (
          <button key="crear" type="submit" className="shell-button" disabled={pending} style={{ fontSize: 12.5, fontWeight: 600 }}>
            {pending ? "Creando…" : "Crear iglesia e invitar al propietario"}
          </button>
        )}
      </div>
    </form>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, flex: "1 1 200px" }}>
      {etiqueta}
      {children}
    </label>
  );
}

const fieldsetStyle: React.CSSProperties = { border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 };
const legendStyle: React.CSSProperties = { fontSize: 15, fontWeight: 600, marginBottom: 4, padding: 0 };
const filaStyle: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap" };
const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: "var(--shell-radius-md)",
  border: "1px solid var(--shell-border)",
  fontSize: 13,
  background: "var(--shell-surface, #fff)",
};
const ayudaStyle: React.CSSProperties = { margin: 0, fontSize: 12.5, color: "var(--shell-text-muted)" };
const ddStyle: React.CSSProperties = { margin: 0 };
