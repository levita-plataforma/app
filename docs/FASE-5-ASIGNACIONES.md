# Fase 5 (Carlos) — Asignaciones, respuestas y sustituciones

Fecha: **17 de septiembre de 2026**. Responsable: **Carlos** (CA-04/CA-05). Rama: `feature/carlos-fase-5-asignaciones`.

## Estado

```
EN DESARROLLO — rama feature/carlos-fase-5-asignaciones; nada aplicado en remoto
```

- Documento técnico de entrega para revisión de Carlos. No autoriza integrar en `main` ni aplicar migraciones en producción.
- Fuente de verdad: migraciones `20260922000100` a `20260922000500`. Este documento solo describe lo que hace ese SQL.
- Decisiones de producto: acordadas por Carlos el 17 de septiembre de 2026 y registradas en [CONTRATO-F4-F5.md §3](CONTRATO-F4-F5.md). Lo compartido con Diogo sigue pendiente ([§9 del contrato](CONTRATO-F4-F5.md)).
- Interfaz (`src/`) y pruebas pgTAP: **en desarrollo en esta rama**. Este documento no describe pantallas ni recoge resultados de pruebas.
- Base: F4 cerrada e integrada ([FASE-4-ACTIVIDADES.md](FASE-4-ACTIVIDADES.md)).

---

## 1. Alcance y exclusiones

### Incluido (esquema, reglas y RPC)

- Asignaciones de personas de la iglesia a puestos de actividad, con historia conservada.
- Estados `proposed`, `pending`, `accepted`, `declined`, `cancelled`, `substituted`, con versión monotónica.
- Elegibilidad evaluada con los requisitos efectivos del puesto de la actividad y en la fecha de la actividad; bloqueos y avisos con códigos.
- Solapes con otras asignaciones de la persona en la misma iglesia.
- Cobertura real (confirmados, pendientes, borradores y previstos) y resumen por actividad.
- Respuestas de la propia persona con nota privada; respuestas registradas por representante.
- Solicitudes de sustitución con candidato único.
- Reacción a los cambios de F4 (cancelación, archivado, cambio de hora, ocurrencias eliminadas, puestos eliminados).
- Capability `assignment.manage`, RLS, escritura solo por RPC y auditoría.
- Lectura mínima de la actividad para la persona asignada.

### Excluido

| No construido | Responsable |
|---|---|
| Disponibilidad y bloqueos personales (solo se consulta si existe la función acordada) | Diogo (DI-01) |
| Preferencias y aviso de frecuencia | Diogo (DI-01) |
| Emisión de eventos, bandeja de avisos, cola y canales email/push | Diogo (DI-02/DI-03) |
| Recordatorios, horas de silencio y escalado | Diogo (DI-04) |
| Enlaces de respuesta con tokens firmados | Fuera de la primera versión (decisión 11) |
| Duplicar programación (copiar personas) | No acordado |

---

## 2. Migraciones

| Orden | Archivo | Propósito |
|---|---|---|
| 1 | `20260922000100_asignaciones.sql` | Tipos, tablas `activity_assignments`, `activity_assignment_notes` y `activity_substitution_requests`, índices, capability `assignment.manage` y concesión a roles, RLS activado y forzado. |
| 2 | `20260922000200_asignaciones_funciones.sql` | Autorización (`app.assignment_manage_cap`), referencias temporales, capacidad, evaluación de elegibilidad y conflictos, vista previa pública y ampliación del modelo de lectura de actividades. |
| 3 | `20260922000300_asignaciones_integracion_f4.sql` | Triggers: guarda de asignaciones y reacciones a cambios de actividades y puestos de F4. |
| 4 | `20260922000400_rls_asignaciones.sql` | Revoca escrituras directas y crea las políticas de lectura. |
| 5 | `20260922000500_rpc_asignaciones.sql` | RPC de creación, envío, retirada, respuestas y sustituciones; cobertura, resumen y revisión; wrappers públicos y permisos de ejecución. |

No añaden valores a tipos enum existentes.

---

## 3. Modelo de datos

### 3.1 Tipos

| Tipo | Valores |
|---|---|
| `activity_assignment_status` | `proposed`, `pending`, `accepted`, `declined`, `cancelled`, `substituted` |
| `activity_assignment_response_source` | `self`, `representative` |
| `activity_substitution_status` | `open`, `completed`, `cancelled` |

### 3.2 `activity_assignments`

