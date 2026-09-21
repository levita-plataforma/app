#!/usr/bin/env node
/**
 * Compara las migraciones locales (supabase/migrations/) con el historial
 * real registrado en producción, vía `supabase migration list --linked`.
 * Nace de la auditoría del 21 de septiembre de 2026 (ver
 * docs/13-plan-por-fases.md, "Auditoría de migraciones de producción"): el
 * merge en main no implica que las migraciones ya estén aplicadas en
 * producción, y `supabase db diff --linked` reporta ruido de formato en
 * CREATE OR REPLACE FUNCTION incluso cuando el esquema real ya coincide, así
 * que este script se apoya en el historial oficial, no en el diff completo.
 *
 * Requiere estar autenticado (`supabase login` o `SUPABASE_ACCESS_TOKEN`) y
 * el proyecto enlazado (`supabase link --project-ref <ref>`), o pasar
 * --project-ref explícitamente.
 *
 * Uso:
 *   node scripts/check-prod-migrations.mjs
 *   node scripts/check-prod-migrations.mjs --project-ref <ref>
 *
 * Salida: 0 si todo coincide, 1 si hay migraciones locales sin registrar en
 * producción (el caso que importa antes de declarar una fase "PRODUCCIÓN") o
 * registradas en producción sin archivo local (más raro, pero también se
 * avisa).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
const projectRefIdx = args.indexOf("--project-ref");
const projectRef = projectRefIdx >= 0 ? args[projectRefIdx + 1] : null;

function localVersions() {
  return fs
    .readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.split("_")[0])
    .filter((v) => /^\d+$/.test(v))
    .sort();
}

function remoteVersions() {
  const cmd = projectRef
    ? `supabase migration list --linked --project-ref ${projectRef}`
    : `supabase migration list --linked`;
  let raw;
  try {
    raw = execSync(cmd, { encoding: "utf8" });
  } catch (err) {
    console.error("\nNo se pudo consultar el historial remoto. ¿Estás autenticado y el proyecto enlazado?\n");
    console.error(err.stdout || err.message);
    process.exit(2);
  }

  const jsonLine = raw
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("{") && l.includes('"migrations"'));

  if (!jsonLine) {
    console.error("\nNo se encontró la línea JSON en la salida de `supabase migration list --linked`.\n");
    console.error(raw);
    process.exit(2);
  }

  const parsed = JSON.parse(jsonLine);
  return parsed.migrations
    .filter((m) => m.remote)
    .map((m) => m.remote)
    .sort();
}

const local = localVersions();
const remote = remoteVersions();
const localSet = new Set(local);
const remoteSet = new Set(remote);

const missingInProd = local.filter((v) => !remoteSet.has(v));
const missingLocally = remote.filter((v) => !localSet.has(v));

console.log(`Migraciones locales: ${local.length}`);
console.log(`Migraciones registradas en producción: ${remote.length}`);

if (missingInProd.length === 0 && missingLocally.length === 0) {
  console.log("\nOK: el historial de producción coincide exactamente con el repositorio.\n");
  process.exit(0);
}

if (missingInProd.length > 0) {
  console.log(`\nEn el repo pero NO registradas en producción (${missingInProd.length}):`);
  for (const v of missingInProd) console.log(`  ${v}`);
}

if (missingLocally.length > 0) {
  console.log(`\nRegistradas en producción pero SIN archivo local (${missingLocally.length}):`);
  for (const v of missingLocally) console.log(`  ${v}`);
}

console.log(
  "\nUn merge en main no aplica migraciones en producción por sí solo. Antes de declarar una fase " +
    '"PRODUCCIÓN", este script debe salir con "OK" — ver checklist en docs/13-plan-por-fases.md.\n',
);
process.exit(1);
