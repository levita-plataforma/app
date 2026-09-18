"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Región de estado de la bandeja, compartida por todas sus acciones.
 *
 * Existe porque el control que dispara la acción desaparece con ella: al
 * marcar todo como leído se va el botón, y al marcar un aviso en la pestaña
 * «Sin leer» se va la fila entera. Si el mensaje viviera dentro de ellos, se
 * desmontaría antes de poder leerse y el foco caería al body.
 *
 * Por eso el mensaje se guarda fuera de los componentes, esta región se
 * mantiene siempre montada (así el lector de pantalla anuncia el cambio de
 * contenido) y el foco vuelve a un ancla estable: la pestaña «Sin leer».
 */

/** Id de la pestaña «Sin leer», que es el ancla de foco tras cada acción. */
export const AVISOS_FOCUS_ANCHOR_ID = "av-tab-sin-leer";

type Anuncio = { kind: "success" | "error"; message: string; seq: number; mueveFoco: boolean };

let anuncio: Anuncio | null = null;
let seq = 0;
const listeners = new Set<() => void>();

/**
 * Publica el resultado de una acción de la bandeja. Al vivir fuera de React,
 * sobrevive al desmontaje del componente que la lanzó.
 *
 * `mueveFoco` solo se pide cuando el control que se usó desaparece: si sigue
 * ahí (un error, por ejemplo), el foco se queda donde estaba.
 */
export function anunciarEnAvisos(
  kind: "success" | "error",
  message: string,
  mueveFoco = false,
): void {
  seq += 1;
  anuncio = { kind, message, seq, mueveFoco };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Anuncio | null {
  return anuncio;
}

/** En el servidor nunca hay mensaje: es siempre consecuencia de una acción. */
function getServerSnapshot(): Anuncio | null {
  return null;
}

export default function EstadoAvisos() {
  const actual = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const regionRef = useRef<HTMLParagraphElement>(null);
  const atendido = useRef(0);

  // Al salir de la bandeja el mensaje deja de tener sentido: si no se
  // limpiara, reaparecería al volver.
  useEffect(() => () => {
    anuncio = null;
  }, []);

  useEffect(() => {
    if (!actual || actual.seq === atendido.current) return;
    atendido.current = actual.seq;
    if (!actual.mueveFoco) return;
    const anchor = document.getElementById(AVISOS_FOCUS_ANCHOR_ID);
    (anchor ?? regionRef.current)?.focus();
  }, [actual]);

  const exito = actual && actual.kind === "success" ? actual.message : "";

  return (
    <>
      {/* Siempre en el árbol de accesibilidad, aunque esté vacía y no se vea:
          una región dinámica que se monta con el texto dentro no se anuncia. */}
      <p
        ref={regionRef}
        tabIndex={-1}
        role="status"
        className={exito ? "av-feedback is-success av-status" : "sr-only"}
      >
        {exito}
      </p>
      {actual && actual.kind === "error" ? (
        <p role="alert" className="av-feedback is-error av-status">
          {actual.message}
        </p>
      ) : null}
    </>
  );
}