| Grupo | Columnas | Notas |
|---|---|---|
| Identidad | `id`, `church_id`, `activity_id`, `activity_position_id`, `person_id` | FK `(activity_id, church_id)` → `activities` (cascada); FK `(activity_position_id, church_id)` → `activity_positions`, `on delete set null (activity_position_id)`; FK `(church_id, person_id)` → `church_people`. Inmutables salvo el puesto anulado por la FK |
| Estado | `status` (def. `proposed`), `version` (def. 1, ≥ 1) | `version` sube en cada mutación |
| Snapshot | `position_name`, `service_area_id` | Los fija el trigger de inserción desde el puesto |
| Sustitución | `substitutes_assignment_id` | FK `(id, church_id)` a la misma tabla; distinto de `id` |
| Elegibilidad | `eligibility_blocking`, `eligibility_warnings`, `acknowledged_warnings` (text[]), `eligibility_checked_at` | Solo códigos, sin datos sensibles |
| Trazabilidad | `created_by`, `created_at`, `sent_by`, `sent_at`, `responded_at`, `responded_by`, `response_source` | — |
| Horario confirmado | `confirmed_starts_at`, `confirmed_ends_at`, `reconfirmation_requested_at` | Se fija al aceptar |
| Cierre | `cancelled_at`, `cancelled_by`, `cancel_cause`, `substituted_at`, `updated_at` | `cancel_cause`: `coordinator`, `activity_cancelled`, `activity_archived`, `occurrence_removed`, `substitution_withdrawn` |

Constraints: `cancelled` ⇔ `cancelled_at` no nulo; `substituted` ⇔ `substituted_at` no nulo; fuera de `proposed` exige `sent_at` o `response_source = representative`; `accepted`/`declined` exigen `responded_at`; `unique (id, church_id)`.

Además, FK directa `person_id` → `people (id)` para que la API pueda embeber el nombre de la persona.

Índices:

| Índice | Definición |
|---|---|
| `activity_assignments_vigente_unique` | Único `(activity_position_id, person_id)` donde `status in (proposed, pending, accepted)` |
| `activity_assignments_one_candidate` | Único `(substitutes_assignment_id)` donde no nulo y `status in (proposed, pending, accepted)` |
| `activity_assignments_church_activity_idx` | `(church_id, activity_id)` |
| `activity_assignments_church_position_idx` | `(church_id, activity_position_id)` |
| `activity_assignments_church_person_status_idx` | `(church_id, person_id, status)` |

### 3.3 `activity_assignment_notes`

PK `assignment_id` (FK `(assignment_id, church_id)` en cascada); `church_id`, `person_id`, `note` (1–1000), `updated_at`. Nota privada de la respuesta: solo la lee la propia persona.

### 3.4 `activity_substitution_requests`

`id`, `church_id`, `activity_id`, `original_assignment_id`, `status` (def. `open`), `candidate_assignment_id`, `requested_by`, `requested_by_self`, `requested_at`, `completed_at`, `cancelled_at`, `cancelled_by`, `updated_at`. FKs compuestas a `activities` y `activity_assignments`; `completed` ⇔ `completed_at`; `cancelled` ⇔ `cancelled_at`; índice único `(original_assignment_id)` donde `status = open`.

---

## 4. Máquina de estados

```
            enviar                   aceptar
proposed ─────────► pending ◄──────────────────► accepted
    │                  │   ▲  cambio de hora (sistema)   │
    │                  │   └─────────────────────────────┘
    │                  └── rechazar ──► declined ── aceptar ──► accepted
    │
    └─ (proposed | pending | accepted) ──► cancelled      (terminal)
       (proposed | pending | accepted) ──► substituted    (terminal)
```

### 4.1 Matriz de transiciones

«Gestor» = `assignment.manage` en el ámbito (§8). «Límite» = inicio de la actividad (`timed`) o fin de su ventana (`flexible`; sin fin, sin límite). «Admite» = actividad `planned`/`published` y `ends_at > now()` (en `flexible`, también si `ends_at` es nulo).

