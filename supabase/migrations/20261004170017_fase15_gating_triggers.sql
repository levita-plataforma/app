-- Fase 15 · A1 (parte 2): guardarraíl comercial a nivel de tabla.
--
-- Un trigger BEFORE INSERT/UPDATE/DELETE en cada tabla de negocio llama a
-- app.assert_can_mutate(church_id). Así se cubren de una vez las RPC
-- SECURITY DEFINER, las políticas de escritura, las server actions y cualquier
-- otra ruta SQL, sin editar a mano cada función.
--
-- No se aplica a plano de control, infraestructura ni auditoría
-- (commercial_gate_classification). Las excepciones son por transición concreta,
-- no un bypass del módulo.

-- Bypass de lifecycle. Solo cuenta si la sesión actual es service_role (no la
-- puede activar un usuario autenticado) Y el flag transaccional está puesto.
-- Ver app.run_lifecycle en la siguiente migración.
create or replace function app.lifecycle_bypass_active()
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(current_setting('app.lifecycle_bypass', true), '') = 'on'
     and coalesce(current_setting('role', true), '') = 'service_role';
$$;

revoke all on function app.lifecycle_bypass_active() from public, anon, authenticated;

-- Trigger de negocio.
create or replace function app.enforce_commercial_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_tenant uuid;
begin
  if tg_op = 'INSERT' then
    v_tenant := new.church_id;
  elsif tg_op = 'UPDATE' then
    if new.church_id is distinct from old.church_id then
      raise exception 'No se pueden trasladar registros entre iglesias.' using errcode = '42501';
    end if;
    v_tenant := old.church_id;
  else
    v_tenant := old.church_id;
  end if;

  if app.lifecycle_bypass_active() then
    return coalesce(new, old);
  end if;

  -- Las excepciones de Kids comparan campos con to_jsonb: plpgsql resuelve
  -- new.<campo> al ejecutar, y no todas las tablas tienen esas columnas.
  if tg_table_name = 'kid_checkins' and tg_op = 'UPDATE' then
    if to_jsonb(old)->>'status' = 'checked_in' and to_jsonb(new)->>'status' = 'checked_out'
       and to_jsonb(new)->>'church_id' = to_jsonb(old)->>'church_id'
       and to_jsonb(new)->>'session_id' is not distinct from to_jsonb(old)->>'session_id'
       and to_jsonb(new)->>'kid_person_id' is not distinct from to_jsonb(old)->>'kid_person_id' then
      return new;
    end if;
  end if;

  if tg_table_name = 'kid_pickup_authorizations' and tg_op = 'UPDATE' then
    if to_jsonb(old)->>'status' in ('active', 'pending') and to_jsonb(new)->>'status' = 'used'
       and to_jsonb(new)->>'used_checkin_id' is not null
       and exists (
         select 1 from kid_checkins kc
         where kc.id = (to_jsonb(new)->>'used_checkin_id')::uuid
           and kc.church_id = v_tenant
           and kc.status = 'checked_out'
       ) then
      return new;
    end if;
  end if;

  if tg_table_name = 'kids_incidents' and tg_op = 'INSERT' then
    if app.church_access_mode(v_tenant) in ('suspended', 'cancelled')
       and exists (
         select 1 from kid_checkins kc
         where kc.church_id = v_tenant
           and kc.kid_person_id = (to_jsonb(new)->>'kid_person_id')::uuid
           and kc.status = 'checked_in'
       ) then
      return new;
    end if;
  end if;

  perform app.assert_can_mutate(v_tenant);
  return coalesce(new, old);
end;
$$;

revoke all on function app.enforce_commercial_write() from public, anon, authenticated;

-- Exportaciones: se pueden pedir en suspended y cancelled; nunca en security_blocked.
create or replace function app.enforce_export_gate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if app.lifecycle_bypass_active() then
    return new;
  end if;
  if app.church_access_mode(new.church_id) not in ('full', 'grace', 'suspended', 'cancelled') then
    raise exception 'La exportación no está disponible en este momento.'
      using errcode = '42501', detail = 'CHURCH_SECURITY_BLOCKED';
  end if;
  return new;
end;
$$;

revoke all on function app.enforce_export_gate() from public, anon, authenticated;

