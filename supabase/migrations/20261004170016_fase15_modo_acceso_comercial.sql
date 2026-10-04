-- Fase 15 · A1 (parte 1): modo de acceso comercial, separado de la pertenencia.
--
-- Membresía, permiso y acceso comercial son tres preguntas distintas:
--   * app.church_ids_for_user()  -> a qué tenants pertenece el usuario (sin cambios)
--   * has_capability(...)        -> qué puede hacer dentro de un tenant (sin cambios)
--   * app.church_access_mode(id) -> si el tenant puede operar comercialmente (nuevo)
--
-- Esta migración solo calcula el modo y deja clasificadas las tablas. No aplica
-- ningún bloqueo: eso lo hacen las migraciones siguientes.

-- 1. Inicio de la morosidad -------------------------------------------------------
--
-- La gracia de 15 días se cuenta desde el primer fallo de cobro relevante, y se
-- guarda aquí, en el servidor, no se recibe del cliente. Hasta que exista la
-- integración de cobro, lo fija la operación de plataforma.

alter table subscriptions
  add column if not exists past_due_since timestamptz;

comment on column subscriptions.past_due_since is
  'Inicio de la morosidad. Desde aquí se cuentan los 15 días de gracia. Obligatorio mientras status = past_due.';

alter table subscriptions
  drop constraint if exists subscriptions_past_due_desde_check;
alter table subscriptions
  add constraint subscriptions_past_due_desde_check
  check (status <> 'past_due' or past_due_since is not null);

-- 2. Clasificación de cada tabla tenant-aware -------------------------------------
--
-- Fuente explícita, no una heurística: si aparece una tabla nueva con church_id y
-- no está aquí, un test de guardarraíl falla. Las categorías están aprobadas.

create table commercial_gate_classification (
  table_name text primary key,
  category text not null check (category in ('business', 'control', 'infra', 'audit')),
  reason text not null check (btrim(reason) <> ''),
  created_at timestamptz not null default now()
);

comment on table commercial_gate_classification is
  'Clasificación de cada tabla con church_id para el gating comercial. business: bloqueada en suspended/cancelled/security_blocked. control: plano de control, con sus propias reglas. infra: ciclo de vida y jobs. audit: inmutable.';

alter table commercial_gate_classification enable row level security;
alter table commercial_gate_classification force row level security;
revoke all on commercial_gate_classification from public, anon, authenticated;

insert into commercial_gate_classification (table_name, category, reason) values
  ('church_entitlement_overrides', 'control', 'Excepciones comerciales de plataforma; mismo plano que subscriptions.'),
  ('church_feature_flags', 'control', 'Flags gestionados por plataforma.'),
  ('church_modules', 'control', 'Entitlement de módulos gestionado por plataforma y por el owner según su propia capability.'),
  ('subscriptions', 'control', 'Participa en el cálculo del modo de acceso: bloquearla crearía una dependencia circular.'),
  ('subscription_history', 'control', 'Historial comercial; se escribe desde las operaciones comerciales.'),
  ('support_sessions', 'control', 'Sesiones de soporte; el bloqueo comercial no debe impedir cerrarlas.'),
  ('church_onboarding', 'infra', 'Estado del alta; lo avanza el propio sistema de onboarding.'),
  ('export_jobs', 'infra', 'Exportaciones. Regla propia: permitidas en suspended y cancelled, denegadas en security_blocked.'),
  ('import_jobs', 'infra', 'Importaciones; ciclo de vida de jobs.'),
  ('notification_events', 'infra', 'Eventos del motor de avisos; los emite el sistema y los jobs filtran por modo.'),
  ('notification_deliveries', 'infra', 'Entregas del motor de avisos; las escribe el job.'),
  ('notifications', 'infra', 'Bandeja de avisos; la escriben los jobs y el propio usuario marca lectura.'),
  ('webhook_events_inbound', 'infra', 'Eventos entrantes de integraciones; procesamiento interno.'),
  ('audit_logs', 'audit', 'Registro de auditoría del tenant; inmutable.'),
  ('platform_audit_logs', 'audit', 'Registro de auditoría de plataforma; inmutable.');

