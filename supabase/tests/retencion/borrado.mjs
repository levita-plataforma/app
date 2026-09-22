#!/usr/bin/env node
/**
 * Fase 13 · Retención y borrado tras una baja.
 *
 * Esto borra datos de verdad y no se puede deshacer, así que la prueba se
 * ocupa sobre todo de lo que NO debe pasar: que no toque una iglesia activa,
 * que no toque una archivada hace poco, que no se pueda forzar un plazo
 * absurdo, y que los ficheros queden encolados para borrarse del bucket en vez
 * de desaparecer del índice y quedarse vivos en el almacenamiento.
 *
 * Uso:
 *   npm run test:retencion
 *
 * Variables: LEVITA_TEST_DB, PGHOST, PGPORT, PGUSER, PGPASSWORD.
 */
import pg from "pg";

const cfg = {
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 55432),
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD ?? "postgres",
  database: process.env.LEVITA_TEST_DB ?? "levita_test",
};

let fallos = 0;
const comprobar = (ok, txt) => {
  console.log(`${ok ? "ok   " : "FALLO"}  ${txt}`);
  if (!ok) fallos += 1;
};

const c = new pg.Client(cfg);
await c.connect();

const sufijo = Math.random().toString(36).slice(2, 8);

async function crearIglesia(nombre, slug, uid, email) {
  await c.query(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [uid, email]);
  await c.query(
    `select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, false),
            set_config('role','authenticated', false)`,
    [uid],
  );
  const { rows } = await c.query(
    `select out_church_id as id from app.provision_church(
       $1, $2, 'es-ES','Europe/Madrid','EUR','España','Owner','Ret',$3,
       null,'Sede',null,null,null,null, array['people'], null)`,
    [nombre, slug, email],
  );
  await c.query("reset role");
  return rows[0].id;
}

// Tres iglesias: una archivada hace tiempo (debe borrarse), una archivada
// anteayer (no), y una activa (nunca).
const vieja = await crearIglesia("Archivada Vieja", `ret-vieja-${sufijo}`,
  "a1000000-0000-0000-0000-000000000001", `ret.vieja.${sufijo}@example.test`);
const reciente = await crearIglesia("Archivada Reciente", `ret-reciente-${sufijo}`,
  "a1000000-0000-0000-0000-000000000002", `ret.reciente.${sufijo}@example.test`);
const activa = await crearIglesia("Activa", `ret-activa-${sufijo}`,
  "a1000000-0000-0000-0000-000000000003", `ret.activa.${sufijo}@example.test`);

await c.query(`select set_config('request.jwt.claims', '', false)`);

// Un fichero en cada una, para comprobar el encolado.
for (const [iglesia, marca] of [[vieja, "vieja"], [reciente, "reciente"], [activa, "activa"]]) {
  await c.query(
    `insert into files (church_id, bucket, object_path, classification, mime_type, size_bytes)
     values ($1, 'kids', $2, 'restricted', 'image/jpeg', 1024)`,
    [iglesia, `${marca}-${sufijo}/foto.jpg`],
  );
}

await c.query(
  `update churches set status = 'archived', archived_at = now() - interval '45 days' where id = $1`, [vieja]);
await c.query(
  `update churches set status = 'archived', archived_at = now() - interval '2 days' where id = $1`, [reciente]);

const existe = async (id) =>
  Number((await c.query(`select count(*)::int as n from churches where id = $1`, [id])).rows[0].n) > 0;

console.log("\n--- 1. Qué se borraría, antes de borrar nada ---");
const { rows: previa } = await c.query(`select * from app.churches_due_for_purge(30)`);
comprobar(previa.length === 1 && previa[0].church_id === vieja,
  `solo aparece la archivada hace 45 días (${previa.length} iglesia/s)`);
comprobar(await existe(vieja), "y consultarlo no ha borrado nada");
comprobar(Number(previa[0]?.files_count) === 1, `cuenta su fichero (${previa[0]?.files_count})`);

console.log("\n--- 2. El plazo no se puede forzar ---");
// Pedir 0 días debería quedarse en el mínimo de 7 y no arrastrar a la reciente.
const forzado = (await c.query(`select app.purge_archived_churches(0, 10) as r`)).rows[0].r;
comprobar(Number(forzado.retention_days) === 7,
  `pedir 0 días se queda en el mínimo de 7 (devolvió ${forzado.retention_days})`);
comprobar(await existe(reciente), "la archivada hace 2 días sigue ahí");

console.log("\n--- 3. Lo que no debe tocarse ---");
comprobar(await existe(activa), "la iglesia activa no se toca");
const { rows: activaTrasTodo } = await c.query(
  `select status::text as s from churches where id = $1`, [activa]);
