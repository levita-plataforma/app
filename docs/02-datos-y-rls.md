# Datos y seguridad

Especificación y referencia técnica del producto localizado en Documents/Levitaapp. Este checkout es la landing; las afirmaciones de implementación y pruebas de los apartados técnicos son historial, no resultados de esta revisión. Ver [índice](README.md).

Estado: **implementado y verificado**. Este documento explica el porqué; el qué
está en `supabase/migrations/`, que es la fuente de verdad.

## Estrategia multi-tenant

Una sola base de datos, `church_id` en cada fila, aislamiento en Postgres con
RLS. Es lo correcto para cientos o miles de iglesias pequeñas: una fracción del
coste de un schema por tenant y sin la pesadilla de migrar 800 schemas. A
cambio exige disciplina absoluta en las políticas, de ahí la suite de
aislamiento.

## Las tres capas de protección

Son independientes a propósito. Que fallara una no debería bastar para filtrar
datos.

**1 · RLS decide qué filas.** Toda tabla con `enable` + `force`. Un test recorre
`pg_tables` y falla si alguna se queda fuera.

**2 · Los `grant` por columna deciden qué campos.** RLS deja a Sara actualizar
su propia asignación, pero sin

```sql
revoke update on assignments from authenticated;
grant update (status, response_note, responded_at) on assignments to authenticated;
```

aceptaría su turno y, en el mismo `UPDATE`, reasignaría el de otra persona. Lo
mismo con `people`: sin el grant por columna se asciende a `owner` con un
`UPDATE` de una línea. **Las dos cosas están probadas como controles negativos.**

**3 · Las claves foráneas compuestas deciden qué puede existir.**

```sql
foreign key (event_id, church_id) references events(id, church_id)
```

Hace físicamente imposible colgar un turno del evento de otra iglesia, aunque el
código tenga un bug. Cuesta un `unique (id, church_id)` por tabla padre y evita
la clase de incidente que cierra una empresa.

## Las funciones de contexto

`app.church_ids_for_user()`, `app.current_person_id()`, `app.has_church_role()`,
`app.can_manage_ministry()`, `app.can_manage_event_position()`.

Las cinco son `security definer` y `stable`:

- **`security definer`** se salta RLS por diseño. Es lo que rompe la recursión
  infinita de una política sobre `people` que necesita consultar `people`. Es el
  error de RLS más común en Supabase.
- **`stable`** hace que Postgres las evalúe una vez por consulta, no por fila.
- **`set search_path`** fijado impide el secuestro de la resolución de nombres.

El esquema `app` no está en los `schemas` expuestos de `config.toml`, así que no
son alcanzables por API. `authenticated` sí tiene `execute` porque las políticas
se evalúan con el rol que consulta.

## El patrón de política

```sql
create policy tabla_select on tabla
for select to authenticated
using ( church_id = any((select app.church_ids_for_user())::uuid[]) );
```

Tres detalles, los tres deliberados, sacados de la guía de rendimiento de
Supabase — que documenta mejoras de 179 ms a 9 ms y de 178 s a 12 ms:

1. `(select ...)` para que la llamada se cachee en el initPlan.
2. `::uuid[]` porque `any((select f()))` se interpreta como subconsulta y falla
   con `operator does not exist: uuid = uuid[]`.
3. `to authenticated` para descartar anónimos antes de evaluar nada.

Y toda columna que aparezca en una política va indexada.

## Matriz de permisos para diseño

Todos los permisos pertenecen a la iglesia activa. Operación LEVITA es un
perfil separado para altas y activación; no se incluye como administrador
global de datos internos. Ver [Tenants](12-iglesias-y-tenants.md).

| Acción | Propietario | Admin | Líder de área | Servidor |
|---|---|---|---|---|
| Cuota y suscripción | Sí | — | — | — |
| Crear, editar y renombrar áreas | Sí | Sí | — | — |
| Configurar puestos y miembros | Sí | Sí | Dentro de lo permitido en su área | — |
| Invitar personas | Sí | Sí | Alcance de invitación por área pendiente de conciliar con el acceso actual | — |
| Dar de baja de la iglesia | Sí | Sí | —; quitar del área no es dar de baja de la iglesia | — |
| Crear/publicar un culto completo | Sí | Sí | Pendiente D2; no equivale a publicar solo sus turnos | — |
| Asignar personas a puestos | Sí | Sí | Solo sus áreas | — |
| Responder turno propio | Sí | Sí | Sí | Sí |
| Editar bloqueos y frecuencia propia | Sí | Sí | Sí | Sí |
| Ver teléfonos | Sí | Sí | Solo su área, si se habilita conforme al criterio documentado | — |
| Leer credenciales | Sí | Sí | — | Solo la propia |
| Registrar credenciales y requisitos | Sí | Sí | — | — |
| Leer motivo de indisponibilidad | Sí | Sí | Solo si es el autor | Solo el propio |

