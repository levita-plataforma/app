#!/usr/bin/env node
/**
 * Fase 13 · Planes de ejecución del directorio con volumen.
 *
 * NO es una prueba de carga ni acredita capacidad de escala: mide planes de
 * ejecución en local, con datos sintéticos y sin concurrencia. Sirve para una
 * cosa concreta y útil: detectar que una consulta del directorio ha vuelto a
 * recorrer la tabla entera.
 *
 * Las consultas están reconstruidas a partir de lo que PostgREST genera para
 * src/server/people/people-service.ts. Si ese fichero cambia el orden, los
 * filtros o la forma de buscar, hay que cambiarlas aquí también: medir una
 * consulta que la aplicación no ejecuta no dice nada. Ya pasó una vez.
 *
 * Uso:
 *   npm run test:rendimiento            # 20.000 personas por iglesia
 *   PERSONAS=50000 npm run test:rendimiento
 *
 * Requiere una base vacía y recién migrada; siembra mucho y no limpia.
 * Variables: LEVITA_TEST_DB, PGHOST, PGPORT, PGUSER, PGPASSWORD, PERSONAS.
 */
import pg from "pg";

const cfg = {
  host: process.env.PGHOST ?? "127.0.0.1",
  port: Number(process.env.PGPORT ?? 55432),
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD ?? "postgres",
  database: process.env.LEVITA_TEST_DB ?? "levita_test",
};
const PERSONAS = Number(process.env.PERSONAS ?? 20000);

// Umbral de aviso. No es un objetivo de producto acordado —eso sigue
// pendiente— sino la frontera por encima de la cual un plan local ya ha
// dejado de usar un índice y conviene mirarlo.
const UMBRAL_MS = Number(process.env.UMBRAL_MS ?? 30);

const c = new pg.Client(cfg);
await c.connect();

const sufijo = Math.random().toString(36).slice(2, 8);

async function provisionar(uid, email, nombre, slug) {
  await c.query(`insert into auth.users (id, email) values ($1, $2) on conflict do nothing`, [uid, email]);
  await c.query(
    `select set_config('request.jwt.claims', json_build_object('sub',$1::text,'role','authenticated')::text, false),
            set_config('role','authenticated', false)`,
    [uid],
  );
  const { rows } = await c.query(
    `select out_church_id as id from app.provision_church(
       $1, $2, 'es-ES','Europe/Madrid','EUR','España','Owner','Perf',$3,
       null,'Sede',null,null,null,null, array['people'], null)`,
    [nombre, slug, email],
  );
  await c.query("reset role");
  return rows[0].id;
}

// Dos iglesias: medir el aislamiento por tenant sobre una base con un solo
// tenant no dice nada sobre el coste de descartar lo ajeno.
const church = await provisionar(
  "f6000000-0000-0000-0000-000000000001", `perf.owner.${sufijo}@example.test`,
  "Iglesia Rendimiento", `iglesia-perf-${sufijo}`);
const vecina = await provisionar(
  "f6000000-0000-0000-0000-000000000002", `perf.vecina.${sufijo}@example.test`,
  "Iglesia Vecina", `iglesia-vecina-${sufijo}`);

// La siembra masiva va sin identidad: con sesión, los disparadores de fase
// imponen reglas de negocio que aquí estorban, y lo que interesa es el estado
// final sobre el que se mide.
await c.query(`select set_config('request.jwt.claims', '', false)`);
process.stdout.write(`Sembrando ${PERSONAS} personas por iglesia… `);

for (const iglesia of [church, vecina]) {
  const marca = iglesia.slice(0, 8);
  await c.query(
    `insert into people (first_name, last_name, preferred_name, email, phone, source)
     select 'Nombre' || g, 'Apellido' || g, null,
            'p' || g || '.' || $2 || '@example.test', '+3460' || lpad(g::text, 7, '0'), 'manual'
     from generate_series(1, $1) g`,
    [PERSONAS, marca],
  );
  await c.query(
    `insert into church_people (church_id, person_id, relationship, source, joined_at)
     select $1, p.id, 'member', 'manual', now() - (random() * 700 || ' days')::interval
     from people p
     where p.email like '%.' || $2 || '@example.test'
       and not exists (select 1 from church_people cp where cp.person_id = p.id)`,
    [iglesia, marca],
  );
}
await c.query("analyze");
console.log("hecho.\n");

const consultas = [
  {
    n: "Página 1 del directorio",
    q: `select cp.id, cp.relationship, cp.joined_at, p.first_name, p.last_name
        from church_people cp join people p on p.id = cp.person_id
        where cp.church_id = $1 and cp.archived_at is null
        order by cp.joined_at desc limit 25`,
    a: [church],
  },
  {
    n: "Página 41 (desplazamiento 1.000)",
    q: `select cp.id from church_people cp join people p on p.id = cp.person_id
        where cp.church_id = $1 and cp.archived_at is null
        order by cp.joined_at desc limit 25 offset 1000`,
    a: [church],
  },
  {
    n: "Filtro por vínculo",
    q: `select cp.id from church_people cp join people p on p.id = cp.person_id
        where cp.church_id = $1 and cp.archived_at is null and cp.relationship = 'member'
        order by cp.joined_at desc limit 25`,
    a: [church],
  },
  {
    n: "Búsqueda por nombre o contacto",
    q: `select cp.id from church_people cp join people p on p.id = cp.person_id
        where cp.church_id = $1 and cp.archived_at is null
          and (p.first_name ilike $2 or p.last_name ilike $2 or p.preferred_name ilike $2
               or p.email ilike $2 or p.phone ilike $2)
        order by cp.joined_at desc limit 25`,
    a: [church, "%Nombre4242%"],
  },
  {
    // Este no tiene arreglo por índice y se mide para que su coste esté a la
    // vista, no para que pase: cuenta todas las filas del tenant. Documentado
    // en docs/FASE-13-OPERACION-ESCALA.md §6.
    n: "Recuento exacto (sin arreglo por índice)",
    informativo: true,
    q: `select count(*) from church_people cp join people p on p.id = cp.person_id
        where cp.church_id = $1 and cp.archived_at is null`,
    a: [church],
  },
];