| Desde → Hacia | Quién (RPC) | Cuándo | Efectos |
|---|---|---|---|
| — → `proposed` | Gestor (`create_activity_assignment`, `send = false`) | Sin bloqueos (incluye `activity_not_assignable`); avisos confirmados | `version = 1`; códigos guardados; `assignment.created` |
| — → `pending` | Gestor (`create_activity_assignment`, `send = true`) | Ídem | `sent_at`, `sent_by`; `assignment.created` (`sent: true`) |
| — → `pending` (candidato) | Gestor (`propose_substitution_candidate`) | Solicitud `open` sin candidato vigente; original `pending`/`accepted` con puesto; otra persona; sin bloqueos (la original no cuenta para capacidad ni solapes); avisos confirmados | Se crea directamente en `pending`, ya comunicado (conforme a lo acordado); `substitutes_assignment_id`; la solicitud apunta al candidato; `assignment.substitution_candidate_proposed` con los avisos confirmados |
| `proposed` → `pending` | Gestor del área de cada asignación (`send_activity_assignments`) | Actividad «admite»; módulo `serving`; sin bloqueos al revalidar cada asignación (un bloqueo aborta todo el envío con `22023`) | `sent_at`, `sent_by`, versión +1; `assignment.sent` (agregado por actividad) |
| `pending` → `accepted` | Persona (`respond_activity_assignment`) | Antes del límite; actividad `planned`/`published`; si es candidato, debe ser el candidato activo de una solicitud abierta (si no, `22023`); sin bloqueos al revalidar | `responded_*`, `response_source = self`, `confirmed_starts_at`/`confirmed_ends_at`, borra `reconfirmation_requested_at`, versión +1; `assignment.accepted`. Si es candidato: la original → `substituted` y la solicitud → `completed` |
| `pending` → `accepted` | Gestor (`record_assignment_response`) | Actividad `planned`/`published`; sin límite temporal; misma regla de candidato activo; sin bloqueos al revalidar | Ídem con `response_source = representative`; `assignment.response_recorded` |
| `pending` → `declined` | Persona antes del límite, o gestor como representante | Actividad `planned`/`published` | `responded_*`, versión +1; `assignment.declined` o `assignment.response_recorded`. Si es candidato: la solicitud queda sin candidato y sigue abierta |
| `declined` → `accepted` | Persona antes del límite, o gestor | Como `pending` → `accepted` | Como `pending` → `accepted` |
| `accepted` → `declined` | Solo gestor (`record_assignment_response`), también después del inicio (conforme a lo acordado) | Actividad `planned`/`published` | Como `pending` → `declined`. La persona recibe `22023` y debe pedir sustitución |
| `accepted` → `pending` | Sistema (trigger) | Cambio de `starts_at`/`ends_at` con la actividad en `draft`/`planned`/`published` | `reconfirmation_requested_at`; versión +1 en todas las vigentes; `assignment.reconfirmation_requested` |
| vigente → `cancelled` | Gestor (`cancel_activity_assignment`) | Cualquier momento | `cancel_cause = coordinator`, versión +1; si era candidato, la solicitud queda sin candidato; si era original con solicitud abierta, el candidato → `cancelled` (`substitution_withdrawn`) y la solicitud → `cancelled`; `assignment.cancelled` |
| vigente → `cancelled` | Sistema (trigger) | Actividad cancelada, archivada desde `draft`/`planned`/`published` u ocurrencia eliminada | `cancel_cause` según el caso; solicitudes abiertas → `cancelled`; `assignment.cancelled_by_activity` |
| vigente → `cancelled` | Persona original o gestor (`cancel_substitution_request`) | Solicitud `open` | Candidato vigente → `cancelled` (`substitution_withdrawn`); `assignment.substitution_cancelled` |
| vigente → `substituted` | Sistema, al aceptar el candidato | — | `substituted_at`, versión +1; `assignment.substituted` |

Reglas comunes de respuesta:

- Repetir la respuesta que ya tiene la asignación devuelve `replayed: true` sin cambios ni nueva versión (también tras el límite).
- `proposed`, `cancelled` y `substituted` no admiten respuestas. Para la persona, un borrador no existe (`P0002`), también al pedir sustitución.
- El representante puede responder por personas con o sin cuenta (conforme a lo acordado).
- Con `p_expected_version` distinta de la actual: `PT409`.
- Tras `declined`, `cancelled` o `substituted` se puede crear una asignación nueva para la misma persona y puesto (la unicidad solo cubre vigentes).

---

## 5. Elegibilidad y conflictos

`app.evaluate_assignment_eligibility(puesto, persona, excluidas)` devuelve `(blocking text[], warnings text[])`. Se ejecuta al crear, al enviar y al aceptar (en estos dos casos solo se aplican los bloqueos), al proponer candidato, en la vista previa y en la revisión. Lee `activity_position_requirements` sin filas `disabled` (el mismo filtro que `app.activity_position_effective_requirements`).

### 5.1 Referencia temporal

