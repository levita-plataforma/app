/**
 * Fase 10 · Concurrencia real sobre la capa de ocupación.
 *
 * Esta prueba no está en pgTAP por un motivo concreto: una suite pgTAP corre
 * dentro de una sola transacción y una sola sesión, así que puede demostrar que
 * dos inserciones seguidas chocan, pero no que dos transacciones ABIERTAS A LA
 * VEZ no puedan colarse las dos. Y eso segundo es justo lo que el encargo pide
 * y lo que distingue una protección real de un aviso.
 *
 * Qué se comprueba:
 *   1. Dos reservas simultáneas de la misma franja: solo una entra.
 *   2. Dos aprobaciones simultáneas de pendientes solapadas: no hay sobreventa.
 *   3. Reserva contra mantenimiento en paralelo: tampoco se cruzan.
 *
 * Uso:
 *   node supabase/tests/concurrencia/reservas.mjs
 *
 * Variables:
 *   LEVITA_TEST_DB   nombre de la base (por defecto levita_test)
 *   PGHOST PGPORT PGUSER PGPASSWORD   conexión, con los valores del arnés local
 *
 * Requiere una base con las migraciones aplicadas. Sale con código 1 si alguna
 * comprobación falla, para que sirva en CI.
 */
import pg from "pg";

const conn = {
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 55432),
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD ?? "postgres",
  database: process.env.LEVITA_TEST_DB ?? "levita_test",
};

let fallos = 0;
const comprobar = (condicion, descripcion) => {
  console.log(`${condicion ? "ok  " : "FALLO"}  ${descripcion}`);
  if (!condicion) fallos += 1;
};

const cliente = async () => {
  const c = new pg.Client(conn);
  await c.connect();
  return c;
};

/** Ejecuta y devuelve 'ok' o el SQLSTATE, sin tumbar la sesión. */
async function intentar(c, sql, args = []) {
  try {
    await c.query(sql, args);
    return "ok";
  } catch (e) {
    return e.code ?? "error";
  }
}

const admin = await cliente();

// --- Montaje: una iglesia, una sala y dos personas que pueden reservar -------
const ID = (sufijo) => `f9000000-0000-0000-0000-${sufijo.padStart(12, "0")}`;

await admin.query("begin");
await admin.query(
  `insert into auth.users (id, email) values ($1, 'conc.owner@example.test')
   on conflict (id) do nothing`,
  [ID("c1")],
);
await admin.query(`select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`, [ID("c1")]);
await admin.query(`select set_config('role', 'authenticated', true)`);

const { rows: iglesia } = await admin.query(
  `select out_church_id as church_id from app.provision_church(
     'Iglesia Concurrencia', 'iglesia-concurrencia-' || substr(md5(random()::text), 1, 8),
     'es-ES', 'Europe/Madrid', 'EUR', 'España',
     'Owner', 'Conc', 'conc.owner@example.test', null, 'Sede', null, null, null, null,
     array['people', 'facilities'], null)`,
);
const church = iglesia[0].church_id;

const { rows: sala } = await admin.query(
  `select app.save_resource($1::uuid, jsonb_build_object('name', 'Sala concurrencia', 'type', 'room')) as id`,
  [church],
);
const recurso = sala[0].id;

const { rows: salaAprob } = await admin.query(
  `select app.save_resource($1::uuid, jsonb_build_object('name', 'Sala con aprobación', 'type', 'room', 'requires_approval', true)) as id`,
  [church],
);
const recursoAprob = salaAprob[0].id;

// Las dos pendientes solapadas que luego se intentarán aprobar a la vez.
const { rows: p1 } = await admin.query(
  `select app.create_reservation($1::uuid, jsonb_build_object(
     'resource_id', $2::uuid, 'starts_at', '2027-01-10T10:00:00+01', 'ends_at', '2027-01-10T12:00:00+01',
     'purpose', 'Primera')) as id`,
  [church, recursoAprob],
);
const { rows: p2 } = await admin.query(
  `select app.create_reservation($1::uuid, jsonb_build_object(
     'resource_id', $2::uuid, 'starts_at', '2027-01-10T11:00:00+01', 'ends_at', '2027-01-10T13:00:00+01',
     'purpose', 'Segunda')) as id`,
  [church, recursoAprob],
);
await admin.query("commit");

// Las claims van a nivel de SESIÓN (tercer argumento en false): con ámbito de
// transacción se pierden en el commit y la siguiente consulta llega sin
// identidad, que es lo que hace que todo responda 42501.
const claims = `select set_config('request.jwt.claims', json_build_object('sub', '${ID("c1")}', 'role', 'authenticated')::text, false), set_config('role', 'authenticated', false)`;

