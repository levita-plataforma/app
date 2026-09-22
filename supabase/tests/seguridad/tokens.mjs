/**
 * Fase 13 · Ciclo de vida de los tokens de invitación.
 *
 * Tres preguntas: ¿se puede usar una invitación dos veces?, ¿una caducada?,
 * ¿una revocada? Son las que convierten un enlace en una puerta permanente si
 * están mal.
 *
 * No cabe en pgTAP porque necesita varias identidades distintas actuando sobre
 * el mismo token, y el resultado depende de quién lo usa y cuándo.
 *
 * Uso: npm run test:tokens
 */
import pg from "pg";

const c = new pg.Client({
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 55432),
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD ?? "postgres",
  database: process.env.LEVITA_TEST_DB ?? "levita_test",
});
await c.connect();

let fallos = 0;
const comprobar = (ok, txt) => { console.log(`${ok ? "ok   " : "FALLO"}  ${txt}`); if (!ok) fallos += 1; };

const sufijo = Math.random().toString(36).slice(2, 8);
const operador = "e3000000-0000-0000-0000-000000000001";

await c.query(`insert into auth.users (id, email) values ($1,'tok.op@example.test') on conflict do nothing`, [operador]);
await c.query(`insert into platform_operators (user_id) values ($1) on conflict do nothing`, [operador]);

// Desde CA-0.2 el alta asistida exige la capacidad concreta, no solo pertenecer
// al equipo. Esta suite usa el alta para montar su escenario, así que su
// operador la necesita: sin ella el montaje falla con 42501 y la suite no llega
// a probar nada de los tokens, que es lo suyo.
await c.query(
  `insert into platform_operator_capabilities (user_id, capability_key)
   values ($1, 'platform.churches.create') on conflict do nothing`,
  [operador],
);

async function como(uid, sql, args = []) {
  await c.query(
    `select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, false),
            set_config('role','authenticated', false)`, [uid]);
  try {
    const r = await c.query(sql, args);
    return { ok: true, rows: r.rows };
  } catch (e) {
    return { ok: false, code: e.code, msg: e.message.slice(0, 90) };
  } finally {
    await c.query("reset role");
  }
}

// Alta asistida: crea iglesia + invitación de propietario con token.
const alta = await como(operador,
  `select * from app.assisted_provision_church($1,$2,'es-ES','Europe/Madrid','EUR','España',$3, array['people'])`,
  [`Iglesia Tokens ${sufijo}`, `iglesia-tokens-${sufijo}`, `owner.${sufijo}@example.test`]);

if (!alta.ok) { console.log("No se pudo montar:", alta.code, alta.msg); process.exit(1); }
const token = alta.rows[0].out_invitation_token;
const invitacionId = alta.rows[0].out_invitation_id;
console.log(`Invitación creada. Token de ${token.length} caracteres hex (${token.length * 4} bits).\n`);

// Quien va a aceptarla.
const invitado = "e3000000-0000-0000-0000-000000000002";
await c.query(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`,
  [invitado, `owner.${sufijo}@example.test`]);

// --- 1. Primer uso: debe funcionar ------------------------------------------
const uso1 = await como(invitado, `select * from app.accept_invitation($1,'Nuevo','Propietario')`, [token]);
comprobar(uso1.ok, `la invitación se acepta la primera vez${uso1.ok ? "" : ` (${uso1.code}: ${uso1.msg})`}`);

// --- 2. Segundo uso del mismo token -----------------------------------------
const otro = "e3000000-0000-0000-0000-000000000003";
await c.query(`insert into auth.users (id, email) values ($1,'tercero@example.test') on conflict do nothing`, [otro]);
const uso2 = await como(otro, `select * from app.accept_invitation($1,'Nuevo','Propietario')`, [token]);
comprobar(!uso2.ok, `el mismo token NO sirve una segunda vez${uso2.ok ? " ← reutilizable" : ` (${uso2.code})`}`);

// --- 3. Invitación caducada --------------------------------------------------
await c.query(
  `insert into invitations (church_id, email, role_key, token_hash, status, expires_at)
   select church_id, 'caducada@example.test', 'church_admin',
          encode(extensions.digest('token-caducado-' || $1, 'sha256'),'hex'), 'pending', now() - interval '1 day'
   from invitations where id = $2`, [sufijo, invitacionId]);

const usoCaducado = await como(otro, `select * from app.accept_invitation($1,'Cad','Ucada')`, [`token-caducado-${sufijo}`]);
comprobar(!usoCaducado.ok, `una invitación caducada no se acepta${usoCaducado.ok ? " ← CADUCIDAD IGNORADA" : ` (${usoCaducado.code})`}`);

// --- 4. Invitación revocada --------------------------------------------------
await c.query(
  `insert into invitations (church_id, email, role_key, token_hash, status, expires_at, revoked_at)
   select church_id, 'revocada@example.test', 'church_admin',
          encode(extensions.digest('token-revocado-' || $1, 'sha256'),'hex'), 'revoked',
          now() + interval '7 days', now()
   from invitations where id = $2`, [sufijo, invitacionId]);

const usoRevocado = await como(otro, `select * from app.accept_invitation($1,'Rev','Ocada')`, [`token-revocado-${sufijo}`]);
comprobar(!usoRevocado.ok, `una invitación revocada no se acepta${usoRevocado.ok ? " ← REVOCACIÓN IGNORADA" : ` (${usoRevocado.code})`}`);

// --- 5. Un token inventado ----------------------------------------------------
const usoFalso = await como(otro, `select * from app.accept_invitation($1,'No','Existe')`, ["no-existe-este-token"]);
comprobar(!usoFalso.ok, `un token inventado no sirve (${usoFalso.code ?? "aceptado"})`);

// --- 6. El token no se guarda en claro ----------------------------------------
const { rows: guardado } = await c.query(
  `select count(*)::int as n from invitations where token_hash = $1`, [token]);
comprobar(guardado[0].n === 0, "el token no se guarda en claro: en la tabla solo está su huella");

await c.end();
console.log(fallos === 0 ? "\nEl ciclo de vida de los tokens es correcto." : `\n${fallos} problema(s).`);
process.exit(fallos === 0 ? 0 : 1);