| Uso | `timed` | `flexible` |
|---|---|---|
| Vigencia de cualificaciones y credenciales | `ends_at` | `ends_at`; si no hay, `starts_at`; si no hay, `now()` |
| Solapes y disponibilidad | `[starts_at, ends_at)` | `[starts_at, ends_at)` si tiene ambos; si no, no se evalúan |
| Límite de respuesta de la persona | `starts_at` | `ends_at`; si es nulo, sin límite |
| Admite asignaciones | `planned`/`published` y `ends_at > now()` | `planned`/`published` y (`ends_at` nulo o `ends_at > now()`) |

### 5.2 Códigos

| Código | Tipo | Significado |
|---|---|---|
| `inactive_person` | Bloqueo | No pertenece a la iglesia o está archivada en `church_people` |
| `not_area_member` | Bloqueo | El puesto tiene área de catálogo y la persona no es miembro activo (`status = active`, sin `left_at`) |
| `insufficient_level` | Bloqueo | Puesto con persona autónoma y nivel distinto de `autonomous`/`leader`, o requisito `minimum_level` obligatorio no alcanzado |
| `missing_qualification` | Bloqueo | Requisito obligatorio de cualificación (con nivel mínimo si lo hay) no cumplido |
| `qualification_expired_at_activity` | Bloqueo | La cualificación existe pero caduca antes de la referencia temporal y el requisito exige vigencia |
| `missing_credential` | Bloqueo | Sin credencial `valid` del tipo exigido |
| `credential_expired_at_activity` | Bloqueo | Credencial `valid` que caduca antes de la referencia temporal, con vigencia exigida |
| `requirement_not_met` | Bloqueo | Sustituye a los dos anteriores si el tipo de credencial es sensible y quien consulta no tiene `credential.sensitive.read` |
| `activity_not_assignable` | Bloqueo | La actividad no «admite» (§5.1) |
| `position_full` | Bloqueo | `max_people` no nulo y previstos (sin las excluidas) ≥ máximo |
| `position_not_found` | Bloqueo | El puesto no existe |
| `*_recommended` | Aviso | Cualquiera de los códigos de requisito anteriores sobre un requisito `recommended` |
| `overlapping_assignment` | Aviso | Otra asignación vigente de la persona, en la misma iglesia y en otro puesto, cuyo rango se solapa |
| `unavailable` | Aviso | `app.person_unavailability` existe y devuelve filas para el rango |
| `availability_unknown` | Aviso | `app.person_unavailability` existe pero la consulta falla o se deniega; la operación continúa |
| `different_campus` | Aviso | La actividad tiene sede y la sede principal de la persona es otra |

Confirmación de avisos: sin `acknowledge_warnings`, crear o proponer candidato con avisos falla con `PT412` y los códigos en `DETAIL`. Al confirmar, los avisos quedan en `acknowledged_warnings` y en la auditoría (`assignment.created` y `assignment.substitution_candidate_proposed`).

Al enviar y al aceptar solo se revalidan bloqueos: los avisos surgidos después (solape, no disponibilidad) no se muestran ni se registran (limitación, §14).

Frecuencia: sin implementar (pendiente de la firma de Diogo).

---

## 6. Cobertura

| Lectura | Contenido |
|---|---|
| `public.activity_position_coverage(p_activity_id)` | Columnas de F4 + `pending_count`, `proposed_count`, `expected_count` al final. `assigned_count` y `coverage_status` usan confirmados (`accepted`) |
| `public.activity_staffing_summary(p_activity_ids)` | Por actividad (máx. 200): `positions`, `positions_requiring_people` (`min_people > 0`), `confirmed`, `pending`, `proposed`, `uncovered_positions` (confirmados < mínimo) |

Ambas son `security definer` y exigen `app.can_read_activity`: los recuentos (sin nombres) son los mismos para cualquiera que pueda leer la actividad, incluida la persona asignada; sin lectura, 0 filas. `overstaffed` solo aparece si el máximo se reduce después, porque crear respeta el máximo sobre previstos.

---

## 7. Integración con F4