-- Resto de tablas con church_id: business.
insert into commercial_gate_classification (table_name, category, reason)
select t, 'business', 'Datos operativos de la iglesia.'
from unnest(array[
  'activities','activity_admin_notes','activity_assignment_notes','activity_assignments','activity_plan_items',
  'activity_position_requirements','activity_positions','activity_series','activity_service_areas',
  'activity_substitution_requests','activity_template_areas','activity_template_plan_items',
  'activity_template_positions','activity_templates','campuses','church_people','church_people_roles',
  'communication_category_preferences','communication_recipients','communication_segments',
  'communication_templates','communications','consent_definitions','consent_records','course_cohorts',
  'course_enrollments','course_session_attendance','course_sessions','courses','credential_types',
  'custom_field_definitions','custom_field_values','events','files','form_fields','form_submission_answers',
  'form_submissions','forms','giving_campaigns','giving_contributions','giving_funds','giving_reconciliations',
  'giving_recurring_plans','giving_refunds','group_attendance','group_join_requests','group_leaders',
  'group_meetings','group_members','group_types','groups','household_members','households','invitations',
  'kid_checkins','kid_guardians','kid_pickup_authorizations','kid_pickup_overrides','kids_incidents',
  'kids_profiles','kids_required_credentials','kids_rooms','kids_sensitive_notes','kids_session_staff',
  'kids_sessions','learning_paths','notification_preferences','path_steps','person_credentials',
  'person_path_progress','person_qualifications','person_serving_preferences','person_tags',
  'person_unavailability_periods','person_unavailability_weekly','position_requirements','qualifications',
  'registration_attendees','registrations','resource_maintenance','resource_occupancy','resource_reservations',
  'resources','service_area_leaders','service_area_members','service_areas','service_positions',
  'service_team_members','service_teams','tags','webhook_endpoints_outbound','worship_repertoire_songs',
  'worship_repertoires','worship_songs'
]) as t;

-- 3. Modo de acceso -----------------------------------------------------------------
--
-- Prioridad: security_blocked > suspended/cancelled > past_due en gracia > active/trial.
-- Sin suscripción (alta en curso) el tenant es 'full': si no, el propio provisioning
-- quedaría bloqueado mientras crea sus filas.

create or replace function app.church_access_mode(p_church_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church churches%rowtype;
  v_status subscription_status;
  v_desde timestamptz;
begin
  select * into v_church from churches where id = p_church_id;
  if not found then
    return 'none';
  end if;

  if v_church.security_block_reason is not null then
    return 'security_blocked';
  end if;

  if v_church.archived_at is not null or v_church.status = 'archived' then
    return 'cancelled';
  end if;

  select s.status, s.past_due_since into v_status, v_desde
  from subscriptions s
  where s.church_id = p_church_id;

  if not found then
    return 'full';
  end if;

  case v_status
    when 'trial' then return 'full';
    when 'active' then return 'full';
    when 'past_due' then
      if v_desde is not null and now() < v_desde + interval '15 days' then
        return 'grace';
      end if;
      return 'suspended';
    when 'suspended' then return 'suspended';
    when 'cancelled' then return 'cancelled';
    else return 'suspended';
  end case;
end;
$$;

-- 4. Guardia de mutación -------------------------------------------------------------
--
-- Un único punto de decisión. Lanza 42501 (que el cliente ya traduce a FORBIDDEN)
-- con un código interno en DETAIL, sin revelar datos de la iglesia.

create or replace function app.assert_can_mutate(p_church_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_mode text := app.church_access_mode(p_church_id);
begin
  if v_mode in ('full', 'grace') then
    return;
  end if;

  raise exception 'La iglesia no permite cambios en este momento.'
    using errcode = '42501',
          detail = case v_mode
            when 'suspended' then 'CHURCH_SUSPENDED'
            when 'cancelled' then 'CHURCH_CANCELLED'
            when 'security_blocked' then 'CHURCH_SECURITY_BLOCKED'
            else 'CHURCH_NOT_FOUND'
          end;
end;
$$;

revoke all on function app.church_access_mode(uuid) from public, anon, authenticated;
revoke all on function app.assert_can_mutate(uuid) from public, anon, authenticated;