Un propietario de A que es servidor en B tiene permisos de servidor en B.
Cada persona tiene una ficha por iglesia vinculada a su cuenta. La ficha y la
suscripción de una iglesia no autorizan consultas en otras.

### Aplicación en la UI

Para un líder, una persona bloqueada por requisitos muestra «Necesita revisión
de un administrador para este servicio», sin exponer tipo, fechas ni verificador.
Propietario/admin y persona interesada ven su detalle permitido. No ofrecer
subida del certificado ni adjuntos. Un bloqueo de disponibilidad muestra fechas;
el motivo privado se oculta a quien no pueda leerlo.

Crear o renombrar un área opera sobre su identificador dentro del tenant y
conserva sus relaciones. Las copias iniciales no conceden acceso a las de otras
iglesias. Cambiar el nombre del área no permite quitar controles de credenciales.

El backlog relata restricciones por columna todavía pendientes en teléfonos y
motivos de bloqueo. La matriz expresa el comportamiento deseado, no certifica
que esa protección esté aplicada. Se verifica en servidor y base de datos;
ocultar columnas en la interfaz no implementa el permiso.

## Tablas y columnas del bloque A0 (referencia histórica)

El análisis de áreas añade dos tablas y cinco columnas. Van **antes** que las
pantallas: rehacer una pantalla porque faltaba una columna es lo caro. El SQL
completo está en `docs/areas/00-indice.md`; aquí, lo que cambia en seguridad.

### `person_credentials` es la tabla más sensible del esquema

Guarda que una persona tiene el certificado de delitos sexuales en vigor. Eso es
un dato personal de categoría delicada, y su política RLS no puede ser la de
lectura general que usan las demás tablas:

- **Leen y escriben:** solo `owner` y `admin`.
- **Lee la suya:** la persona interesada.
- **Nadie más.** Ni siquiera el líder del área, que solo necesita saber si puede
  asignar a alguien — y eso lo responde la validación, no la lectura de la fila.

```sql
create policy credentials_admin on person_credentials
for all to authenticated
using      ( (select app.has_church_role(church_id, array['owner','admin'])) )
with check ( (select app.has_church_role(church_id, array['owner','admin'])) );

create policy credentials_own on person_credentials
for select to authenticated
using ( person_id = (select app.current_person_id(church_id)) );
```

**No se guarda el documento.** Solo el tipo de credencial, las fechas y quién la
verificó. Almacenar el PDF de un certificado de antecedentes es asumir un riesgo
de RGPD sin ninguna ventaja operativa. Detalle en `docs/08-rgpd-y-lopivi.md`.

### La validación es una cuarta capa de protección

Las tres capas de arriba —RLS, grants por columna, claves foráneas compuestas—
protegen el aislamiento entre iglesias. Las reglas de composición protegen otra
cosa: a los menores, y a la iglesia frente a su propia prisa.

Un turno de niños con una sola persona propuesta o aceptada, o alguien sin
certificado en vigor, **no puede publicarse**. Cuentan las pendientes y las
aceptadas: en un borrador nadie ha podido aceptar todavía. Esa validación vive en `packages/core` y se
comprueba dos veces: al asignar, para avisar pronto, y al publicar, porque entre
las dos cosas alguien puede haber rechazado.

Al ser una regla de negocio y no de acceso, no la puede imponer RLS sola. La del
certificado ya está blindada en la base de datos: un trigger sobre
`assignments` impide asignar a alguien sin credencial bloqueante en vigor el día
del culto (`20260914000500_credenciales.sql`). Las de composición (mínimo de
personas y autónomo) viven en `packages/core`; si se quieren blindar igual, un
trigger `before update` sobre `events.status` es el sitio.

## Optimización pendiente

Inyectar `church_ids` y el mapa de roles en el JWT con un *Custom Access Token
Hook* elimina hasta la consulta de las funciones `stable`. El coste es que un
cambio de rol tarda hasta una hora en surtir efecto. **Medir antes de hacerlo**:
con el volumen previsto no hace falta.

## Verificación

```bash
./scripts/verify-rls.sh                  # 35 comprobaciones
psql -f scripts/flow-check.sql           # 17 comprobaciones
```

Corren contra cualquier Postgres 16 sin Docker ni Supabase.
`scripts/local-pg-stub.sql` crea los roles y el `auth.uid()` que Supabase ya
trae; **no forma parte de las migraciones**.

Al añadir una tabla o una política, añade su comprobación a
`scripts/isolation-check.sql` en el mismo commit, y verifica que sabe fallar.

Con el bloque A0 ya entraron las tres comprobaciones que de verdad importan de
esa tanda: que un líder de área **no** puede leer las credenciales de nadie
(`isolation-check.sql`), que asignar a alguien sin certificado en vigor falla
(`flow-check.sql`), y que un turno de niños con una sola persona no se puede
publicar (`npm test`, en `validarPublicacion()`).