| Cambio en F4 | Efecto en asignaciones |
|---|---|
| Cancelar (desde `draft`/`planned`/`published`) | Vigentes → `cancelled` (`activity_cancelled`), versión +1; solicitudes abiertas → `cancelled` |
| Archivar desde `draft`/`planned`/`published` | Vigentes → `cancelled` (`activity_archived`) |
| Archivar una `completed` | Se conservan |
| Completar | Sin cambios |
| Despublicar (`published` → `planned`) | Se conservan |
| `planned` → `draft` | Sin cambios; mientras siga en `draft` no se crean, envían ni responden asignaciones |
| Desarchivar o reactivar una cancelada | No se restauran las asignaciones canceladas |
| Cambio de `starts_at`/`ends_at` (individual o por serie) en `draft`/`planned`/`published` | `accepted` → `pending` con `reconfirmation_requested_at`; versión +1 en todas las vigentes. No reevalúa elegibilidad (`activity_assignment_review`) |
| Eliminar ocurrencia de serie (`update_activity_series_rule`) con asignaciones en cualquier estado | La fila no se borra: pasa a `cancelled` (motivo «Serie reprogramada» si no tenía) y sus vigentes → `cancelled` (`occurrence_removed`) |
| Borrar una actividad `completed`/`cancelled`/`archived` con historial de asignaciones | Error `22023` |
| Borrado en cascada de la iglesia | No interfiere |
| Eliminar puesto o área con asignaciones vigentes | Error `22023`. Sin vigentes, el histórico queda con `activity_position_id` nulo y conserva `position_name` |
| `apply_activity_structure_to_series` sobre ocurrencias con personas en los puestos | Error `22023` para toda la operación (reemplazar la estructura borra sus puestos) |
| Duplicar actividad o crear desde plantilla | No copian asignaciones |
| Cambios de requisitos, niveles o credenciales | Sin efecto automático; `activity_assignment_review` los reevalúa |

---

## 8. Permisos y modelo de lectura

### 8.1 Capability y operaciones

`assignment.manage` (módulo `serving`) concedida a `church_owner`, `church_admin`, `campus_admin` y `ministry_leader`. Se satisface con scope `church`, `campus` de la actividad o `activity` (`app.activity_cap`), o `service_area` del área del puesto. No concede `activity.publish`.

| Operación | Autorización | Módulo `serving` comprobado |
|---|---|---|
| Crear, retirar, registrar respuesta, proponer candidato | Gestor | Sí |
| Enviar | Gestor del área de cada asignación; con ids explícitos, todas o `42501` | Sí |
| Responder | Persona asignada (`app.current_person_ids()`), sin capability | No |
| Pedir sustitución | Persona (solo `accepted`, antes del límite) o gestor (`pending`/`accepted`) | Sí |
| Cancelar solicitud | Persona original o gestor | Sí (si la solicitud sigue abierta) |
| Vista previa de elegibilidad | Gestor | Sí |
| Revisión | Miembro; solo devuelve filas que gestione | Sí (sin módulo devuelve 0 filas) |
| Cobertura y resumen | Lectura de la actividad (`app.can_read_activity`) | No |

### 8.2 Lectura

| Quién | `activities`, estructura y orden del servicio | `activity_assignments` | Notas privadas | Solicitudes de sustitución |
|---|---|---|---|---|
| Gestor | Sí, en cualquier estado | Todas las de su ámbito | No | De su ámbito |
| Persona con asignación `pending`/`accepted` | Sí (no notas administrativas) | Las suyas, salvo `proposed` | Las suyas | Las de sus asignaciones |
| Lectura por el modelo de F4 | Como en F4 | Solo `accepted` (equipo confirmado, conforme a lo acordado) | No | No |
| Resto | No | No | No | No |

`app.can_read_activity_row` = `app.can_read_activity_row_base` (lógica de F4 más `assignment.manage`) o asignación `pending`/`accepted` de la persona. Las notas administrativas siguen con su función propia de F4.

---

## 9. Auditoría

| Acción | Entidad | Origen | Metadatos |
|---|---|---|---|
| `assignment.created` | `activity_assignments` | Crear | `activity_id`, `activity_position_id`, `person_id`, `sent`, `acknowledged_warnings` |
| `assignment.sent` | `activities` | Enviar | `assignments` (número) |
| `assignment.cancelled` | `activity_assignments` | Retirar | `activity_id`, `from` |
| `assignment.accepted` / `assignment.declined` | `activity_assignments` | Respuesta propia | `activity_id`, `from`, `to`, `source` |
| `assignment.response_recorded` | `activity_assignments` | Respuesta por representante | Ídem |
| `assignment.substituted` | `activity_assignments` (original) | Candidato acepta | `activity_id`, `substitute_assignment_id` |
| `assignment.substitution_requested` | `activity_assignments` | Pedir sustitución | `activity_id`, `request_id`, `by_self` |
| `assignment.substitution_candidate_proposed` | `activity_assignments` (candidato) | Proponer candidato | `activity_id`, `request_id`, `original_assignment_id`, `acknowledged_warnings` |
| `assignment.substitution_cancelled` | `activity_assignments` (original) | Cancelar solicitud | `activity_id`, `request_id` |
| `assignment.cancelled_by_activity` | `activities` | Trigger de cancelación/archivado | `cause`, `assignments` |
| `assignment.reconfirmation_requested` | `activities` | Trigger de cambio de hora | `assignments` |