let fallos = 0;

for (const x of consultas) {
  let mejor = Infinity;
  let seq = [];
  for (let i = 0; i < 3; i += 1) {
    const { rows } = await c.query(`explain (analyze, format json) ${x.q}`, x.a);
    const plan = rows[0]["QUERY PLAN"][0];
    if (plan["Execution Time"] < mejor) {
      mejor = plan["Execution Time"];
      const t = JSON.stringify(plan.Plan);
      seq = [
        ...new Set(
          (t.match(/"Node Type":"Seq Scan"[^}]*?"Relation Name":"(?:people|church_people)"/g) ?? [])
            .map((s) => s.match(/"Relation Name":"(\w+)"/)[1]),
        ),
      ];
    }
  }
  const mal = !x.informativo && (mejor > UMBRAL_MS || seq.length > 0);
  if (mal) fallos += 1;
  const marca = x.informativo ? "info " : mal ? "FALLO" : "ok   ";
  const aviso = seq.length ? `   ← recorre ${seq.join(", ")} entera` : "";
  console.log(`${marca}  ${mejor.toFixed(1).padStart(7)} ms  ${x.n}${aviso}`);
}

// Una iglesia pequeña dentro de una base grande: el caso en que un índice
// pensado para el tenant grande puede volverse una trampa, porque el
// planificador tendría que descartar miles de filas ajenas para reunir 25.
const pequena = await provisionar(
  "f6000000-0000-0000-0000-000000000003", `perf.peq.${sufijo}@example.test`,
  "Iglesia Pequeña", `iglesia-peq-${sufijo}`);
await c.query(`select set_config('request.jwt.claims', '', false)`);
await c.query(
  `insert into people (first_name, last_name, email, source)
   select 'Peq' || g, 'Zapellido' || g, 'peq' || g || '.' || $1 || '@example.test', 'manual'
   from generate_series(1, 40) g`,
  [sufijo],
);
await c.query(
  `insert into church_people (church_id, person_id, relationship, source)
   select $1, p.id, 'member', 'manual' from people p
   where p.email like 'peq%.' || $2 || '@example.test'
     and not exists (select 1 from church_people cp where cp.person_id = p.id)`,
  [pequena, sufijo],
);
await c.query("analyze");

let peq = Infinity;
for (let i = 0; i < 3; i += 1) {
  const { rows } = await c.query(
    `explain (analyze, format json)
     select cp.id from church_people cp join people p on p.id = cp.person_id
     where cp.church_id = $1 and cp.archived_at is null
     order by cp.joined_at desc limit 25`,
    [pequena],
  );
  peq = Math.min(peq, rows[0]["QUERY PLAN"][0]["Execution Time"]);
}
const peqOk = peq <= UMBRAL_MS;
if (!peqOk) fallos += 1;
console.log(`${peqOk ? "ok   " : "FALLO"}  ${peq.toFixed(1).padStart(7)} ms  Iglesia de 40 personas en la misma base`);

// Búsqueda inmediatamente después de una importación masiva, sin vacuum de por
// medio. Es el caso que destapó lo de la lista pendiente de los índices GIN: sin
// fastupdate=off, aquí la búsqueda cae al recorrido secuencial y tarda cien
// veces más, hasta que pase autovacuum. Si alguien crea un índice GIN nuevo
// sobre people y se olvida de la opción, esta comprobación lo dice.
await c.query(
  `insert into people (first_name, last_name, email, phone, source)
   select 'Recien' || g, 'Importado' || g, 'ri' || g || '.' || $1 || '@example.test',
          '+34622' || lpad(g::text, 6, '0'), 'manual'
   from generate_series(1, 5000) g`,
  [sufijo],
);
await c.query("analyze people");

let trasImportar = Infinity;
let planTrasImportar = "";
for (let i = 0; i < 3; i += 1) {
  const { rows } = await c.query(
    `explain (analyze, format json)
     select p.id from people p
     where p.first_name ilike $1 or p.last_name ilike $1 or p.preferred_name ilike $1
        or p.email ilike $1 or p.phone ilike $1
     limit 25`,
    ["%Nombre4242%"],
  );
  const plan = rows[0]["QUERY PLAN"][0];
  if (plan["Execution Time"] < trasImportar) {
    trasImportar = plan["Execution Time"];
    planTrasImportar = JSON.stringify(plan.Plan).includes("Bitmap") ? "" : "   ← recorre people entera";
  }
}
const importOk = trasImportar <= UMBRAL_MS && !planTrasImportar;
if (!importOk) fallos += 1;
console.log(
  `${importOk ? "ok   " : "FALLO"}  ${trasImportar.toFixed(1).padStart(7)} ms  ` +
  `Búsqueda justo tras importar 5.000, sin vacuum${planTrasImportar}`,
);

await c.end();
console.log(
  fallos === 0
    ? `\nNingún recorrido del directorio recorre las tablas enteras con ${PERSONAS} personas por iglesia.`
    : `\n${fallos} recorrido(s) por encima de ${UMBRAL_MS} ms o recorriendo una tabla entera.`,
);
process.exit(fallos === 0 ? 0 : 1);
