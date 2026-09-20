#!/usr/bin/env node
/**
 * Fase 13 · Los procesos periódicos bajo condiciones de operación real.
 *
 * Estas comprobaciones no caben en pgTAP porque necesitan varias sesiones a la
 * vez y una conexión que se corte a media transacción. Responden a cuatro
 * preguntas que un informe no puede responder:
 *
 *   1. ¿Procesar dos veces duplica avisos?
 *   2. ¿Dos ejecuciones simultáneas se pisan?
 *   3. ¿Un proceso que muere a medias deja trabajo perdido o a medio hacer?
 *   4. ¿Una fila corrupta atasca la cola para siempre?
 *
 * La cuarta encontró un fallo real: el runner de comunicaciones cortaba la
 * pasada al primer error, así que una comunicación con datos inválidos impedía
 * enviar todas las demás, en cada ejecución. Corregido en 20261004000412.
 *
 * Uso:
 *   npm run test:jobs
 *
 * Variables: LEVITA_TEST_DB, PGHOST, PGPORT, PGUSER, PGPASSWORD.
 * Sale con código 1 si algo falla, para que sirva en CI.
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

const cliente = async () => {
  const c = new pg.Client(cfg);
  await c.connect();
  return c;
};

const c = await cliente();
const sufijo = Math.random().toString(36).slice(2, 8);

// --- Montaje ----------------------------------------------------------------
const owner = "e1000000-0000-0000-0000-000000000001";
await c.query(
  `insert into auth.users (id, email) values ($1, 'jobs.owner@example.test') on conflict do nothing`,
  [owner],
);
await c.query(
  `select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, false),
          set_config('role','authenticated', false)`,
  [owner],
);
const { rows: ig } = await c.query(
  `select out_church_id as id, out_person_id as person from app.provision_church(
     'Iglesia Jobs', $1, 'es-ES','Europe/Madrid','EUR','España',
     'Owner','Jobs','jobs.owner@example.test', null, 'Sede', null,null,null,null,
     array['people','serving','communications'], null)`,
  [`iglesia-jobs-${sufijo}`],
);
await c.query("reset role");
const church = ig[0].id;
const persona = ig[0].person;

const pendientes = async () =>
  Number((await c.query(`select count(*)::int as n from notification_events where processed_at is null`)).rows[0].n);
const avisos = async () =>
  Number((await c.query(`select count(*)::int as n from notifications where church_id=$1`, [church])).rows[0].n);

async function sembrarEventos(n) {
  for (let i = 0; i < n; i += 1) {
    await c.query(
      `insert into notification_events (church_id, event_type, entity_type, entity_id, entity_version,
                                        recipient_person_ids, payload, idempotency_key, occurred_at)
       values ($1,'assignment.proposed','activity_assignments', gen_random_uuid(), 1, array[$2::uuid],
               '{}'::jsonb, 'jobs-' || $3 || '-' || gen_random_uuid()::text, now())`,
      [church, persona, sufijo],
    );
  }
}

console.log("\n--- 1. Repetir una pasada no duplica avisos ---");
await sembrarEventos(5);
await c.query(`select app.process_notification_events(100)`);
const trasPrimera = await avisos();
await c.query(`select app.process_notification_events(100)`);
const trasSegunda = await avisos();
comprobar(trasPrimera > 0, `la primera pasada genera avisos (${trasPrimera})`);
comprobar(trasSegunda === trasPrimera, `la segunda no añade ninguno (${trasSegunda})`);

console.log("\n--- 2. Dos ejecuciones a la vez ---");
await sembrarEventos(10);
const a = await cliente();
const b = await cliente();
await a.query("begin");
await b.query("begin");
const [rA, rB] = await Promise.allSettled([
  a.query(`select app.process_notification_events(100)`),
  b.query(`select app.process_notification_events(100)`),
]);
await a.query("commit").catch(() => {});
await b.query("commit").catch(() => {});
comprobar(rA.status === "fulfilled" && rB.status === "fulfilled",
  "las dos terminan sin error: «for update skip locked» hace que no se esperen");
comprobar((await pendientes()) === 0, "no queda ningún evento sin procesar");
const { rows: dup } = await c.query(
  `select event_id from notifications where church_id=$1 group by event_id having count(*) > 1`, [church]);
comprobar(dup.length === 0, `ningún evento genera avisos duplicados (${dup.length} casos)`);
await a.end();
await b.end();

console.log("\n--- 3. El proceso muere a media pasada ---");
await sembrarEventos(4);
const pendAntes = await pendientes();
const avisosAntes = await avisos();
const muerto = await cliente();
await muerto.query("begin");
await muerto.query(`select app.process_notification_events(100)`);
await muerto.end(); // se corta sin commit: el worker se cae
await new Promise((r) => setTimeout(r, 300));
comprobar((await pendientes()) === pendAntes,
  `los eventos vuelven a estar pendientes (${pendAntes})`);
comprobar((await avisos()) === avisosAntes,
  `no queda ningún aviso a medias (${avisosAntes})`);
await c.query(`select app.process_notification_events(100)`);
comprobar((await pendientes()) === 0, "la pasada siguiente recupera el trabajo abandonado");

console.log("\n--- 4. Una comunicación corrupta no atasca la cola ---");
const rota = (await c.query(
  `insert into communications (church_id, title, purpose, body_template, channels, status,
                               scheduled_at, segment_rules_snapshot)
   values ($1,'Rota','institutional','Hola', array['inapp']::notification_channel[], 'scheduled',
           now() - interval '1 hour', '{"all":[{"field":"campo_inexistente","op":"eq","value":"x"}]}'::jsonb)
   returning id`, [church])).rows[0].id;

const buena = (await c.query(
  `insert into communications (church_id, title, purpose, body_template, channels, status,
                               scheduled_at, segment_rules_snapshot)
   values ($1,'Buena','institutional','Hola', array['inapp']::notification_channel[], 'scheduled',
           now() - interval '1 hour', '{"all":[{"field":"relationship","op":"eq","value":"member"}]}'::jsonb)
   returning id`, [church])).rows[0].id;

const { rows: due } = await c.query(`select id from app.due_scheduled_communications(10)`);
let preparadas = 0;
let marcadas = 0;
for (const row of due) {
  const r = (await c.query(`select app.try_materialize_communication($1) as r`, [row.id])).rows[0].r;
  if (r.ok) preparadas += 1;
  else if (!r.reintentable) marcadas += 1;
}

const estado = async (id) =>
  (await c.query(`select status::text as s from communications where id=$1`, [id])).rows[0].s;

comprobar(preparadas >= 1, `la comunicación válida se prepara pese a la rota (${preparadas})`);
comprobar(marcadas === 1, `la rota queda marcada, no en cola (${marcadas})`);
comprobar((await estado(rota)) === "failed_to_process", `la rota queda en failed_to_process`);
comprobar((await estado(buena)) !== "scheduled", `la buena avanza (${await estado(buena)})`);

const { rows: motivo } = await c.query(`select processing_error from communications where id=$1`, [rota]);
comprobar(Boolean(motivo[0].processing_error), "y guarda por qué no se pudo preparar");

const { rows: siguen } = await c.query(`select id from app.due_scheduled_communications(10)`);
comprobar(siguen.length === 0, `la cola queda limpia (${siguen.length} pendientes)`);

await c.end();
console.log(fallos === 0
  ? "\nLos procesos periódicos aguantan repetición, concurrencia, caída y datos corruptos."
  : `\n${fallos} comprobación(es) fallida(s).`);
process.exit(fallos === 0 ? 0 : 1);