Las notas privadas no se auditan.

---

## 10. Contrato RPC

Todas son `public.*` (`security invoker`) que llaman a `app.*` (`security definer`), salvo las lecturas indicadas. `EXECUTE` solo para `authenticated`. Cada llamada es una transacción.

Errores (SQLSTATE): `42501` no autorizado · `P0002` no encontrado · `22023` regla (bloqueos en `DETAIL`, separados por comas) · `PT412` avisos sin confirmar (códigos en `DETAIL`) · `PT409` versión distinta (actual en `DETAIL`) · `23505` conflicto.

| Función | Parámetros | Devuelve | Permiso | Idempotencia |
|---|---|---|---|---|
| `create_activity_assignment` | `p_activity_position_id`, `p_person_id`, `p_input` (`acknowledge_warnings`, `send`) | `{assignment_id, status, version, replayed, warnings}` | Gestor | Si ya hay una vigente para esa persona y puesto, la devuelve con `replayed: true` |
| `send_activity_assignments` | `p_activity_id`, `p_assignment_ids` (nulo = todas) | integer | Gestor | Solo actúa sobre `proposed` |
| `cancel_activity_assignment` | `p_assignment_id`, `p_expected_version` | `{status, version, replayed}` | Gestor | No vigente → `replayed: true` |
| `respond_activity_assignment` | `p_assignment_id`, `p_response`, `p_expected_version`, `p_note` | `{status, version, replayed}` | Persona asignada | Misma respuesta → `replayed: true` |
| `record_assignment_response` | `p_assignment_id`, `p_response`, `p_expected_version` | `{status, version, replayed}` | Gestor | Ídem |
| `request_assignment_substitution` | `p_assignment_id` | `{request_id, replayed}` | Persona o gestor | Solicitud abierta existente → `replayed: true` |
| `propose_substitution_candidate` | `p_request_id`, `p_person_id`, `p_acknowledge_warnings` | `{assignment_id, status, warnings}` | Gestor | No: con candidato vigente, `23505` |
| `cancel_substitution_request` | `p_request_id` | void | Persona original o gestor | Solicitud no abierta → sin cambios |
| `preview_assignment_eligibility` (`definer`) | `p_activity_position_id`, `p_person_id` | `(blocking, warnings)` | Gestor | Solo lectura |
| `activity_position_coverage` (`definer`) | `p_activity_id` | §6 | `app.can_read_activity` | Solo lectura |
| `activity_staffing_summary` (`definer`) | `p_activity_ids` | §6 | `app.can_read_activity` por actividad | Solo lectura |
| `activity_assignment_review` (`definer`) | `p_activity_id` | `(assignment_id, blocking, warnings)` | Filas que gestione | Solo lectura |

Funciones internas sin `EXECUTE` para `authenticated`: `app.position_expected_count`, `app.evaluate_assignment_eligibility`, `app.activity_accepts_assignments_unchecked`, `app.lock_assignment_context`, `app.require_assignment_manage`, `app.raise_assignment_blocked`, `app.check_expected_version`, `app.apply_assignment_response`.

---

## 11. Concurrencia

| Mecanismo | Detalle |
|---|---|
| Bloqueo de la actividad | Toda RPC de escritura toma `FOR UPDATE` sobre la fila de `activities` antes que sobre la asignación o la solicitud; serializa capacidad, envíos y sustituciones de una actividad |
| Versión | `version` +1 en cada mutación (RPC y triggers). `p_expected_version` en retirar y responder; si no coincide, `PT409`. Un cambio de hora sube la versión de todas las vigentes e invalida respuestas en curso |
| Índices únicos | Una vigente por puesto y persona; un candidato vigente por original; una solicitud abierta por original |
| Reintentos de creación | Si otra transacción crea la misma asignación a la vez, la violación de unicidad se captura y se devuelve la existente (`replayed: true`) |
| Aceptación simultánea de candidatos | Imposible por el índice de candidato único |
| Capacidad | `position_full` se evalúa con la actividad bloqueada |