-- Iglesia: su fila no cuelga de church_id, así que tiene su propio guardarraíl.
-- En modos restringidos solo cambian las columnas de estado y bloqueo, que usan
-- la plataforma y la recuperación. El branding y la configuración normal se bloquean.
create or replace function app.enforce_church_gate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_mode text;
  v_control text[] := array['status', 'archived_at', 'archived_by', 'security_block_reason',
                            'security_blocked_at', 'security_blocked_by', 'updated_at'];
begin
  if app.lifecycle_bypass_active() then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    perform app.assert_can_mutate(old.id);
    return old;
  end if;

  v_mode := app.church_access_mode(old.id);
  if v_mode in ('full', 'grace') then
    return new;
  end if;

  if (to_jsonb(new) - v_control) is distinct from (to_jsonb(old) - v_control) then
    raise exception 'La configuración de la iglesia no se puede cambiar en este momento.'
      using errcode = '42501', detail = 'CHURCH_' || upper(v_mode);
  end if;
  return new;
end;
$$;

revoke all on function app.enforce_church_gate() from public, anon, authenticated;

create trigger churches_commercial_gate
  before update or delete on churches
  for each row execute function app.enforce_church_gate();

create trigger export_jobs_commercial_gate
  before insert or update on export_jobs
  for each row execute function app.enforce_export_gate();