comprobar(activaTrasTodo[0]?.s === "active" || activaTrasTodo[0]?.s === "trial",
  `y conserva su estado (${activaTrasTodo[0]?.s})`);

console.log("\n--- 4. La archivada hace 45 días sí se borra ---");
comprobar(!(await existe(vieja)), "la iglesia ya no existe");

const { rows: restos } = await c.query(
  `select count(*)::int as n from church_people where church_id = $1`, [vieja]);
comprobar(Number(restos[0].n) === 0, `la cascada se llevó sus pertenencias (${restos[0].n})`);

const { rows: sinFichero } = await c.query(
  `select count(*)::int as n from files where church_id = $1`, [vieja]);
comprobar(Number(sinFichero[0].n) === 0, "y sus filas de ficheros");

console.log("\n--- 5. Los objetos quedan encolados, no perdidos ---");
const { rows: cola } = await c.query(
  `select bucket, object_path, deleted_at from storage_deletion_queue where source_church_id = $1`, [vieja]);
comprobar(cola.length === 1, `el fichero está en la cola de borrado (${cola.length})`);
comprobar(cola[0]?.deleted_at === null, "todavía sin borrar del bucket, que es lo correcto");
comprobar(cola[0]?.bucket === "kids", `con su bucket (${cola[0]?.bucket})`);

const { rows: colaAjena } = await c.query(
  `select count(*)::int as n from storage_deletion_queue where source_church_id in ($1, $2)`,
  [reciente, activa]);
comprobar(Number(colaAjena[0].n) === 0, "y no se ha encolado nada de las otras dos");

console.log("\n--- 6. La traza sobrevive al borrado ---");
const { rows: traza } = await c.query(
  `select action, church_id, metadata from platform_audit_logs where action = 'church.purged'
   and metadata->>'church_name' = 'Archivada Vieja'`);
comprobar(traza.length === 1, "queda registrado que se borró");
comprobar(traza[0]?.church_id === null,
  "con church_id a null: la clave foránea es «on delete set null», así que la traza no arrastra la iglesia");
comprobar(traza[0]?.metadata?.retention_days !== undefined,
  `y guarda con qué plazo se hizo (${traza[0]?.metadata?.retention_days})`);

console.log("\n--- 7. La cola se puede vaciar ---");
const { rows: pendientes } = await c.query(`select * from app.due_storage_deletions(100)`);
comprobar(pendientes.length >= 1, `hay ${pendientes.length} objeto(s) por borrar`);

await c.query(`select app.mark_storage_deletion($1, true, null)`, [pendientes[0].id]);
const { rows: tras } = await c.query(
  `select deleted_at from storage_deletion_queue where id = $1`, [pendientes[0].id]);
comprobar(tras[0].deleted_at !== null, "marcar uno como borrado lo saca de la cola");

const { rows: sigue } = await c.query(`select * from app.due_storage_deletions(100)`);
comprobar(!sigue.some((x) => x.id === pendientes[0].id), "y ya no vuelve a salir");

// Un fallo no lo pierde: suma intento y guarda el motivo.
const otroId = (await c.query(
  `insert into storage_deletion_queue (bucket, object_path, reason)
   values ('kids', $1, 'prueba') returning id`, [`fallo-${sufijo}/x.jpg`])).rows[0].id;
await c.query(`select app.mark_storage_deletion($1, false, 'el bucket no responde')`, [otroId]);
const { rows: falla } = await c.query(
  `select attempts, last_error, deleted_at from storage_deletion_queue where id = $1`, [otroId]);
comprobar(Number(falla[0].attempts) === 1 && falla[0].deleted_at === null,
  `un fallo suma intento y no lo da por borrado (intentos: ${falla[0].attempts})`);
comprobar(Boolean(falla[0].last_error), "y guarda el motivo");

console.log("\n--- 8. Nadie más puede llamar a esto ---");
await c.query(
  `select set_config('request.jwt.claims', json_build_object('sub','a1000000-0000-0000-0000-000000000003','role','authenticated')::text, false),
          set_config('role','authenticated', false)`);
let pudo = false;
try {
  await c.query(`select app.purge_archived_churches(30, 10)`);
  pudo = true;
} catch {
  // Se espera que falle.
}
await c.query("reset role");
comprobar(!pudo, "una sesión autenticada normal no puede borrar iglesias");

await c.end();
console.log(fallos === 0
  ? "\nEl borrado respeta el plazo, no toca lo que no debe, y los ficheros quedan encolados."
  : `\n${fallos} comprobación(es) fallida(s).`);
process.exit(fallos === 0 ? 0 : 1);
