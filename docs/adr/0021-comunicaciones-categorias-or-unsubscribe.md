# ADR 0021 · Comunicaciones (Fase 9, iteración): categorías, OR, preferencias por categoría, unsubscribe

## Estado

Aceptado. Propuesto e implementado el 19 de septiembre de 2026, como iteración sobre el mismo PR de la Fase 9 (ver [ADR 0020](0020-comunicaciones-vs-avisos.md)).

Fuente de verdad: migraciones `supabase/migrations/20261001000800_comunicaciones_categorias.sql` a `20261001001100_comunicaciones_unsubscribe.sql`. Este ADR solo describe lo que ese SQL hace, y no repite lo ya documentado en el ADR 0020.

Relacionado: [ADR 0020](0020-comunicaciones-vs-avisos.md), decisión A14 (`docs/07-decisiones.md`), `docs/03-notificaciones.md` §13, `docs/modulos/05-comunicaciones.md`.

## Contexto

Tras cerrar la Fase 9 (ADR 0020, PR abierto y verificado), una segunda ronda de requisitos pidió: categorías de comunicación más granulares que `institutional`/`operational`, segmentación con OR además de AND, preferencias de baja por categoría (no solo por canal), un mecanismo de unsubscribe sin sesión, capabilities separadas para editar/cancelar, y un límite de envío centralizado en un solo punto para conectarlo a entitlements en el futuro. También pedía webhooks de proveedor con validación de firma para bounce/reintentos diferenciados.

Se trató como iteración sobre la misma rama y el mismo PR, no como una fase nueva: la base de datos, RLS, RPCs, cron, UI y tests de la Fase 9 ya estaban probados y no se rehicieron.

## Decisión · Categorías: ampliar el enum existente, no crear un concepto paralelo

`communication_purpose` pasa de 2 a 9 valores (`institutional`, `operational`, `services`, `groups`, `events`, `discipleship`, `kids`, `pastoral`, `system`) vía `ALTER TYPE ... ADD VALUE`, sin recrear la tabla. Postgres no permite usar un valor añadido en la misma transacción que lo crea, así que cualquier función que lo referencie vive en la migración siguiente (`20261001000900` en adelante). `marketing` sigue sin existir: permanece fuera de alcance (A14).

`institutional`, `operational` y `system` son **obligatorias**: nunca admiten opt-out, ni por canal ni por categoría. Las 6 restantes son **opcionales**.

## Decisión · OR en segmentación sin anidamiento

`app.validate_segment_rules` y `app.resolve_segment_recipients` aceptan `{"any": [...]}` como alternativa a `{"all": [...]}` al mismo nivel superior — nunca ambos a la vez, nunca anidado. En TypeScript esto es una unión discriminada (`{ all; any?: never } | { any; all?: never }`), no un objeto con ambos campos opcionales, para que el propio tipo impida construir un JSON ambiguo antes de llegar al servidor.

`app.resolve_segment_recipients` calcula `v_matches` (el universo completo que cumple cada condición) por regla, de forma independiente, y combina con `v_candidates` mediante intersección progresiva (AND, arranca del universo completo) o unión progresiva (OR, arranca vacío). Sigue sin haber SQL libre ni `format()` con datos del cliente: el intérprete es el mismo `case` por campo del ADR 0020, solo cambia el modo de combinación.

## Decisión · Preferencias por categoría: tabla nueva y acotada, no tocar Fase 5

`notification_preferences` (Fase 5) es por `(church_id, person_id, channel)`, sin concepto de categoría, y la usan avisos operativos individuales (turnos, sustituciones) que el propio encargo pide mantener siempre activos. Convertirla en purpose-aware habría sido un cambio estructural sobre un contrato ya en uso.

Se crea `communication_category_preferences(church_id, person_id, category, opted_out, updated_at)`, con un `CHECK` que solo admite las 6 categorías opcionales — `institutional`/`operational`/`system` no pueden tener fila ahí, así que no existe ni la posibilidad de silenciarlas. Al materializar una comunicación, `app.materialize_communication_impl` consulta esta tabla solo si la categoría es opcional; si hay opt-out, suprime `email`/`push` para esa persona pero **nunca** el canal `inapp` — la bandeja interna siempre registra el mensaje, igual que ya ocurría con las preferencias de canal de Fase 5.

## Decisión · Unsubscribe: token opaco, mismo patrón que `cancel_token` de Fase 6

`communication_recipients.unsubscribe_token` se genera solo para destinatarios de canal `email` en una categoría opcional sin opt-out previo, con el mismo patrón ya validado en `registrations.cancel_token` (Fase 6): dos UUID v4 concatenados sin guiones, comparación por igualdad, nunca JWT ni HMAC. `institutional`/`operational`/`system` nunca generan token — no hay baja posible.

`app.unsubscribe_by_token(p_token text)` es `security definer`, con wrapper público `grant`eado a `anon` (nunca a `authenticated`/`public`): el enlace de un correo no debe exigir sesión. Busca por igualdad de token, marca `opted_out = true` en `communication_category_preferences` vía `on conflict do update`, y audita `preferences.updated`. El aislamiento multi-tenant no depende de ningún parámetro `church_id` explícito — lo resuelve el propio token, que es único globalmente y apunta a una fila de `communication_recipients` con su `church_id` ya fijado. Verificado con un test pgTAP dedicado (sección 15 de `fase9_comunicaciones_test.sql`): un token de una iglesia nunca afecta preferencias de otra.