---

## 12. Dependencias bloqueadas de Diogo

| Dependencia | Situación en F5-Carlos |
|---|---|
| `app.person_unavailability(church_id uuid, person_ids uuid[], from timestamptz, to timestamptz)` | Consulta dinámica solo si existe. Hoy no existe: el aviso `unavailable` no se produce. Sin tabla ni función sustituta. Si falla o deniega, aviso `availability_unknown` y la operación continúa |
| `app.person_serving_preferences` | No se consume; sin aviso de frecuencia |
| Punto de escritura de eventos (DI-02) | Sin emisión; puntos marcados `EVENTO F5` ([contrato §6.1](CONTRATO-F4-F5.md)) |
| Recordatorios, silencio, escalado y transporte | Fuera de alcance |

---

## 13. Plan de migración y recuperación para producción

> **No ejecutado.** Requiere validación expresa de Carlos sobre el commit concreto y autorización para producción.

### 13.1 Antes de aplicar

1. Backup o snapshot PITR; anotar la marca de tiempo.
2. Comprobaciones de solo lectura:

```sql
-- a) Última migración aplicada: se espera 20260920000900 (o posteriores conocidas).
select version from supabase_migrations.schema_migrations order by version desc limit 5;

-- b) Colisiones de nombres (se esperan 0 filas).
select typname from pg_type
where typname in ('activity_assignment_status', 'activity_assignment_response_source', 'activity_substitution_status');
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('activity_assignments', 'activity_assignment_notes', 'activity_substitution_requests');
select key from capabilities where key = 'assignment.manage';

-- c) Roles y módulo que usa la migración (se esperan 4 filas y 1 fila).
select key from roles where key in ('church_owner', 'church_admin', 'campus_admin', 'ministry_leader');
select key from modules where key = 'serving';

-- d) Funciones de F4 que se redefinen o recrean.
select pg_get_function_result('public.activity_position_coverage(uuid)'::regprocedure);
select to_regprocedure('app.can_read_activity_row(uuid,uuid,uuid,activity_status,activity_visibility,uuid)');
select to_regprocedure('app.can_read_activity_row_base(uuid,uuid,uuid,activity_status,activity_visibility,uuid)'); -- se espera nulo

-- e) Triggers actuales en las tablas de F4 que reciben triggers nuevos.
select tgrelid::regclass, tgname from pg_trigger
where tgrelid in ('public.activities'::regclass, 'public.activity_positions'::regclass) and not tgisinternal
order by 1, 2;

-- f) Disponibilidad de Diogo (informativo: si existe, se empezará a consultar).
select to_regprocedure('app.person_unavailability(uuid,uuid[],timestamptz,timestamptz)');
```

3. `supabase db push --dry-run`: deben aparecer exactamente las cinco migraciones `20260922000100`–`20260922000500` (más las de Diogo solo si se han integrado y acordado).

### 13.2 Orden de aplicación

1. `20260922000100` a `20260922000500`, en orden. No añaden valores a enums existentes, así que no hace falta aplicarlas por separado.
2. Migraciones **antes** del código que llama a las RPC nuevas.
3. Regenerar `database.types.ts` desde el esquema combinado.

### 13.3 Compatibilidad con la versión desplegada

| Aspecto | Efecto |
|---|---|
| `public.activity_position_coverage` | Se elimina y se recrea en la misma migración con las seis columnas de F4 en el mismo orden y tres añadidas al final; se vuelven a conceder permisos. El código de `main` no la llama (calcula la cobertura con 0 en `src/server/activities/activity-structure-service.ts`) |
| `app.can_read_activity_row` | Pasa a delegar en `app.can_read_activity_row_base` (lógica de F4 más `assignment.manage`) y añade la lectura por asignación. Amplía la lectura solo a titulares de `assignment.manage` y a personas asignadas; las políticas de F4 no cambian |
| Triggers nuevos en `activities` y `activity_positions` | Sin asignaciones no alteran ninguna operación de F4. Con asignaciones: cambios de §7. Eliminar una ocurrencia con asignaciones la cancela, lo que exige `activity.cancel` en el trigger de estado de F4 |
| Capability `assignment.manage` | Nueva; se concede a cuatro roles del sistema |

### 13.4 Después de aplicar (verificación, solo lectura)

