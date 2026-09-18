-- Hotfix Fase 6 · F-05 (alto, defensa en profundidad): ninguna migración de
-- la Fase 6 revocó los privilegios por defecto del esquema public, así que
-- `anon` conservaba INSERT/UPDATE/DELETE —y SELECT— sobre las nueve tablas
-- nuevas. Hoy solo lo frena RLS: una única política mal escrita, un `force
-- row level security` que se pierda en una futura migración o una tabla
-- nueva sin política, y el visitante escribe. Las fases 4 y 5 sí revocaron
-- (20260922000400_rls_asignaciones.sql, 20260923000400_rls_avisos.sql); esta
-- migración pone la Fase 6 al mismo nivel.
--
-- Criterio (dos capas, no una):
--   * `anon` pierde toda escritura sobre las nueve tablas y toda lectura
--     salvo `events`, donde la política events_select_public sigue siendo la
--     superficie pública legítima (evento publicado + visibility public). El
--     resto de la superficie pública ya pasa por funciones `security definer`
--     de superficie mínima: public_event_by_slug, public_form_fields,
--     public_consent_definitions (hotfix F-01), register_for_event,
--     cancel_registration_by_token. Comprobado: ninguna página pública
--     (src/app/i/**) lee estas tablas directamente.
--   * `authenticated` pierde la escritura directa sobre las cinco tablas del
--     circuito de inscripción (form_submissions, form_submission_answers,
--     registrations, registration_attendees, consent_records), cuya única
--     puerta de escritura son las RPC `security definer` de la fase
--     (app.register_for_event, app.cancel_registration_by_token,
--     app.admin_cancel_registration, app.promote_waitlist,
--     app.checkin_attendee, app.undo_checkin_attendee). Las políticas
--     *_manage se quedan como segunda capa.
--     En cambio, `events`, `forms`, `form_fields` y `consent_definitions` SÍ
--     se administran con escritura directa bajo RLS desde los servicios de
--     servidor (events-service.ts, forms-service.ts, consents-service.ts),
--     así que ahí `authenticated` conserva la escritura: revocarla dejaría la
--     gestión de eventos, formularios y cláusulas sin funcionar.

-- 1. anon: sin escritura en ninguna de las nueve tablas nuevas.
revoke insert, update, delete, truncate on
  events, forms, form_fields, form_submissions, form_submission_answers,
  registrations, registration_attendees, consent_definitions, consent_records
from anon;

-- 2. anon: sin lectura salvo la superficie pública de `events`.
revoke select on
  forms, form_fields, form_submissions, form_submission_answers,
  registrations, registration_attendees, consent_definitions, consent_records
from anon;

-- consent_definitions se incluye arriba: desde el hotfix F-01 su superficie
-- pública es public.public_consent_definitions(slug), no la tabla.

-- 3. authenticated: el circuito de inscripción se escribe solo por RPC.
revoke insert, update, delete, truncate on
  form_submissions, form_submission_answers, registrations,
  registration_attendees, consent_records
from authenticated;

-- 4. app.assert_active_church_person: hoy es un oráculo de pertenencia.
-- Se definió en 20260920000500_activity_funciones_y_reglas.sql sin revocar el
-- EXECUTE por defecto a PUBLIC, así que `anon` podía invocarla: como lanza
-- excepción solo cuando la persona NO pertenece activamente a la iglesia,
-- distingue "este uuid de persona pertenece a esta iglesia" de "no
-- pertenece", sin sesión y para cualquier par (iglesia, persona). Sus
-- llamantes son triggers y funciones `security definer`, que la ejecutan como
-- propietario.
revoke all on function app.assert_active_church_person(uuid, uuid, text) from public, anon;
grant execute on function app.assert_active_church_person(uuid, uuid, text) to authenticated;
