// Invariante: toda acción que se escribe en la auditoría de plataforma tiene un
// nombre legible en la pantalla de auditoría (CA-3.5).
//
// Por qué existe esta prueba: el diccionario de la pantalla se escribe a mano y
// las acciones se registran en SQL, así que nada obligaba a que coincidieran. Al
// revisar CA-3 faltaban diez, entre ellas «iglesia creada» y «responsable
// invitado», que son de las más frecuentes: la tabla las mostraba como
// `platform.church_created`. No rompía nada, y por eso nadie lo veía.
//
// La misma forma de fallo ya había aparecido en la Fase 13 con los estados de
// comunicación: una lista escrita a mano que se queda corta respecto a la base.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.join(import.meta.dirname, "..", "..");
const migraciones = path.join(raiz, "supabase", "migrations");
const pantalla = path.join(raiz, "src", "app", "(app)", "operacion", "auditoria", "page.tsx");

/**
 * Acciones registradas en SQL.
 *
 * Se toma el primer argumento de cada `write_platform_audit(...)` y los inserts
 * directos en `platform_audit_logs`. El primer argumento no siempre es un
 * literal: `platform_set_module` usa `case when ... then 'platform.module_enabled'
 * else 'platform.module_disabled' end`, así que se recogen todos los literales
 * de la ventana previa a los metadatos, no solo el primero.
 */
function accionesEnSql() {
  const encontradas = new Set();
  const prefijos = /^(platform|subscription|church|support|operations)\./;

  for (const fichero of fs.readdirSync(migraciones).filter((f) => f.endsWith(".sql"))) {
    const sql = fs.readFileSync(path.join(migraciones, fichero), "utf8");

    for (const m of sql.matchAll(/write_platform_audit\s*\(/g)) {
      // Hasta el cierre del primer argumento: basta una ventana, porque los
      // metadatos van después y sus claves no llevan punto.
      const ventana = sql.slice(m.index, m.index + 220);
      for (const lit of ventana.matchAll(/'([a-z_]+\.[a-z_.]+)'/g)) {
        if (prefijos.test(lit[1])) encontradas.add(lit[1]);
      }
    }

    // El arranque del primer operador escribe directamente en la tabla.
    for (const m of sql.matchAll(/insert\s+into\s+platform_audit_logs[\s\S]{0,400}?;/gi)) {
      for (const lit of m[0].matchAll(/'([a-z_]+\.[a-z_.]+)'/g)) {
        if (prefijos.test(lit[1])) encontradas.add(lit[1]);
      }
    }
  }

  // Las claves de capacidad caen en la misma ventana, porque las funciones
  // comprueban el permiso justo antes de auditar. Se descartan con la lista
  // real del repositorio y no por la forma del nombre: filtrar por sufijo dejó
  // fuera `platform.bootstrap`, que es una acción y no una capacidad.
  const capacidades = capacidadesDeclaradas();
  return [...encontradas].filter((a) => !capacidades.has(a)).sort();
}

function capacidadesDeclaradas() {
  const servicio = fs.readFileSync(
    path.join(raiz, "src", "server", "platform", "platform-service.ts"),
    "utf8",
  );
  const bloque = servicio.match(/const PLATFORM_CAPABILITIES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  assert.ok(bloque, "no se encuentra PLATFORM_CAPABILITIES en el servicio de plataforma");
  return new Set([...bloque[1].matchAll(/"([a-z_.]+)"/g)].map((m) => m[1]));
}

function accionesConNombre() {
  const tsx = fs.readFileSync(pantalla, "utf8");
  const bloque = tsx.match(/const ACCIONES[^=]*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(bloque, "no se encuentra el diccionario ACCIONES en la pantalla de auditoría");
  return new Set([...bloque[1].matchAll(/"([a-z_]+\.[a-z_.]+)"\s*:/g)].map((m) => m[1]));
}

test("la detección de acciones encuentra algo: si no, la prueba no probaría nada", () => {
  const enSql = accionesEnSql();
  assert.ok(
    enSql.length >= 15,
    `solo se han detectado ${enSql.length} acciones en las migraciones; la extracción está rota`,
  );
});

test("toda acción auditada tiene nombre legible en la pantalla de auditoría", () => {
  const conNombre = accionesConNombre();
  const sinNombre = accionesEnSql().filter((a) => !conNombre.has(a));

  assert.deepEqual(
    sinNombre,
    [],
    `Estas acciones se registran en la auditoría y la pantalla las mostraría con su clave técnica: ${sinNombre.join(", ")}. ` +
      `Añádelas al diccionario ACCIONES de src/app/(app)/operacion/auditoria/page.tsx.`,
  );
});

test("platform.bootstrap se detecta aunque se escriba con un insert directo", () => {
  // Caso aparte a propósito: si alguien cambia esa función a write_platform_audit
  // la prueba seguirá cubriéndola, y si la rompe, lo dirá.
  assert.ok(accionesEnSql().includes("platform.bootstrap"));
});