```sql
select enum_range(null::activity_assignment_status);

select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('activity_assignments', 'activity_assignment_notes', 'activity_substitution_requests');
-- esperado: true, true en las tres

select has_table_privilege('authenticated', 'public.activity_assignments', 'INSERT') as ins,
       has_table_privilege('authenticated', 'public.activity_assignments', 'UPDATE') as upd,
       has_table_privilege('anon', 'public.activity_assignments', 'SELECT')          as anon_sel;
-- esperado: false, false, false

select role_key from role_capabilities where capability_key = 'assignment.manage' order by 1;
-- esperado: campus_admin, church_admin, church_owner, ministry_leader

select pg_get_function_result('public.activity_position_coverage(uuid)'::regprocedure);

select tgrelid::regclass, tgname from pg_trigger
where tgname in ('activity_assignments_guard', 'activities_assignments_sync',
                 'activities_preserve_assigned', 'activity_positions_block_assigned');
```

### 13.5 Recuperación

Revertir en Git **no revierte migraciones aplicadas**. La base se corrige con una **migración compensatoria nueva** (marca de tiempo posterior) o restaurando el backup/PITR. No borrar del repositorio migraciones registradas en `supabase_migrations.schema_migrations`.

**Nivel 1 — contención** (devuelve a F4 su comportamiento sin borrar datos de asignaciones):

1. `drop trigger activities_assignments_sync on activities;`, `drop trigger activities_preserve_assigned on activities;` y `drop trigger activity_positions_block_assigned on activity_positions;`.
2. Recrear `app.can_read_activity_row` con el cuerpo de `20260920000500_activity_funciones_y_reglas.sql`.
3. Revocar `EXECUTE` a `authenticated` en los wrappers `public.*` de escritura de §10.

**Nivel 2 — reversión de esquema** (borrador para escribir y probar en local antes de usarlo; exportar antes las asignaciones si deben conservarse):

1. Nivel 1.
2. Recrear `public.activity_position_coverage` con la definición de F4 (`drop function` y `create function` con seis columnas y `assigned_count = 0`; volver a conceder `EXECUTE`). Hacerlo después de retirar el código que use las columnas nuevas.
3. Eliminar wrappers `public.*` y funciones `app.*` de `0500`, `0400`, `0300` y `0200` (incluidas `app.can_read_activity_row_base` e `app.is_assigned_to_activity`, ya sin uso tras el paso 2 del nivel 1).
4. Eliminar tablas `activity_substitution_requests`, `activity_assignment_notes` y `activity_assignments`, y los tres tipos.
5. `delete from capabilities where key = 'assignment.manage';` (`role_capabilities` cae en cascada).

Las ocurrencias que el trigger convirtió en canceladas en lugar de borrarse no vuelven a su estado anterior con SQL compensatorio; solo desde el backup.

---

## 14. Riesgos y puntos a revisar

| Riesgo / punto | Detalle | Tratamiento |
|---|---|---|
| Pruebas | Suites pgTAP en desarrollo en esta rama; sin resultados que registrar | Pendiente |
| Aceptación y envío sin avisos nuevos | Solo se revalidan bloqueos; avisos surgidos después (solape, no disponibilidad) no se muestran ni se registran | Limitación conocida |
| Ocurrencia eliminada por serie | Con asignaciones, la ocurrencia se cancela: exige `activity.cancel` (si falta, falla la edición de la regla con `42501`) y F4 la sigue contando como `removed` y auditando como `activity.series_occurrence_removed` | Limitación conocida |
| Aplicar estructura a la serie | Se bloquea con `22023` toda la operación si alguna ocurrencia tiene personas en sus puestos | Limitación conocida |
| Solape dentro de la misma actividad | Dos puestos de la misma actividad para una persona generan `overlapping_assignment` | Limitación conocida |
| Cambios de estado sin efecto | Completar no cambia `proposed`/`pending`; `planned` → `draft` no afecta; desarchivar o reactivar no restaura las canceladas | Limitación conocida |
| Requisitos leídos de la tabla | F5 lee `activity_position_requirements` con el mismo filtro (`not disabled`) que `app.activity_position_effective_requirements`, no mediante esa función; un cambio de su lógica en F4 debe replicarse | Limitación conocida |
| Contrato de disponibilidad | Firma y autorización aún no acordadas; un fallo solo produce `availability_unknown` | Acordar (contrato §9) |
| Orden de migraciones con Diogo | `20260921…` anterior a `20260922…` ya aplicadas | `--dry-run` antes de aplicar |
| Tipos TypeScript | Regenerar desde el esquema combinado | Pendiente |