-- Triggers de negocio (94 tablas, según commercial_gate_classification).
create trigger activities_commercial_gate before insert or update or delete on activities for each row execute function app.enforce_commercial_write();
create trigger activity_admin_notes_commercial_gate before insert or update or delete on activity_admin_notes for each row execute function app.enforce_commercial_write();
create trigger activity_assignment_notes_commercial_gate before insert or update or delete on activity_assignment_notes for each row execute function app.enforce_commercial_write();
create trigger activity_assignments_commercial_gate before insert or update or delete on activity_assignments for each row execute function app.enforce_commercial_write();
create trigger activity_plan_items_commercial_gate before insert or update or delete on activity_plan_items for each row execute function app.enforce_commercial_write();
create trigger activity_position_requirements_commercial_gate before insert or update or delete on activity_position_requirements for each row execute function app.enforce_commercial_write();
create trigger activity_positions_commercial_gate before insert or update or delete on activity_positions for each row execute function app.enforce_commercial_write();
create trigger activity_series_commercial_gate before insert or update or delete on activity_series for each row execute function app.enforce_commercial_write();
create trigger activity_service_areas_commercial_gate before insert or update or delete on activity_service_areas for each row execute function app.enforce_commercial_write();
create trigger activity_substitution_requests_commercial_gate before insert or update or delete on activity_substitution_requests for each row execute function app.enforce_commercial_write();
create trigger activity_template_areas_commercial_gate before insert or update or delete on activity_template_areas for each row execute function app.enforce_commercial_write();
create trigger activity_template_plan_items_commercial_gate before insert or update or delete on activity_template_plan_items for each row execute function app.enforce_commercial_write();
create trigger activity_template_positions_commercial_gate before insert or update or delete on activity_template_positions for each row execute function app.enforce_commercial_write();
create trigger activity_templates_commercial_gate before insert or update or delete on activity_templates for each row execute function app.enforce_commercial_write();
create trigger campuses_commercial_gate before insert or update or delete on campuses for each row execute function app.enforce_commercial_write();
create trigger church_people_commercial_gate before insert or update or delete on church_people for each row execute function app.enforce_commercial_write();
create trigger church_people_roles_commercial_gate before insert or update or delete on church_people_roles for each row execute function app.enforce_commercial_write();
create trigger communication_category_preferences_commercial_gate before insert or update or delete on communication_category_preferences for each row execute function app.enforce_commercial_write();
create trigger communication_recipients_commercial_gate before insert or update or delete on communication_recipients for each row execute function app.enforce_commercial_write();
create trigger communication_segments_commercial_gate before insert or update or delete on communication_segments for each row execute function app.enforce_commercial_write();
create trigger communication_templates_commercial_gate before insert or update or delete on communication_templates for each row execute function app.enforce_commercial_write();
create trigger communications_commercial_gate before insert or update or delete on communications for each row execute function app.enforce_commercial_write();
create trigger consent_definitions_commercial_gate before insert or update or delete on consent_definitions for each row execute function app.enforce_commercial_write();
create trigger consent_records_commercial_gate before insert or update or delete on consent_records for each row execute function app.enforce_commercial_write();
create trigger course_cohorts_commercial_gate before insert or update or delete on course_cohorts for each row execute function app.enforce_commercial_write();
create trigger course_enrollments_commercial_gate before insert or update or delete on course_enrollments for each row execute function app.enforce_commercial_write();
create trigger course_session_attendance_commercial_gate before insert or update or delete on course_session_attendance for each row execute function app.enforce_commercial_write();
create trigger course_sessions_commercial_gate before insert or update or delete on course_sessions for each row execute function app.enforce_commercial_write();
create trigger courses_commercial_gate before insert or update or delete on courses for each row execute function app.enforce_commercial_write();
create trigger credential_types_commercial_gate before insert or update or delete on credential_types for each row execute function app.enforce_commercial_write();
create trigger custom_field_definitions_commercial_gate before insert or update or delete on custom_field_definitions for each row execute function app.enforce_commercial_write();
create trigger custom_field_values_commercial_gate before insert or update or delete on custom_field_values for each row execute function app.enforce_commercial_write();
create trigger events_commercial_gate before insert or update or delete on events for each row execute function app.enforce_commercial_write();
create trigger files_commercial_gate before insert or update or delete on files for each row execute function app.enforce_commercial_write();
create trigger form_fields_commercial_gate before insert or update or delete on form_fields for each row execute function app.enforce_commercial_write();
create trigger form_submission_answers_commercial_gate before insert or update or delete on form_submission_answers for each row execute function app.enforce_commercial_write();
create trigger form_submissions_commercial_gate before insert or update or delete on form_submissions for each row execute function app.enforce_commercial_write();
create trigger forms_commercial_gate before insert or update or delete on forms for each row execute function app.enforce_commercial_write();
create trigger giving_campaigns_commercial_gate before insert or update or delete on giving_campaigns for each row execute function app.enforce_commercial_write();
create trigger giving_contributions_commercial_gate before insert or update or delete on giving_contributions for each row execute function app.enforce_commercial_write();
create trigger giving_funds_commercial_gate before insert or update or delete on giving_funds for each row execute function app.enforce_commercial_write();
create trigger giving_reconciliations_commercial_gate before insert or update or delete on giving_reconciliations for each row execute function app.enforce_commercial_write();
create trigger giving_recurring_plans_commercial_gate before insert or update or delete on giving_recurring_plans for each row execute function app.enforce_commercial_write();
create trigger giving_refunds_commercial_gate before insert or update or delete on giving_refunds for each row execute function app.enforce_commercial_write();
create trigger group_attendance_commercial_gate before insert or update or delete on group_attendance for each row execute function app.enforce_commercial_write();
create trigger group_join_requests_commercial_gate before insert or update or delete on group_join_requests for each row execute function app.enforce_commercial_write();
create trigger group_leaders_commercial_gate before insert or update or delete on group_leaders for each row execute function app.enforce_commercial_write();
create trigger group_meetings_commercial_gate before insert or update or delete on group_meetings for each row execute function app.enforce_commercial_write();
create trigger group_members_commercial_gate before insert or update or delete on group_members for each row execute function app.enforce_commercial_write();
create trigger group_types_commercial_gate before insert or update or delete on group_types for each row execute function app.enforce_commercial_write();
create trigger groups_commercial_gate before insert or update or delete on groups for each row execute function app.enforce_commercial_write();
create trigger household_members_commercial_gate before insert or update or delete on household_members for each row execute function app.enforce_commercial_write();
create trigger households_commercial_gate before insert or update or delete on households for each row execute function app.enforce_commercial_write();
create trigger invitations_commercial_gate before insert or update or delete on invitations for each row execute function app.enforce_commercial_write();
create trigger kid_checkins_commercial_gate before insert or update or delete on kid_checkins for each row execute function app.enforce_commercial_write();
create trigger kid_guardians_commercial_gate before insert or update or delete on kid_guardians for each row execute function app.enforce_commercial_write();
create trigger kid_pickup_authorizations_commercial_gate before insert or update or delete on kid_pickup_authorizations for each row execute function app.enforce_commercial_write();
create trigger kid_pickup_overrides_commercial_gate before insert or update or delete on kid_pickup_overrides for each row execute function app.enforce_commercial_write();
create trigger kids_incidents_commercial_gate before insert or update or delete on kids_incidents for each row execute function app.enforce_commercial_write();
create trigger kids_profiles_commercial_gate before insert or update or delete on kids_profiles for each row execute function app.enforce_commercial_write();
create trigger kids_required_credentials_commercial_gate before insert or update or delete on kids_required_credentials for each row execute function app.enforce_commercial_write();
create trigger kids_rooms_commercial_gate before insert or update or delete on kids_rooms for each row execute function app.enforce_commercial_write();
create trigger kids_sensitive_notes_commercial_gate before insert or update or delete on kids_sensitive_notes for each row execute function app.enforce_commercial_write();
create trigger kids_session_staff_commercial_gate before insert or update or delete on kids_session_staff for each row execute function app.enforce_commercial_write();
create trigger kids_sessions_commercial_gate before insert or update or delete on kids_sessions for each row execute function app.enforce_commercial_write();
create trigger learning_paths_commercial_gate before insert or update or delete on learning_paths for each row execute function app.enforce_commercial_write();
create trigger notification_preferences_commercial_gate before insert or update or delete on notification_preferences for each row execute function app.enforce_commercial_write();
create trigger path_steps_commercial_gate before insert or update or delete on path_steps for each row execute function app.enforce_commercial_write();
create trigger person_credentials_commercial_gate before insert or update or delete on person_credentials for each row execute function app.enforce_commercial_write();
create trigger person_path_progress_commercial_gate before insert or update or delete on person_path_progress for each row execute function app.enforce_commercial_write();
create trigger person_qualifications_commercial_gate before insert or update or delete on person_qualifications for each row execute function app.enforce_commercial_write();
create trigger person_serving_preferences_commercial_gate before insert or update or delete on person_serving_preferences for each row execute function app.enforce_commercial_write();
create trigger person_tags_commercial_gate before insert or update or delete on person_tags for each row execute function app.enforce_commercial_write();
create trigger person_unavailability_periods_commercial_gate before insert or update or delete on person_unavailability_periods for each row execute function app.enforce_commercial_write();
create trigger person_unavailability_weekly_commercial_gate before insert or update or delete on person_unavailability_weekly for each row execute function app.enforce_commercial_write();
create trigger position_requirements_commercial_gate before insert or update or delete on position_requirements for each row execute function app.enforce_commercial_write();
create trigger qualifications_commercial_gate before insert or update or delete on qualifications for each row execute function app.enforce_commercial_write();
create trigger registration_attendees_commercial_gate before insert or update or delete on registration_attendees for each row execute function app.enforce_commercial_write();
create trigger registrations_commercial_gate before insert or update or delete on registrations for each row execute function app.enforce_commercial_write();
create trigger resource_maintenance_commercial_gate before insert or update or delete on resource_maintenance for each row execute function app.enforce_commercial_write();
create trigger resource_occupancy_commercial_gate before insert or update or delete on resource_occupancy for each row execute function app.enforce_commercial_write();
create trigger resource_reservations_commercial_gate before insert or update or delete on resource_reservations for each row execute function app.enforce_commercial_write();
create trigger resources_commercial_gate before insert or update or delete on resources for each row execute function app.enforce_commercial_write();
create trigger service_area_leaders_commercial_gate before insert or update or delete on service_area_leaders for each row execute function app.enforce_commercial_write();
create trigger service_area_members_commercial_gate before insert or update or delete on service_area_members for each row execute function app.enforce_commercial_write();
create trigger service_areas_commercial_gate before insert or update or delete on service_areas for each row execute function app.enforce_commercial_write();
create trigger service_positions_commercial_gate before insert or update or delete on service_positions for each row execute function app.enforce_commercial_write();
create trigger service_team_members_commercial_gate before insert or update or delete on service_team_members for each row execute function app.enforce_commercial_write();
create trigger service_teams_commercial_gate before insert or update or delete on service_teams for each row execute function app.enforce_commercial_write();
create trigger tags_commercial_gate before insert or update or delete on tags for each row execute function app.enforce_commercial_write();
create trigger webhook_endpoints_outbound_commercial_gate before insert or update or delete on webhook_endpoints_outbound for each row execute function app.enforce_commercial_write();
create trigger worship_repertoire_songs_commercial_gate before insert or update or delete on worship_repertoire_songs for each row execute function app.enforce_commercial_write();
create trigger worship_repertoires_commercial_gate before insert or update or delete on worship_repertoires for each row execute function app.enforce_commercial_write();
create trigger worship_songs_commercial_gate before insert or update or delete on worship_songs for each row execute function app.enforce_commercial_write();
