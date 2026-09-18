# ADR 0018 · Events como extensión 1:1 de Activities (Fase 6)

## Estado

Aceptado. Propuesto e implementado el 18 de septiembre de 2026.

Fuente de verdad: migraciones `supabase/migrations/20260924000100_events.sql` a `20260924000600_rpc_inscripcion.sql`. Este ADR solo describe lo que ese SQL hace.

Relacionado: [ADR 0004](0004-activity-raiz-generica.md) (Activity como raíz), [ADR 0017](0017-actividades-planificacion-fase-4.md) (decisión 2, que dejó abierta esta pregunta para Events), [ADR 0005](0005-rbac-capabilities-scopes.md), [ADR 0013](0013-estrategia-rls.md), [ADR 0014](0014-claves-fk-tenant-safe.md).

## Contexto

ADR 0017 (Fase 4) decidió no crear una tabla de extensión 1:1 para `activities`, porque ninguna columna nueva de esa fase era exclusiva de un tipo. Dejó explícitamente abierta la pregunta para fases posteriores que sí añadan campos exclusivos de un tipo — Events es exactamente ese caso.

`activities` ya incluye `type = 'event'` en su enum desde la Fase 0. La Fase 6 necesita: publicación pública, ventana de inscripción, aforo, lista de espera, formulario asociado y comportamiento de check-in. Ninguno de estos conceptos aplica a un `service`, `meeting`, `rehearsal`, `task` o `shift`.

## Decisión · Tabla `events` en relación 1:0..1 con `activities`

- `activities` sigue siendo la única fuente de fecha, hora, timezone, campus, recurrencia, estado temporal (`draft/planned/published/completed/cancelled/archived`) y visibilidad base (`private/leaders/members/public_future`). No se duplica ninguna de estas columnas en `events`.
- `events` es una tabla nueva con `activity_id` único (1:0..1: una activity de tipo `event` puede no tener fila `events` todavía, o tener como mucho una). Un trigger (`app.events_activity_type_guard`) impide crear una fila `events` sobre una `activity` que no sea `type = 'event'`.
- `events` añade solo lo que es exclusivo de evento: `public_slug`, `visibility` (propio, más granular que el de `activities`: añade `public` sin autenticación), `registration_enabled`/`registration_opens_at`/`registration_closes_at`/`capacity`/`waitlist_enabled`/`max_waitlist`/`registration_type`, contenido de la página pública (`cover_image_url`, `short_description`, `public_description`, `contact_email`, `contact_phone`, `confirmation_message`, `cancellation_policy`) y `form_id`.
- El estado de inscripción (`event_registration_status`: `disabled/scheduled/open/full/closed`) es una función calculada (`app.event_registration_status`), no una columna redundante: se deriva de `registration_enabled`, las fechas, `registration_status_override` y el aforo ocupado en tiempo real.

**Alternativas consideradas.**

(a) Añadir las columnas de evento directamente a `activities`, como hizo la Fase 4 con sus columnas transversales. Descartado: serían columnas `null` para el 100% de las filas que no son `event` (service, meeting, rehearsal, task, shift), violando el criterio que el propio ADR 0017 fijó para decidir cuándo una tabla de extensión está justificada.

(b) Un tipo `activity_type` separado con lógica de evento embebida directamente en `activities` mediante columnas condicionales y checks complejos. Descartado: mezcla dos ciclos de vida distintos (el temporal de `activities`, ya maduro desde Fase 4, y el de publicación/inscripción, nuevo) en una sola tabla, dificultando el mantenimiento y la lectura de RLS.

(c) Un sistema de calendario/evento completamente paralelo, sin relación con `activities`. Descartado explícitamente por el encargo de Fase 6 (§1): duplicaría el motor de recurrencia, zona horaria y campus ya resueltos en Fase 4.

## Decisión · Imagen de portada: URL externa, no upload de storage real

`events.cover_image_url` acepta una URL externa validada en la capa de aplicación (https, longitud), en lugar de implementar upload real a un bucket de Supabase Storage. `events.cover_file_id` queda como columna preparada (referencia a `files`, clasificación `public`) para cuando exista esa infraestructura, pero no se usa todavía.

**Motivo.** Ninguna fase anterior configuró buckets de Storage reales (`supabase/config.toml` los tiene comentados). Añadir esa infraestructura — buckets, políticas de `storage.objects`, validación de MIME/tamaño en el borde — es una superficie de trabajo nueva y sensible no pedida explícitamente por el encargo de Fase 6, que en su §45 solo pide "usar la infraestructura de files existente" y "validar MIME/tamaño/tenant/acceso", asumiendo que esa infraestructura ya permite subir archivos servibles públicamente, cosa que hoy no es cierta.

**Consecuencias.** La portada de un evento público depende de que el administrador enlace una imagen ya alojada en otro sitio. Deuda técnica explícita: implementar upload real a Storage cuando se prioricen buckets públicos, y entonces migrar `cover_image_url` a `cover_file_id` sin romper eventos existentes (ambas columnas conviven).

## Decisión · Lectura pública sin sesión

`anon` nunca obtiene `SELECT` general sobre `events`, `registrations`, `registration_attendees`, `form_submissions` ni `consent_records`. La única superficie pública es:

- `app.can_read_event_public(event_id)`: `security definer`, no depende de `church_ids_for_user()` (que para `anon` es siempre vacío), evalúa `visibility = 'public'`, `archived_at is null` y `activities.status in ('published', 'completed')`.
- `public.public_event_by_slug(church_slug, event_slug)`: `security definer`, devuelve solo las columnas necesarias para la página pública (nunca `church_id`, `id` interno más allá del estrictamente necesario para registrar, notas administrativas ni datos de inscritos).
- `public.register_for_event(...)`: única puerta de escritura pública, transaccional, que nunca deja decidir al cliente `church_id`, `status` ni `waitlist_position`.
- `public.cancel_registration_by_token(...)`: cancelación sin cuenta mediante un token opaco no predecible (`cancel_token`), nunca por ID de registration.

Esto sigue el mismo patrón de superficie mínima ya usado en Fase 0-5 (RPC `security definer` con wrapper público `security invoker`), extendido explícitamente a `anon` solo donde el encargo lo requiere.

## Consecuencias

- Una iglesia puede tener actividades de tipo `event` sin comportamiento de evento (sin fila `events`) — por ejemplo, un evento ya completado antes de esta fase, o uno que el administrador decide no publicar nunca. Es el comportamiento esperado: `events` es opt-in sobre `activities`.
- El calendario unificado (`/app/calendario`) no requiere cambios estructurales: sigue leyendo `activities` filtradas por `type`; la Fase 6 solo añade indicadores visuales de inscripción/aforo en la capa de aplicación cuando la actividad tiene fila `events`, reutilizando `ActivitySummary` sin romper su contrato.
- Cancelar, archivar, reprogramar o eliminar una `activity` de tipo `event` no borra la fila `events` (relación `on delete cascade` solo en sentido `events -> activities`, no al revés); las `registrations` existentes se conservan como historial aunque la actividad cambie de estado, siguiendo el mismo principio de Fase 5 (una asignación cancelada no se borra).