// --- 1. Dos reservas simultáneas de la misma franja --------------------------
{
  const a = await cliente();
  const b = await cliente();
  await a.query(claims);
  await b.query(claims);
  await a.query("begin");
  await b.query("begin");

  const CREAR = `select app.create_reservation($1::uuid, jsonb_build_object(
    'resource_id', $2::uuid, 'starts_at', '2027-02-01T10:00:00+01', 'ends_at', '2027-02-01T12:00:00+01',
    'purpose', 'A la vez'))`;

  const rA = await intentar(a, CREAR, [church, recurso]);
  comprobar(rA === "ok", "la primera transacción crea la reserva");

  // La segunda se lanza sin esperar: tiene que quedarse bloqueada mientras la
  // primera siga abierta, no pasar de largo.
  let rB = null;
  const enCurso = intentar(b, CREAR, [church, recurso]).then((r) => { rB = r; });
  await new Promise((r) => setTimeout(r, 400));
  comprobar(rB === null, "la segunda se bloquea esperando, en vez de crear otra reserva a la vez");

  await a.query("commit");
  await enCurso;
  comprobar(rB === "23P01", `la segunda es rechazada al desbloquearse (recibió ${rB})`);

  await b.query("rollback").catch(() => {});
  const { rows } = await admin.query(
    `select count(*)::int as n from resource_reservations
     where resource_id = $1 and starts_at = '2027-02-01T10:00:00+01'`,
    [recurso],
  );
  comprobar(rows[0].n === 1, `queda exactamente una reserva en esa franja (hay ${rows[0].n})`);
  await a.end(); await b.end();
}

// --- 2. Dos aprobaciones simultáneas de pendientes solapadas -----------------
{
  const a = await cliente();
  const b = await cliente();
  await a.query(claims);
  await b.query(claims);
  await a.query("begin");
  await b.query("begin");

  const rA = await intentar(a, "select app.approve_reservation($1::uuid)", [p1[0].id]);
  comprobar(rA === "ok", "la primera aprobación entra");

  let rB = null;
  const enCurso = intentar(b, "select app.approve_reservation($1::uuid)", [p2[0].id]).then((r) => { rB = r; });
  await new Promise((r) => setTimeout(r, 400));
  comprobar(rB === null, "la segunda aprobación espera a la primera");

  await a.query("commit");
  await enCurso;
  comprobar(rB === "23P01", `la segunda aprobación es rechazada (recibió ${rB}): no hay sobreventa`);

  await b.query("rollback").catch(() => {});
  const { rows } = await admin.query(
    `select count(*)::int as n from resource_reservations where resource_id = $1 and status = 'confirmed'`,
    [recursoAprob],
  );
  comprobar(rows[0].n === 1, `solo una de las dos pendientes queda confirmada (hay ${rows[0].n})`);
  await a.end(); await b.end();
}

// --- 3. Reserva contra mantenimiento, en paralelo ---------------------------
{
  const a = await cliente();
  const b = await cliente();
  await a.query(claims);
  await b.query(claims);
  await a.query("begin");
  await b.query("begin");

  const rA = await intentar(a,
    `select app.save_maintenance($1::uuid, jsonb_build_object(
       'resource_id', $2::uuid, 'type', 'revision', 'title', 'Revisión',
       'starts_at', '2027-03-01T09:00:00+01', 'ends_at', '2027-03-01T13:00:00+01'))`,
    [church, recurso]);
  comprobar(rA === "ok", "el mantenimiento se programa en la primera transacción");

  let rB = null;
  const enCurso = intentar(b,
    `select app.create_reservation($1::uuid, jsonb_build_object(
       'resource_id', $2::uuid, 'starts_at', '2027-03-01T10:00:00+01', 'ends_at', '2027-03-01T11:00:00+01',
       'purpose', 'Durante el mantenimiento'))`,
    [church, recurso]).then((r) => { rB = r; });
  await new Promise((r) => setTimeout(r, 400));
  comprobar(rB === null, "la reserva simultánea espera al mantenimiento");

  await a.query("commit");
  await enCurso;
  comprobar(rB === "23P01", `la reserva es rechazada (recibió ${rB}): reserva y mantenimiento no se cruzan`);

  await b.query("rollback").catch(() => {});
  await a.end(); await b.end();
}

await admin.end();

console.log(fallos === 0
  ? "\nTodo correcto: la protección aguanta con transacciones simultáneas."
  : `\n${fallos} comprobación(es) fallida(s).`);
process.exit(fallos === 0 ? 0 : 1);