La página pública vive en `src/app/i/comunicacion/baja/[token]/`, fuera del route group `(app)` (que exige sesión), siguiendo el patrón ya usado por la cancelación pública de inscripciones de Fase 6 (`src/app/i/[churchSlug]/eventos/[eventSlug]/confirmacion/`). A diferencia de esa página, no necesita `churchSlug` en la ruta porque el token ya es autorresolutivo. La baja solo ocurre en el POST del formulario, nunca en el GET de la página, para no quedar expuesta a prefetch de enlaces o crawlers que siguen el link automáticamente.

## Decisión · Capabilities `communications.update` y `communications.cancel` separadas de `communications.schedule`

Antes, `cancel_communication` reutilizaba `communications.schedule`. Se añaden `communications.update` (usada por la nueva `app.update_communication`, que solo permite editar una comunicación en estado `draft`) y `communications.cancel` como capabilities propias, concedidas a los mismos roles que el resto (`church_owner`, `church_admin`, `campus_admin`, `ministry_leader`), siguiendo el mismo patrón de migración que las capabilities ya existentes de esta fase.

## Decisión · Límite de envío centralizado, sin inventar entitlements

`app.create_communication` usaba un límite de 20 comunicaciones/hora hardcodeado inline. Se extrae a `app.communication_rate_limit(p_church_id) returns integer`, que hoy sigue devolviendo `20` fijo, pero centraliza el número en un único punto de extensión. No se construye ningún sistema de planes o entitlements — no hay pedido concreto que lo requiera todavía; el gancho queda preparado para cuando exista.

## Decisión · Webhooks de proveedor: NO implementados, bloqueados por A14

No existe ningún proveedor real de email/push en el proyecto (A14, ya decidido en fases anteriores). Un endpoint HTTP de webhook que valide firma/timestamp/replay de un proveedor inexistente sería, en el mejor caso, simulación, y en el peor, una superficie de ataque activa sin ningún propósito real detrás (nadie podría verificar que una llamada entrante fuera legítima porque no hay secreto de firma real que compartir). Por el mismo motivo, no se implementa el manejo real de bounce hard/soft.

Se prepara únicamente lo que no depende de un proveedor: la columna `communication_recipients.failure_kind` (enum `temporary`/`permanent`), pensada para cuando exista un proveedor real que pueda distinguir un fallo transitorio de uno definitivo. No hay lógica de reintento activa: sin proveedor real, ningún envío de email/push falla nunca hoy, así que no hay ningún caso real que ejercite esa rama. Implementarla ahora sería simular fallos que no pueden ocurrir.

## Decisión · Núcleo transversal: documentado como contrato, no como wrapper nuevo

`app.create_communication`/`materialize_communication`/`send_communication` ya son RPCs internas reutilizables (ADR 0020). Se deja documentado aquí, explícitamente, que cualquier módulo futuro (Eventos → recordatorio, Serving → cambio de turno, Grupos → convocatoria de reunión, Discipulado → sesión, Kids → aviso a responsable autorizado) debe llamarlas en vez de crear su propio mecanismo de envío masivo. No se construye ningún wrapper específico por módulo en esta iteración: ninguno de esos módulos tiene todavía un caso de uso concreto que lo pida, y un wrapper sin llamador real sería código muerto.

## Nota · Corrección de fecha en el prefijo de migraciones

Las migraciones de esta fase se crearon originalmente con el prefijo `20260931*` para evitar una colisión de numeración al reconciliar con el trabajo de Grupos/Discipulado/Kids que llegó a `main` mientras esta rama estaba en curso. El 31 de septiembre no es una fecha válida — fue un desliz al elegir un número libre por encima de `20260930` (última fecha real usada por el hotfix previo) sin comprobar que septiembre solo tiene 30 días.

No era un identificador secuencial deliberado: el proyecto usa `YYYYMMDDhhmmss`-like real como convención (confirmado contra el resto de `supabase/migrations/`). Corregido antes de pedir el merge a `main`: renombradas a `20261001000100`-`20261001001100` (1 de octubre de 2026, siguiente fecha real libre después del `20260930` de `main`), conservando exactamente el mismo orden relativo y contenido — solo cambia el prefijo del nombre de archivo, ningún cambio de esquema. Verificado antes de renombrar que estas migraciones nunca se aplicaron a ningún entorno compartido: no existen en `main` ni en ninguna otra rama remota, no hay proyecto Supabase enlazado (`supabase link`) desde esta sesión, y el único lugar donde se habían ejecutado es `supabase db reset --local` (efímero) y los runners de CI (también efímeros, se recrean en cada ejecución). Ninguna migración ya aplicada en un entorno real fue modificada ni renombrada.

## Consecuencias

- El contrato de `notification_preferences` de Fase 5 no cambia: sigue siendo por canal, sin categoría. La categoría vive exclusivamente en `communication_category_preferences`, una tabla nueva y acotada.
- Ampliar la segmentación a anidamiento de `all`/`any` (por ejemplo `(A AND B) OR C`) seguiría sin requerir cambiar el esquema de columna, pero sí el intérprete — no se ha hecho porque no hay un caso de uso real que lo pida y el encargo original ya limitaba explícitamente el alcance a un nivel.
- El día que exista un proveedor real de email/push (A14 se resuelva), hará falta: (1) el endpoint de webhook con validación de firma, (2) lógica real de bounce hard/soft, (3) lógica real de reintento usando `failure_kind`. Ninguno de los tres es difícil de añadir sobre lo ya preparado, pero ninguno existe hoy.
