#!/usr/bin/env node
/**
 * Renumera las migraciones de la rama actual al formato nuevo: la fecha y hora
 * UTC de creación, catorce dígitos (FUNCIONAMIENTO.md §8).
 *
 * Para qué sirve: si tu rama tiene migraciones cuyo número ya está ocupado en
 * main o en otra rama, `supabase db push` dará esas versiones por aplicadas y
 * NO ejecutará tu SQL, sin dar ningún error. Este script las renumera
 * conservando su orden relativo.
 *
 * Qué toca y qué no:
 *   - Solo las migraciones de TU rama que no están en origin/main. Las que ya
 *     están integradas no se tocan nunca: renombrar una migración aplicada
 *     rompe el historial.
 *   - Renombra con `git mv`, así que el historial sigue los ficheros.
 *   - No hace commit. Revisas y commiteas tú.
 *
 * Uso:
 *   node scripts/renumerar-migraciones.mjs            # enseña qué haría
 *   node scripts/renumerar-migraciones.mjs --aplicar  # lo hace
 *
 * Opciones:
 *   --base <rama>   contra qué comparar para saber qué es tuyo (origin/main)
 *   --desde <ts>    primer prefijo a usar, YYYYMMDDHHMMSS (por defecto, ahora)
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const base = valorDe("--base") ?? "origin/main";
const desde = valorDe("--desde");

function valorDe(nombre) {
  const i = args.indexOf(nombre);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}

function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
}

function salir(mensaje) {
  console.error(`\n${mensaje}\n`);
  process.exit(1);
}

// --- Comprobaciones previas -------------------------------------------------

try {
  git("rev-parse --is-inside-work-tree");
} catch {
  salir("Esto hay que ejecutarlo dentro del repositorio.");
}

if (git("status --porcelain")) {
  salir(
    "Tienes cambios sin guardar. Haz commit o guárdalos antes de renumerar:\n" +
      "renombrar ficheros con el árbol sucio complica deshacerlo si algo sale mal.",
  );
}

try {
  git(`rev-parse --verify ${base}`);
} catch {
  salir(`No encuentro la rama de referencia «${base}». ¿Has hecho git fetch?`);
}

// --- Qué migraciones son tuyas ----------------------------------------------

const mias = git(`diff --name-only ${base}...HEAD -- supabase/migrations/`)
  .split("\n")
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => fs.existsSync(f))
  .sort();

if (mias.length === 0) {
  console.log(`No hay migraciones en esta rama que no estén ya en ${base}. Nada que renumerar.`);
  process.exit(0);
}

// --- El último prefijo que ya existe en la base de referencia ----------------

const enBase = git(`ls-tree --name-only ${base} supabase/migrations/`)
  .split("\n")
  .filter((f) => f.endsWith(".sql"))
  .map((f) => path.basename(f).split("_")[0])
  .filter((n) => /^\d+$/.test(n))
  .sort();

const ultimoEnBase = enBase.at(-1) ?? "0";

// --- Prefijos nuevos --------------------------------------------------------

function ahoraUtc() {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

function sumarSegundos(ts, segundos) {
  const d = new Date(
    Date.UTC(
      Number(ts.slice(0, 4)), Number(ts.slice(4, 6)) - 1, Number(ts.slice(6, 8)),
      Number(ts.slice(8, 10)), Number(ts.slice(10, 12)), Number(ts.slice(12, 14)) + segundos,
    ),
  );
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

// La hora real, salvo que quede por detrás de lo que ya existe. El proyecto
// arrastra prefijos con fechas por delante del calendario —se numeraron a mano
// y algunos apuntan a octubre—, así que hasta que el tiempo los alcance hay que
// seguir por detrás del último. Una migración con prefijo anterior al último
// aplicado obliga a `db push --include-all` y deja el orden en el aire.
const porReloj = desde ?? ahoraUtc();

if (!/^\d{14}$/.test(porReloj)) salir("El prefijo de --desde tiene que ser YYYYMMDDHHMMSS (catorce dígitos).");

const ultimoNormalizado = ultimoEnBase.padEnd(14, "0");
const inicio = porReloj > ultimoNormalizado ? porReloj : sumarSegundos(ultimoNormalizado, 1);

if (!desde && inicio !== porReloj) {
  console.log(
    `\nAviso: la hora actual (${porReloj}) queda por detrás del último prefijo de ${base} ` +
      `(${ultimoEnBase}),\nasí que se empieza justo detrás de ese, en ${inicio}.`,
  );
}

// Un segundo entre cada una: conserva el orden relativo, que es lo que importa.
const cambios = mias.map((viejo, i) => {
  const nombre = path.basename(viejo);
  const resto = nombre.slice(nombre.indexOf("_"));
  const nuevoPrefijo = sumarSegundos(inicio, i);
  return {
    viejo,
    nuevo: path.join(path.dirname(viejo), nuevoPrefijo + resto).replace(/\\/g, "/"),
    viejoPrefijo: nombre.split("_")[0],
    nuevoPrefijo,
  };
});

// El primero tiene que quedar por detrás de todo lo que ya existe, o `db push`
// pedirá --include-all y el orden dejará de ser evidente.
if (cambios[0].nuevoPrefijo <= ultimoNormalizado) {
  salir(
    `El prefijo nuevo (${cambios[0].nuevoPrefijo}) no queda por detrás del último de ${base} (${ultimoEnBase}).\n` +
      `Usa --desde con un valor mayor.`,
  );
}

// --- Referencias por nombre dentro del repositorio ---------------------------

const referencias = [];
for (const c of cambios) {
  let encontradas = "";
  try {
    encontradas = execSync(
      `git grep -l --fixed-strings "${path.basename(c.viejo, ".sql")}" -- . ":(exclude)supabase/migrations"`,
      { encoding: "utf8" },
    ).trim();
  } catch {
    // git grep sale con 1 cuando no encuentra nada.
  }
  if (encontradas) referencias.push({ fichero: path.basename(c.viejo), en: encontradas.split("\n") });
}

// --- Resultado ---------------------------------------------------------------

console.log(`\nMigraciones de esta rama que no están en ${base}: ${cambios.length}`);
console.log(`Último prefijo ya existente en ${base}: ${ultimoEnBase}\n`);

for (const c of cambios) {
  console.log(`  ${c.viejoPrefijo}  ->  ${c.nuevoPrefijo}   ${path.basename(c.viejo).slice(path.basename(c.viejo).indexOf("_") + 1)}`);
}

if (referencias.length > 0) {
  console.log("\nOjo: estos nombres se mencionan en otros ficheros y habrá que actualizarlos a mano:");
  for (const r of referencias) {
    console.log(`  ${r.fichero}`);
    for (const f of r.en) console.log(`      ${f}`);
  }
}

if (!aplicar) {
  console.log("\nEsto es solo una previsualización. Para hacerlo:");
  console.log("  node scripts/renumerar-migraciones.mjs --aplicar\n");
  process.exit(0);
}

for (const c of cambios) {
  execSync(`git mv "${c.viejo}" "${c.nuevo}"`);
}

// Comprobación final: que no quede ningún prefijo repetido.
const todos = fs
  .readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .map((f) => f.split("_")[0]);
const repetidos = todos.filter((n, i) => todos.indexOf(n) !== i);

if (repetidos.length > 0) {
  salir(`Después de renumerar siguen repetidos: ${[...new Set(repetidos)].join(", ")}`);
}

console.log(`\nListo: ${cambios.length} migraciones renumeradas y ningún prefijo repetido.`);
console.log("Revisa el resultado, actualiza las referencias si las había, y haz commit.\n");
console.log("Antes de aplicar nada, comprueba que salen todas:");
console.log("  npx supabase db push --dry-run\n");
