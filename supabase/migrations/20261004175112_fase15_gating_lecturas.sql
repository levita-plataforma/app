-- Fase 15 · A2: gating de lectura por estado comercial.
--
-- Mantiene la pertenencia intacta: app.church_ids_for_user() no cambia. Cada
-- política de negocio exige, además de la pertenencia que ya tenía, que la
-- iglesia esté en full o grace (app.readable_church_ids). Las políticas de
-- historial y exportaciones solo se cierran en security_blocked, y el resto de
-- la superficie de recuperación va por RPC (app.get_church_recovery_context).
--
-- No cambia escrituras: la guardia de A1 (triggers) sigue siendo la barrera de
-- escritura. Para deshacer: volver a ejecutar las políticas anteriores de
-- pg_policies (ver docs/FASE-15-GESTION-COMERCIAL.md, sección A2).

-- 1. Helpers ------------------------------------------------------------------

-- Pertenencia AND acceso comercial de lectura. Para RPC de un solo church_id.
create or replace function app.can_read_church(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_church_id = any (app.church_ids_for_user())
     and app.church_access_mode(p_church_id) in ('full', 'grace');
$$;

-- Lista de iglesias legibles del usuario. Para políticas: se evalúa una vez por
-- sentencia (subconsulta sin correlación), no una vez por fila.
create or replace function app.readable_church_ids()
returns uuid[]
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(array_agg(m.church_id), '{}'::uuid[])
  from unnest(app.church_ids_for_user()) as m(church_id)
  where app.church_access_mode(m.church_id) in ('full', 'grace');
$$;

-- Iglesias de la membresía que no están en security_blocked: para historial y
-- exportaciones, que se leen en el resto de estados no operativos. Es un array
-- para la política (una evaluación por sentencia), igual que readable_church_ids.
create or replace function app.church_ids_without_security_block()
returns uuid[]
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(array_agg(m.church_id), '{}'::uuid[])
  from unnest(app.church_ids_for_user()) as m(church_id)
  where app.church_access_mode(m.church_id) <> 'security_blocked';
$$;

-- Guardia para RPC que devuelven datos de negocio.
create or replace function app.assert_can_read_church(p_church_id uuid)
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

  raise exception 'La iglesia no permite consultar sus datos en este momento.'
    using errcode = '42501',
          detail = case v_mode
            when 'trial_expired' then 'CHURCH_TRIAL_EXPIRED'
            when 'suspended' then 'CHURCH_SUSPENDED'
            when 'cancelled' then 'CHURCH_CANCELLED'
            when 'security_blocked' then 'CHURCH_SECURITY_BLOCKED'
            else 'CHURCH_NOT_FOUND'
          end;
end;
$$;

revoke all on function app.can_read_church(uuid) from public, anon;
revoke all on function app.readable_church_ids() from public, anon;
revoke all on function app.assert_can_read_church(uuid) from public, anon;
grant execute on function app.can_read_church(uuid) to authenticated, service_role;
grant execute on function app.readable_church_ids() to authenticated, service_role;
revoke all on function app.church_ids_without_security_block() from public, anon;
grant execute on function app.church_ids_without_security_block() to authenticated, service_role;

-- 2. Políticas de lectura -------------------------------------------------------
-- Generadas desde el estado real de pg_policies. Cada ALTER añade una condición
-- a la política existente; no sustituye ni elimina ninguna.

alter policy "activities_select" on public."activities"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND app.can_read_activity_row(id, church_id, campus_id, status, visibility, organizer_person_id))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "activity_admin_notes_select" on public."activity_admin_notes"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND app.can_read_activity_admin_notes(activity_id))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "activity_assignment_notes_select" on public."activity_assignment_notes"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (person_id IN ( SELECT app.current_person_ids() AS current_person_ids)))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "activity_assignments_select" on public."activity_assignments"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND app.can_read_assignment_row(church_id, activity_id, service_area_id, person_id, status, sent_at, response_source))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "activity_plan_items_select" on public."activity_plan_items"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND app.can_read_activity(activity_id))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "activity_position_requirements_select" on public."activity_position_requirements"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND app.can_read_activity(activity_id))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "activity_positions_select" on public."activity_positions"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND app.can_read_activity(activity_id))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "activity_series_select" on public."activity_series"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (( SELECT app.has_capability(activity_series.church_id, 'activity.read'::text) AS has_capability) OR (EXISTS ( SELECT 1
   FROM activities a
  WHERE (a.series_id = activity_series.id)))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "activity_service_areas_select" on public."activity_service_areas"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND app.can_read_activity(activity_id))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "activity_substitution_requests_select" on public."activity_substitution_requests"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (EXISTS ( SELECT 1
   FROM (activity_assignments aa
     JOIN activities a ON ((a.id = aa.activity_id)))
  WHERE ((aa.id = activity_substitution_requests.original_assignment_id) AND (((aa.person_id IN ( SELECT app.current_person_ids() AS current_person_ids)) AND (aa.status <> 'proposed'::activity_assignment_status) AND ((aa.sent_at IS NOT NULL) OR (aa.response_source IS NOT NULL))) OR app.assignment_manage_cap(aa.church_id, a.campus_id, aa.activity_id, aa.service_area_id))))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "audit_logs_select" on public."audit_logs"
  using ((((church_id IS NOT NULL) AND ( SELECT app.has_capability(audit_logs.church_id, 'audit.read'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "campuses_select" on public."campuses"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "campuses_manage" on public."campuses"
  using ((( SELECT app.has_capability(campuses.church_id, 'church.settings.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "church_people_select" on public."church_people"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "church_people_manage" on public."church_people"
  using ((( SELECT app.has_capability(church_people.church_id, 'people.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "church_people_roles_select" on public."church_people_roles"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "church_people_roles_manage" on public."church_people_roles"
  using ((( SELECT app.has_capability(church_people_roles.church_id, 'roles.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "communication_category_preferences_select_own" on public."communication_category_preferences"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (person_id IN ( SELECT app.current_person_ids() AS current_person_ids)))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "communication_segments_select" on public."communication_segments"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ( SELECT app.has_capability(communication_segments.church_id, 'communications.read'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "communication_templates_select" on public."communication_templates"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ( SELECT app.has_capability(communication_templates.church_id, 'communications.read'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "communications_select" on public."communications"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ( SELECT app.has_capability(communications.church_id, 'communications.read'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "consent_definitions_select" on public."consent_definitions"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "consent_definitions_manage" on public."consent_definitions"
  using ((( SELECT app.has_capability(consent_definitions.church_id, 'form.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "consent_records_select" on public."consent_records"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ((person_id IN ( SELECT app.current_person_ids() AS current_person_ids)) OR (EXISTS ( SELECT 1
   FROM ((registrations r
     JOIN events e ON ((e.id = r.event_id)))
     JOIN activities a ON (((a.id = e.activity_id) AND (a.church_id = e.church_id))))
  WHERE ((r.id = consent_records.registration_id) AND app.event_cap(e.church_id, a.campus_id, a.id, 'event.registration.manage'::text))))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "consent_records_manage" on public."consent_records"
  using ((( SELECT app.has_capability(consent_records.church_id, 'form.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "course_cohorts_select" on public."course_cohorts"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (app.cohort_cap(id, 'course.manage'::text) OR (EXISTS ( SELECT 1
   FROM course_enrollments e
  WHERE ((e.cohort_id = course_cohorts.id) AND (e.person_id IN ( SELECT app.current_person_ids() AS current_person_ids))))) OR (app.cohort_cap(id, 'course.read'::text) AND (archived_at IS NULL) AND (status <> 'cancelled'::course_cohort_status) AND (EXISTS ( SELECT 1
   FROM courses c
  WHERE ((c.id = course_cohorts.course_id) AND (c.status = 'active'::course_status) AND (c.archived_at IS NULL)))))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "course_enrollments_select" on public."course_enrollments"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ((person_id IN ( SELECT app.current_person_ids() AS current_person_ids)) OR app.cohort_cap(cohort_id, 'course.enrollment.manage'::text) OR app.cohort_cap(cohort_id, 'course.manage'::text)))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "course_session_attendance_select" on public."course_session_attendance"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ((person_id IN ( SELECT app.current_person_ids() AS current_person_ids)) OR (EXISTS ( SELECT 1
   FROM course_sessions s
  WHERE ((s.id = course_session_attendance.course_session_id) AND (app.cohort_cap(s.cohort_id, 'course.attendance.manage'::text) OR app.cohort_cap(s.cohort_id, 'course.manage'::text)))))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "course_sessions_select" on public."course_sessions"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (app.cohort_cap(cohort_id, 'course.manage'::text) OR (EXISTS ( SELECT 1
   FROM course_enrollments e
  WHERE ((e.cohort_id = course_sessions.cohort_id) AND (e.person_id IN ( SELECT app.current_person_ids() AS current_person_ids)) AND (e.status = ANY (ARRAY['enrolled'::course_enrollment_status, 'completed'::course_enrollment_status]))))) OR (app.cohort_cap(cohort_id, 'course.read'::text) AND (EXISTS ( SELECT 1
   FROM course_cohorts cc
  WHERE (cc.id = course_sessions.cohort_id))))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "courses_select" on public."courses"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (((status = 'active'::course_status) AND (archived_at IS NULL) AND app.course_cap(church_id, 'course.read'::text)) OR app.course_cap(church_id, 'course.manage'::text)))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "credential_types_select" on public."credential_types"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ( SELECT app.has_capability(credential_types.church_id, 'credential.read'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "credential_types_manage" on public."credential_types"
  using ((( SELECT app.has_capability(credential_types.church_id, 'credential.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "custom_field_definitions_select" on public."custom_field_definitions"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "custom_field_definitions_manage" on public."custom_field_definitions"
  using ((( SELECT app.has_capability(custom_field_definitions.church_id, 'church.settings.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "custom_field_values_select" on public."custom_field_values"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "custom_field_values_manage" on public."custom_field_values"
  using ((( SELECT app.has_capability(custom_field_values.church_id, 'people.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "events_select_authenticated" on public."events"
  using ((app.can_read_event(id)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "events_manage" on public."events"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (EXISTS ( SELECT 1
   FROM activities a
  WHERE ((a.id = events.activity_id) AND (a.church_id = events.church_id) AND app.event_cap(events.church_id, a.campus_id, a.id, 'event.manage'::text)))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "files_select_internal_or_own" on public."files"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ((classification = ANY (ARRAY['public'::file_classification, 'internal'::file_classification])) OR (owner_person_id IN ( SELECT app.current_person_ids() AS current_person_ids)) OR ( SELECT app.has_capability(files.church_id, 'people.manage'::text) AS has_capability)))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "files_manage_own_or_capability" on public."files"
  using ((((owner_person_id IN ( SELECT app.current_person_ids() AS current_person_ids)) OR ( SELECT app.has_capability(files.church_id, 'people.manage'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "form_fields_select" on public."form_fields"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (((classification = ANY (ARRAY['normal'::form_field_classification, 'personal'::form_field_classification])) AND ( SELECT app.has_capability(form_fields.church_id, 'form.read'::text) AS has_capability)) OR ( SELECT app.has_capability(form_fields.church_id, 'form.sensitive.manage'::text) AS has_capability)))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "form_fields_manage" on public."form_fields"
  using ((
CASE
    WHEN (classification = ANY (ARRAY['sensitive'::form_field_classification, 'restricted'::form_field_classification])) THEN ( SELECT app.has_capability(form_fields.church_id, 'form.sensitive.manage'::text) AS has_capability)
    ELSE ( SELECT app.has_capability(form_fields.church_id, 'form.manage'::text) AS has_capability)
END) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "form_submission_answers_select" on public."form_submission_answers"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (((classification = ANY (ARRAY['normal'::form_field_classification, 'personal'::form_field_classification])) AND (EXISTS ( SELECT 1
   FROM form_submissions fs
  WHERE ((fs.id = form_submission_answers.submission_id) AND (( SELECT app.has_capability(fs.church_id, 'form.read'::text) AS has_capability) OR ((fs.event_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM (events e
             JOIN activities a ON (((a.id = e.activity_id) AND (a.church_id = e.church_id))))
          WHERE ((e.id = fs.event_id) AND app.event_cap(e.church_id, a.campus_id, a.id, 'event.registration.manage'::text)))))))))) OR ( SELECT app.has_capability(form_submission_answers.church_id, 'form.sensitive.manage'::text) AS has_capability)))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "form_submission_answers_manage" on public."form_submission_answers"
  using ((( SELECT app.has_capability(form_submission_answers.church_id, 'form.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "form_submissions_manage" on public."form_submissions"
  using ((( SELECT app.has_capability(form_submissions.church_id, 'form.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "form_submissions_select" on public."form_submissions"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (( SELECT app.has_capability(form_submissions.church_id, 'form.read'::text) AS has_capability) OR ((event_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (events e
     JOIN activities a ON (((a.id = e.activity_id) AND (a.church_id = e.church_id))))
  WHERE ((e.id = form_submissions.event_id) AND app.event_cap(e.church_id, a.campus_id, a.id, 'event.registration.manage'::text)))))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "forms_select" on public."forms"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ( SELECT app.has_capability(forms.church_id, 'form.read'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "forms_manage" on public."forms"
  using ((( SELECT app.has_capability(forms.church_id, 'form.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "giving_campaigns_select" on public."giving_campaigns"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (( SELECT app.has_capability(giving_campaigns.church_id, 'giving.read_summary'::text) AS has_capability) OR ( SELECT app.has_capability(giving_campaigns.church_id, 'giving.read_contributions'::text) AS has_capability) OR ( SELECT app.has_capability(giving_campaigns.church_id, 'giving.manage_campaigns'::text) AS has_capability)))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "giving_contributions_select" on public."giving_contributions"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ( SELECT app.has_capability(giving_contributions.church_id, 'giving.read_contributions'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "giving_funds_select" on public."giving_funds"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (( SELECT app.has_capability(giving_funds.church_id, 'giving.read_summary'::text) AS has_capability) OR ( SELECT app.has_capability(giving_funds.church_id, 'giving.read_contributions'::text) AS has_capability) OR ( SELECT app.has_capability(giving_funds.church_id, 'giving.manage_funds'::text) AS has_capability)))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "giving_reconciliations_select" on public."giving_reconciliations"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ( SELECT app.has_capability(giving_reconciliations.church_id, 'giving.read_contributions'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "giving_recurring_plans_select" on public."giving_recurring_plans"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ( SELECT app.has_capability(giving_recurring_plans.church_id, 'giving.read_contributions'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "giving_refunds_select" on public."giving_refunds"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ( SELECT app.has_capability(giving_refunds.church_id, 'giving.read_contributions'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "group_attendance_select" on public."group_attendance"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ((person_id IN ( SELECT app.current_person_ids() AS current_person_ids)) OR (EXISTS ( SELECT 1
   FROM group_meetings m
  WHERE ((m.id = group_attendance.group_meeting_id) AND (app.group_cap_by_id(m.group_id, 'group.attendance.manage'::text) OR app.is_group_leader(m.group_id)))))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "group_join_requests_select" on public."group_join_requests"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ((person_id IN ( SELECT app.current_person_ids() AS current_person_ids)) OR app.group_cap_by_id(group_id, 'group.request.manage'::text) OR app.is_group_leader(group_id)))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "group_types_select" on public."group_types"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "groups_select" on public."groups"
  using ((app.can_read_group(id)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "group_members_select" on public."group_members"
  using ((((person_id IN ( SELECT app.current_person_ids() AS current_person_ids)) OR app.can_read_group_roster(group_id))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "group_leaders_select" on public."group_leaders"
  using ((app.can_read_group_roster(group_id)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "group_meetings_select" on public."group_meetings"
  using ((app.can_read_group_roster(group_id)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "household_members_select" on public."household_members"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "household_members_manage" on public."household_members"
  using ((( SELECT app.has_capability(household_members.church_id, 'people.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "households_select" on public."households"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "households_manage" on public."households"
  using ((( SELECT app.has_capability(households.church_id, 'people.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "import_jobs_select" on public."import_jobs"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "import_jobs_manage" on public."import_jobs"
  using ((( SELECT app.has_capability(import_jobs.church_id, 'people.import'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "invitations_select" on public."invitations"
  using ((( SELECT app.has_capability(invitations.church_id, 'roles.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "invitations_manage" on public."invitations"
  using ((( SELECT app.has_capability(invitations.church_id, 'roles.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "kid_checkins_select" on public."kid_checkins"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (( SELECT app.has_capability(kid_checkins.church_id, 'kids.read'::text) AS has_capability) OR (EXISTS ( SELECT 1
   FROM (kids_sessions ks
     JOIN activities a ON (((a.id = ks.activity_id) AND (a.church_id = ks.church_id))))
  WHERE ((ks.id = kid_checkins.session_id) AND app.kids_cap(ks.church_id, a.campus_id, a.id, 'kids.checkin'::text))))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "kid_guardians_select" on public."kid_guardians"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (( SELECT app.has_capability(kid_guardians.church_id, 'kids.read'::text) AS has_capability) OR (guardian_person_id IN ( SELECT app.current_person_ids() AS current_person_ids))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "kid_guardians_manage" on public."kid_guardians"
  using ((( SELECT app.has_capability(kid_guardians.church_id, 'kids.guardians.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "kid_pickup_authorizations_select" on public."kid_pickup_authorizations"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ( SELECT app.has_capability(kid_pickup_authorizations.church_id, 'kids.pickup.manage'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "kid_pickup_authorizations_manage" on public."kid_pickup_authorizations"
  using ((( SELECT app.has_capability(kid_pickup_authorizations.church_id, 'kids.pickup.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "kid_pickup_overrides_select" on public."kid_pickup_overrides"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ( SELECT app.has_capability(kid_pickup_overrides.church_id, 'kids.pickup.manage'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "kids_incidents_select" on public."kids_incidents"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ( SELECT app.has_capability(kids_incidents.church_id, 'kids.incident.read'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "kids_incidents_manage" on public."kids_incidents"
  using ((( SELECT app.has_capability(kids_incidents.church_id, 'kids.incident.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "kids_profiles_select" on public."kids_profiles"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ( SELECT app.has_capability(kids_profiles.church_id, 'kids.read'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "kids_profiles_manage" on public."kids_profiles"
  using ((( SELECT app.has_capability(kids_profiles.church_id, 'kids.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "kids_required_credentials_select" on public."kids_required_credentials"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ( SELECT app.has_capability(kids_required_credentials.church_id, 'kids.read'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "kids_required_credentials_manage" on public."kids_required_credentials"
  using ((( SELECT app.has_capability(kids_required_credentials.church_id, 'kids.room.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "kids_rooms_select" on public."kids_rooms"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ( SELECT app.has_capability(kids_rooms.church_id, 'kids.read'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "kids_rooms_manage" on public."kids_rooms"
  using ((( SELECT app.has_capability(kids_rooms.church_id, 'kids.room.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "kids_sensitive_notes_select" on public."kids_sensitive_notes"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ( SELECT app.has_capability(kids_sensitive_notes.church_id, 'kids.sensitive.read'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "kids_session_staff_select" on public."kids_session_staff"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (( SELECT app.has_capability(kids_session_staff.church_id, 'kids.read'::text) AS has_capability) OR (person_id IN ( SELECT app.current_person_ids() AS current_person_ids)) OR (EXISTS ( SELECT 1
   FROM (kids_sessions ks
     JOIN activities a ON (((a.id = ks.activity_id) AND (a.church_id = ks.church_id))))
  WHERE ((ks.id = kids_session_staff.session_id) AND app.kids_cap(ks.church_id, a.campus_id, a.id, 'kids.session.manage'::text))))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "kids_sessions_manage" on public."kids_sessions"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (EXISTS ( SELECT 1
   FROM activities a
  WHERE ((a.id = kids_sessions.activity_id) AND (a.church_id = kids_sessions.church_id) AND app.kids_cap(kids_sessions.church_id, a.campus_id, a.id, 'kids.session.manage'::text)))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "kids_sessions_select" on public."kids_sessions"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (EXISTS ( SELECT 1
   FROM activities a
  WHERE ((a.id = kids_sessions.activity_id) AND (a.church_id = kids_sessions.church_id) AND (app.kids_cap(kids_sessions.church_id, a.campus_id, a.id, 'kids.read'::text) OR app.kids_cap(kids_sessions.church_id, a.campus_id, a.id, 'kids.session.manage'::text) OR app.kids_cap(kids_sessions.church_id, a.campus_id, a.id, 'kids.checkin'::text) OR app.kids_cap(kids_sessions.church_id, a.campus_id, a.id, 'kids.checkout'::text))))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "learning_paths_select" on public."learning_paths"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (((status = 'active'::learning_path_status) AND (archived_at IS NULL) AND app.course_cap(church_id, 'path.read'::text)) OR app.course_cap(church_id, 'path.manage'::text)))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "notifications_select_own" on public."notifications"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (person_id IN ( SELECT app.current_person_ids() AS current_person_ids)))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "path_steps_select" on public."path_steps"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (app.course_cap(church_id, 'path.manage'::text) OR ((archived_at IS NULL) AND app.course_cap(church_id, 'path.read'::text)) OR (EXISTS ( SELECT 1
   FROM person_path_progress pp
  WHERE ((pp.path_step_id = path_steps.id) AND (pp.person_id IN ( SELECT app.current_person_ids() AS current_person_ids)))))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "person_credentials_select" on public."person_credentials"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (( SELECT app.has_capability(person_credentials.church_id, 'credential.sensitive.read'::text) AS has_capability) OR (( SELECT app.has_capability(person_credentials.church_id, 'credential.read'::text) AS has_capability) AND (NOT (EXISTS ( SELECT 1
   FROM credential_types ct
  WHERE ((ct.id = person_credentials.credential_type_id) AND ct.sensitive)))))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "person_credentials_manage" on public."person_credentials"
  using ((( SELECT app.has_capability(person_credentials.church_id, 'credential.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "person_path_progress_select" on public."person_path_progress"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ((person_id IN ( SELECT app.current_person_ids() AS current_person_ids)) OR app.course_cap(church_id, 'path.progress.manage'::text) OR app.course_cap(church_id, 'path.manage'::text)))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "person_qualifications_select" on public."person_qualifications"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "person_qualifications_manage" on public."person_qualifications"
  using ((( SELECT app.has_capability(person_qualifications.church_id, 'qualification.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "person_serving_preferences_select_own" on public."person_serving_preferences"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (person_id IN ( SELECT app.current_person_ids() AS current_person_ids)))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "person_tags_select" on public."person_tags"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "person_tags_manage" on public."person_tags"
  using ((( SELECT app.has_capability(person_tags.church_id, 'people.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "person_unavailability_periods_select_own" on public."person_unavailability_periods"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (person_id IN ( SELECT app.current_person_ids() AS current_person_ids)))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "person_unavailability_weekly_select_own" on public."person_unavailability_weekly"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (person_id IN ( SELECT app.current_person_ids() AS current_person_ids)))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "position_requirements_select" on public."position_requirements"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "position_requirements_manage" on public."position_requirements"
  using (((( SELECT app.has_capability(position_requirements.church_id, 'service_positions.manage'::text) AS has_capability) OR (church_id IN ( SELECT sp.church_id
   FROM service_positions sp
  WHERE ((sp.id = position_requirements.service_position_id) AND ( SELECT app.has_capability(sp.church_id, 'service_positions.manage'::text, 'service_area'::text, sp.service_area_id) AS has_capability)))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "qualifications_select" on public."qualifications"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "qualifications_manage" on public."qualifications"
  using ((( SELECT app.has_capability(qualifications.church_id, 'qualification.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "registration_attendees_select" on public."registration_attendees"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ((EXISTS ( SELECT 1
   FROM registrations r
  WHERE ((r.id = registration_attendees.registration_id) AND (r.primary_person_id IN ( SELECT app.current_person_ids() AS current_person_ids))))) OR (EXISTS ( SELECT 1
   FROM (events e
     JOIN activities a ON (((a.id = e.activity_id) AND (a.church_id = e.church_id))))
  WHERE ((e.id = registration_attendees.event_id) AND app.event_cap(e.church_id, a.campus_id, a.id, 'event.registration.manage'::text))))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "registration_attendees_manage" on public."registration_attendees"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (EXISTS ( SELECT 1
   FROM (events e
     JOIN activities a ON (((a.id = e.activity_id) AND (a.church_id = e.church_id))))
  WHERE ((e.id = registration_attendees.event_id) AND (app.event_cap(e.church_id, a.campus_id, a.id, 'event.registration.manage'::text) OR app.event_cap(e.church_id, a.campus_id, a.id, 'event.checkin'::text))))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "registrations_select" on public."registrations"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ((primary_person_id IN ( SELECT app.current_person_ids() AS current_person_ids)) OR (EXISTS ( SELECT 1
   FROM (events e
     JOIN activities a ON (((a.id = e.activity_id) AND (a.church_id = e.church_id))))
  WHERE ((e.id = registrations.event_id) AND app.event_cap(e.church_id, a.campus_id, a.id, 'event.registration.manage'::text))))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "registrations_manage" on public."registrations"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND (EXISTS ( SELECT 1
   FROM (events e
     JOIN activities a ON (((a.id = e.activity_id) AND (a.church_id = e.church_id))))
  WHERE ((e.id = registrations.event_id) AND app.event_cap(e.church_id, a.campus_id, a.id, 'event.registration.manage'::text)))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "resource_maintenance_select" on public."resource_maintenance"
  using ((app.can_read_facilities(church_id)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "resource_occupancy_select" on public."resource_occupancy"
  using ((app.can_read_facilities(church_id)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "resource_reservations_select" on public."resource_reservations"
  using ((app.can_read_facilities(church_id)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "resources_select" on public."resources"
  using ((app.can_read_facilities(church_id)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "service_area_leaders_select" on public."service_area_leaders"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "service_area_leaders_manage" on public."service_area_leaders"
  using (((( SELECT app.has_capability(service_area_leaders.church_id, 'service_area.leaders.manage'::text) AS has_capability) OR ( SELECT app.has_capability(service_area_leaders.church_id, 'service_area.leaders.manage'::text, 'service_area'::text, service_area_leaders.service_area_id) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "service_area_members_select" on public."service_area_members"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "service_area_members_manage" on public."service_area_members"
  using (((( SELECT app.has_capability(service_area_members.church_id, 'service_members.manage'::text) AS has_capability) OR ( SELECT app.has_capability(service_area_members.church_id, 'service_members.manage'::text, 'service_area'::text, service_area_members.service_area_id) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "service_areas_select" on public."service_areas"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "service_areas_manage" on public."service_areas"
  using (((( SELECT app.has_capability(service_areas.church_id, 'service_area.manage'::text) AS has_capability) OR ( SELECT app.has_capability(service_areas.church_id, 'service_area.manage'::text, 'service_area'::text, service_areas.id) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "service_positions_select" on public."service_positions"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "service_positions_manage" on public."service_positions"
  using (((( SELECT app.has_capability(service_positions.church_id, 'service_positions.manage'::text) AS has_capability) OR ( SELECT app.has_capability(service_positions.church_id, 'service_positions.manage'::text, 'service_area'::text, service_positions.service_area_id) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "service_team_members_select" on public."service_team_members"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "service_team_members_manage" on public."service_team_members"
  using (((( SELECT app.has_capability(service_team_members.church_id, 'service_teams.manage'::text) AS has_capability) OR (church_id IN ( SELECT st.church_id
   FROM service_teams st
  WHERE ((st.id = service_team_members.service_team_id) AND ( SELECT app.has_capability(st.church_id, 'service_teams.manage'::text, 'service_area'::text, st.service_area_id) AS has_capability)))))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "service_teams_select" on public."service_teams"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "service_teams_manage" on public."service_teams"
  using (((( SELECT app.has_capability(service_teams.church_id, 'service_teams.manage'::text) AS has_capability) OR ( SELECT app.has_capability(service_teams.church_id, 'service_teams.manage'::text, 'service_area'::text, service_teams.service_area_id) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "tags_select" on public."tags"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "tags_manage" on public."tags"
  using ((( SELECT app.has_capability(tags.church_id, 'people.manage'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "worship_repertoire_songs_select" on public."worship_repertoire_songs"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ( SELECT app.has_capability(worship_repertoire_songs.church_id, 'worship.repertoire.read'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "worship_repertoires_select" on public."worship_repertoires"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ( SELECT app.has_capability(worship_repertoires.church_id, 'worship.repertoire.read'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "worship_songs_select" on public."worship_songs"
  using ((((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])) AND ( SELECT app.has_capability(worship_songs.church_id, 'worship.song.read'::text) AS has_capability))) AND (church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "people_select" on public."people"
  using ((((id IN ( SELECT app.current_person_ids() AS current_person_ids)) OR (id IN ( SELECT cp.person_id
   FROM church_people cp
  WHERE (cp.church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[])))))) AND EXISTS (SELECT 1 FROM church_people cp WHERE cp.person_id = people.id AND cp.church_id = ANY (((SELECT app.readable_church_ids()))::uuid[])));
alter policy "subscription_history_select" on public."subscription_history"
  using (((app.has_platform_capability('platform.commercial.read'::text) OR ((church_id = ANY (app.church_ids_for_user())) AND app.has_church_role(church_id, ARRAY['church_owner'::text, 'church_admin'::text])))) AND (church_id = ANY (((SELECT app.church_ids_without_security_block()))::uuid[])));
alter policy "export_jobs_select" on public."export_jobs"
  using (((church_id = ANY (( SELECT app.church_ids_for_user() AS church_ids_for_user)::uuid[]))) AND (church_id = ANY (((SELECT app.church_ids_without_security_block()))::uuid[])));
alter policy "export_jobs_manage" on public."export_jobs"
  using ((( SELECT app.has_capability(export_jobs.church_id, 'people.export'::text) AS has_capability)) AND (church_id = ANY (((SELECT app.church_ids_without_security_block()))::uuid[])));

-- 3. Superficie de recuperación -----------------------------------------------

-- Modo por iglesia de las membresías del usuario. Una sola llamada, para que
-- la app elija una iglesia operativa por defecto sin preguntar una a una.
create or replace function app.get_my_church_access_modes()
returns table (church_id uuid, access_mode text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select m.church_id, app.church_access_mode(m.church_id)
  from unnest(app.church_ids_for_user()) as m(church_id);
$$;

-- Membresías propias con su modo. No pasa por RLS de people/church_people, que en
-- estado no operativo ocultarían la iglesia y dejarían la recuperación inalcanzable.
-- Solo devuelve las pertenencias del usuario autenticado.
create or replace function app.get_my_memberships()
returns table (
  church_id uuid,
  church_name text,
  church_slug text,
  person_id uuid,
  relationship text,
  access_mode text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select cp.church_id, c.name, c.slug, cp.person_id, cp.relationship,
         app.church_access_mode(cp.church_id)
  from church_people cp
  join churches c on c.id = cp.church_id
  where cp.person_id in (select app.current_person_ids())
    and cp.archived_at is null
  order by c.name, cp.church_id;
$$;

revoke all on function app.get_my_memberships() from public, anon;
grant execute on function app.get_my_memberships() to authenticated, service_role;

create or replace function public.get_my_memberships()
returns table (
  church_id uuid,
  church_name text,
  church_slug text,
  person_id uuid,
  relationship text,
  access_mode text
)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.get_my_memberships();
$$;

revoke all on function public.get_my_memberships() from public, anon;
grant execute on function public.get_my_memberships() to authenticated;

-- Contexto de recuperación. Solo owner/admin de una iglesia de la que es miembro.
-- Devuelve campos fijos y códigos, nunca el security_block_reason interno ni los
-- metadatos del historial (reason, metadata, actor).
create or replace function app.get_church_recovery_context(p_church_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church churches%rowtype;
  v_sub subscriptions%rowtype;
  v_has_sub boolean;
  v_mode text;
  v_blocked boolean;
  v_history jsonb := '[]'::jsonb;
begin
  if not (p_church_id = any (app.church_ids_for_user())) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if not app.has_church_role(p_church_id, array['church_owner', 'church_admin']) then
    raise exception 'Solo el propietario o un administrador puede ver el estado de la iglesia.'
      using errcode = '42501';
  end if;

  select * into v_church from churches where id = p_church_id;
  v_mode := app.church_access_mode(p_church_id);
  v_blocked := v_mode = 'security_blocked';

  select * into v_sub from subscriptions where church_id = p_church_id;
  v_has_sub := found;

  -- security_blocked: solo lo mínimo para recuperación (sin historial, sin fechas de retención).
  if not v_blocked then
    select coalesce(jsonb_agg(jsonb_build_object(
             'event', h.event,
             'fromStatus', h.from_status,
             'toStatus', h.to_status,
             'occurredAt', h.occurred_at
           ) order by h.occurred_at desc), '[]'::jsonb)
    into v_history
    from (
      select * from subscription_history
      where church_id = p_church_id
      order by occurred_at desc
      limit 20
    ) h;
  end if;

  return jsonb_build_object(
    'churchId', v_church.id,
    'churchName', v_church.name,
    'churchSlug', v_church.slug,
    'accessMode', v_mode,
    'operational', v_mode in ('full', 'grace'),
    'exportAvailable', v_mode in ('full', 'grace', 'trial_expired', 'suspended', 'cancelled'),
    'subscription', case when v_has_sub and not v_blocked then jsonb_build_object(
        'status', v_sub.status,
        'planKey', v_sub.plan_key,
        'trialStartedAt', v_sub.trial_started_at,
        'trialEndsAt', v_sub.trial_ends_at,
        'pastDueSince', v_sub.past_due_since,
        'graceEndsAt', case when v_sub.past_due_since is not null
                            then v_sub.past_due_since + interval '15 days' end,
        'cancelledAt', v_sub.cancelled_at
      ) end,
    -- Retención: 30 días desde el archivado (app.run_lifecycle / runner de retención).
    'archivedAt', case when not v_blocked then v_church.archived_at end,
    'retentionEndsAt', case when v_church.archived_at is not null and not v_blocked
                            then v_church.archived_at + interval '30 days' end,
    'history', v_history
  );
end;
$$;

revoke all on function app.get_my_church_access_modes() from public, anon;
revoke all on function app.get_church_recovery_context(uuid) from public, anon;
grant execute on function app.get_my_church_access_modes() to authenticated, service_role;
grant execute on function app.get_church_recovery_context(uuid) to authenticated, service_role;

create or replace function public.get_my_church_access_modes()
returns table (church_id uuid, access_mode text)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.get_my_church_access_modes();
$$;

create or replace function public.get_church_recovery_context(p_church_id uuid)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.get_church_recovery_context(p_church_id);
$$;

revoke all on function public.get_my_church_access_modes() from public, anon;
revoke all on function public.get_church_recovery_context(uuid) from public, anon;
grant execute on function public.get_my_church_access_modes() to authenticated;
grant execute on function public.get_church_recovery_context(uuid) to authenticated;

-- Incidencia de un menor que sigue dentro, por RPC: el insert directo con
-- RETURNING necesita leer la fila, y en estado no operativo no se lee Kids.
-- Solo para menores con check-in activo; el trigger de A1 lo exige igualmente.
create or replace function app.kids_record_incident_for_present_kid(
  p_church_id uuid,
  p_kid_person_id uuid,
  p_session_id uuid,
  p_incident_type kids_incident_type,
  p_severity kids_incident_severity,
  p_description text,
  p_actions_taken text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if not (p_church_id = any (app.church_ids_for_user())) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if not app.has_church_role(p_church_id, array['church_owner', 'church_admin', 'kids_coordinator']) then
    raise exception 'No tienes permiso para registrar incidencias de Kids.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from kid_checkins kc
    where kc.church_id = p_church_id
      and kc.kid_person_id = p_kid_person_id
      and kc.status = 'checked_in'
  ) then
    raise exception 'El menor no está dentro en este momento.' using errcode = '42501';
  end if;

  insert into kids_incidents (
    church_id, session_id, kid_person_id, incident_type, severity, description, actions_taken, reported_by
  ) values (
    p_church_id, p_session_id, p_kid_person_id, p_incident_type, p_severity,
    p_description, nullif(trim(coalesce(p_actions_taken, '')), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function app.kids_record_incident_for_present_kid(uuid, uuid, uuid, kids_incident_type, kids_incident_severity, text, text) from public, anon;
grant execute on function app.kids_record_incident_for_present_kid(uuid, uuid, uuid, kids_incident_type, kids_incident_severity, text, text) to authenticated, service_role;

create or replace function public.kids_record_incident_for_present_kid(
  p_church_id uuid,
  p_kid_person_id uuid,
  p_session_id uuid,
  p_incident_type kids_incident_type,
  p_severity kids_incident_severity,
  p_description text,
  p_actions_taken text default null
)
returns uuid
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.kids_record_incident_for_present_kid(p_church_id, p_kid_person_id, p_session_id, p_incident_type, p_severity, p_description, p_actions_taken);
$$;

revoke all on function public.kids_record_incident_for_present_kid(uuid, uuid, uuid, kids_incident_type, kids_incident_severity, text, text) from public, anon;
grant execute on function public.kids_record_incident_for_present_kid(uuid, uuid, uuid, kids_incident_type, kids_incident_severity, text, text) to authenticated;

-- 4. Funciones que devuelven datos de negocio --------------------------------

CREATE OR REPLACE FUNCTION app.analytics_dashboard(p_church_id uuid, p_period text DEFAULT '30d'::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_campus_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_timezone text;
  v_bounds record;
  v_result jsonb := '{}'::jsonb;
  v_can_read_kids boolean;
  v_can_read_comm_metrics boolean;
  v_can_read_events boolean;
  v_can_read_service boolean;
  v_can_read_people boolean;
  v_can_read_groups boolean;
  v_can_read_courses boolean;
begin
  perform app.assert_can_read_church(p_church_id);
  if not app.has_capability(p_church_id, 'analytics.read') then
    raise exception 'No tiene autorización para ver Informes.' using errcode = '42501';
  end if;

  perform app.require_analytics_module(p_church_id);

  if p_campus_id is not null and not exists (
    select 1 from campuses where id = p_campus_id and church_id = p_church_id
  ) then
    raise exception 'Sede no encontrada.' using errcode = 'P0002';
  end if;

  select coalesce(c.timezone, 'Europe/Madrid') into v_timezone from churches c where c.id = p_church_id;

  select * into v_bounds from app.analytics_period_bounds(p_period, p_from, p_to, v_timezone);

  v_result := jsonb_build_object(
    'church_id', p_church_id,
    'timezone', v_timezone,
    'period', p_period,
    'period_from', v_bounds.period_from,
    'period_to', v_bounds.period_to,
    'previous_from', v_bounds.previous_from,
    'previous_to', v_bounds.previous_to,
    'campus_id', p_campus_id
  );

  -- People ------------------------------------------------------------
  v_can_read_people := app.has_capability(p_church_id, 'people.read');
  if app.module_enabled(p_church_id, 'people') and v_can_read_people then
    v_result := v_result || jsonb_build_object('people', jsonb_build_object(
      'active_people', (
        select count(*) from church_people cp
        where cp.church_id = p_church_id and cp.archived_at is null
          and (p_campus_id is null or cp.primary_campus_id = p_campus_id)
      ),
      'new_people', app.analytics_trend(
        (select count(*) from church_people cp
         where cp.church_id = p_church_id
           and cp.created_at >= v_bounds.period_from and cp.created_at < v_bounds.period_to
           and (p_campus_id is null or cp.primary_campus_id = p_campus_id)),
        (select count(*) from church_people cp
         where cp.church_id = p_church_id
           and cp.created_at >= v_bounds.previous_from and cp.created_at < v_bounds.previous_to
           and (p_campus_id is null or cp.primary_campus_id = p_campus_id))
      ),
      'archived_people', app.analytics_trend(
        (select count(*) from church_people cp
         where cp.church_id = p_church_id and cp.archived_at is not null
           and cp.archived_at >= v_bounds.period_from and cp.archived_at < v_bounds.period_to),
        (select count(*) from church_people cp
         where cp.church_id = p_church_id and cp.archived_at is not null
           and cp.archived_at >= v_bounds.previous_from and cp.archived_at < v_bounds.previous_to)
      ),
      'by_campus', (
        select coalesce(jsonb_object_agg(coalesce(cam.name, 'Sin sede'), cnt), '{}'::jsonb)
        from (
          select cp.primary_campus_id, count(*) as cnt
          from church_people cp
          where cp.church_id = p_church_id and cp.archived_at is null
          group by cp.primary_campus_id
        ) t
        left join campuses cam on cam.id = t.primary_campus_id
      )
    ));
  end if;

  -- Serving / Activity --------------------------------------------------
  v_can_read_service := app.has_capability(p_church_id, 'service.read');
  if app.module_enabled(p_church_id, 'serving') and v_can_read_service then
    v_result := v_result || jsonb_build_object('serving', jsonb_build_object(
      'activities', app.analytics_trend(
        (select count(*) from activities a
         where a.church_id = p_church_id and a.archived_at is null
           and a.starts_at >= v_bounds.period_from and a.starts_at < v_bounds.period_to
           and (p_campus_id is null or a.campus_id = p_campus_id)),
        (select count(*) from activities a
         where a.church_id = p_church_id and a.archived_at is null
           and a.starts_at >= v_bounds.previous_from and a.starts_at < v_bounds.previous_to
           and (p_campus_id is null or a.campus_id = p_campus_id))
      ),
      'by_status', (
        select coalesce(jsonb_object_agg(a.status, cnt), '{}'::jsonb)
        from (
          select status, count(*) as cnt from activities a
          where a.church_id = p_church_id and a.archived_at is null
            and a.starts_at >= v_bounds.period_from and a.starts_at < v_bounds.period_to
            and (p_campus_id is null or a.campus_id = p_campus_id)
          group by status
        ) a
      ),
      'positions_planned', (
        select coalesce(sum(ap.min_people), 0) from activity_positions ap
        join activities a on a.id = ap.activity_id
        where ap.church_id = p_church_id and a.archived_at is null
          and a.starts_at >= v_bounds.period_from and a.starts_at < v_bounds.period_to
          and (p_campus_id is null or a.campus_id = p_campus_id)
      ),
      'assignments_confirmed', (
        select count(*) from activity_assignments aa
        join activities a on a.id = aa.activity_id
        where aa.church_id = p_church_id and aa.status = 'accepted'
          and a.starts_at >= v_bounds.period_from and a.starts_at < v_bounds.period_to
          and (p_campus_id is null or a.campus_id = p_campus_id)
      ),
      'assignments_pending', (
        select count(*) from activity_assignments aa
        join activities a on a.id = aa.activity_id
        where aa.church_id = p_church_id and aa.status in ('proposed', 'pending')
          and a.starts_at >= v_bounds.period_from and a.starts_at < v_bounds.period_to
          and (p_campus_id is null or a.campus_id = p_campus_id)
      ),
      'assignments_declined', (
        select count(*) from activity_assignments aa
        join activities a on a.id = aa.activity_id
        where aa.church_id = p_church_id and aa.status = 'declined'
          and a.starts_at >= v_bounds.period_from and a.starts_at < v_bounds.period_to
          and (p_campus_id is null or a.campus_id = p_campus_id)
      )
    ));
  end if;

  -- Events / Registrations ----------------------------------------------
  v_can_read_events := app.has_capability(p_church_id, 'event.read');
  if app.module_enabled(p_church_id, 'events') and v_can_read_events then
    v_result := v_result || jsonb_build_object('events', jsonb_build_object(
      'events_published', app.analytics_trend(
        (select count(*) from events e
         join activities a on a.id = e.activity_id
         where e.church_id = p_church_id and a.status = 'published'
           and a.starts_at >= v_bounds.period_from and a.starts_at < v_bounds.period_to
           and (p_campus_id is null or a.campus_id = p_campus_id)),
        (select count(*) from events e
         join activities a on a.id = e.activity_id
         where e.church_id = p_church_id and a.status = 'published'
           and a.starts_at >= v_bounds.previous_from and a.starts_at < v_bounds.previous_to
           and (p_campus_id is null or a.campus_id = p_campus_id))
      ),
      'registrations', app.analytics_trend(
        (select count(*) from registrations r
         where r.church_id = p_church_id and r.status in ('confirmed', 'waitlisted')
           and r.registered_at >= v_bounds.period_from and r.registered_at < v_bounds.period_to),
        (select count(*) from registrations r
         where r.church_id = p_church_id and r.status in ('confirmed', 'waitlisted')
           and r.registered_at >= v_bounds.previous_from and r.registered_at < v_bounds.previous_to)
      ),
      'cancelled_registrations', (
        select count(*) from registrations r
        where r.church_id = p_church_id and r.status = 'cancelled'
          and r.registered_at >= v_bounds.period_from and r.registered_at < v_bounds.period_to
      ),
      'waitlisted', (
        select count(*) from registrations r
        where r.church_id = p_church_id and r.status = 'waitlisted'
          and r.registered_at >= v_bounds.period_from and r.registered_at < v_bounds.period_to
      )
    ));
  end if;

  -- Groups ----------------------------------------------------------------
  v_can_read_groups := app.has_capability(p_church_id, 'group.read');
  if app.module_enabled(p_church_id, 'groups') and v_can_read_groups then
    v_result := v_result || jsonb_build_object('groups', app.group_metrics(p_church_id) || jsonb_build_object(
      'new_members', app.analytics_trend(
        (select count(*) from group_members gm
         join groups g on g.id = gm.group_id
         where gm.church_id = p_church_id and g.archived_at is null
           and gm.joined_at >= v_bounds.period_from and gm.joined_at < v_bounds.period_to),
        (select count(*) from group_members gm
         join groups g on g.id = gm.group_id
         where gm.church_id = p_church_id and g.archived_at is null
           and gm.joined_at >= v_bounds.previous_from and gm.joined_at < v_bounds.previous_to)
      ),
      'meetings_held', (
        select count(*) from group_meetings gme
        join groups g on g.id = gme.group_id
        join activities a on a.id = gme.activity_id
        where gme.church_id = p_church_id and gme.cancelled_at is null
          and a.starts_at >= v_bounds.period_from and a.starts_at < v_bounds.period_to
      )
    ));
  end if;

  -- Discipleship ------------------------------------------------------------
  v_can_read_courses := app.has_capability(p_church_id, 'course.read');
  if app.module_enabled(p_church_id, 'discipleship') and v_can_read_courses then
    v_result := v_result || jsonb_build_object('discipleship', app.discipleship_metrics(p_church_id));
  end if;

  -- Kids ------------------------------------------------------------------
  v_can_read_kids := app.has_capability(p_church_id, 'kids.read');
  if app.module_enabled(p_church_id, 'kids') and v_can_read_kids then
    v_result := v_result || jsonb_build_object('kids', jsonb_build_object(
      'checkins', app.analytics_trend(
        (select count(*) from kid_checkins kc
         where kc.church_id = p_church_id
           and kc.checked_in_at >= v_bounds.period_from and kc.checked_in_at < v_bounds.period_to
           and kc.status <> 'cancelled'),
        (select count(*) from kid_checkins kc
         where kc.church_id = p_church_id
           and kc.checked_in_at >= v_bounds.previous_from and kc.checked_in_at < v_bounds.previous_to
           and kc.status <> 'cancelled')
      ),
      'active_profiles', (
        select count(*) from kids_profiles kp
        where kp.church_id = p_church_id and kp.status = 'active' and kp.archived_at is null
      ),
      'incidents', (
        select count(*) from kids_incidents ki
        where ki.church_id = p_church_id
          and ki.occurred_at >= v_bounds.period_from and ki.occurred_at < v_bounds.period_to
      )
    ));
  end if;

  -- Communications ----------------------------------------------------------
  v_can_read_comm_metrics := app.has_capability(p_church_id, 'communications.read_metrics');
  if app.module_enabled(p_church_id, 'communications') and v_can_read_comm_metrics then
    v_result := v_result || jsonb_build_object('communications', jsonb_build_object(
      'communications_sent', app.analytics_trend(
        (select count(*) from communications c
         where c.church_id = p_church_id and c.status in ('sent', 'partially_sent')
           and c.created_at >= v_bounds.period_from and c.created_at < v_bounds.period_to),
        (select count(*) from communications c
         where c.church_id = p_church_id and c.status in ('sent', 'partially_sent')
           and c.created_at >= v_bounds.previous_from and c.created_at < v_bounds.previous_to)
      ),
      'recipients_by_status', (
        select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
        from (
          select cr.status, count(*) as cnt from communication_recipients cr
          join communications c on c.id = cr.communication_id
          where cr.church_id = p_church_id
            and c.created_at >= v_bounds.period_from and c.created_at < v_bounds.period_to
          group by cr.status
        ) t
      ),
      'opt_outs', (
        select count(*) from communication_category_preferences ccp
        where ccp.church_id = p_church_id and ccp.opted_out = true
      )
    ));
  end if;

  return v_result;
end;
$function$;


CREATE OR REPLACE FUNCTION app.kids_room_ratio_status(p_session_id uuid)
 RETURNS TABLE(state kids_ratio_state, children_checked_in integer, staff_checked_in integer, min_adults_required integer, ratio_children_per_adult integer, max_children_for_current_staff integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_session kids_sessions%rowtype;
  v_room kids_rooms%rowtype;
  v_activity activities%rowtype;
  v_children integer;
  v_staff integer;
  v_max integer;
  v_state kids_ratio_state;
begin
  perform app.assert_can_read_church((select s.church_id from kids_sessions s where s.id = p_session_id));
  select ks.* into v_session from kids_sessions ks where ks.id = p_session_id;
  if not found then
    return;
  end if;

  select a.* into v_activity from activities a
  where a.id = v_session.activity_id and a.church_id = v_session.church_id;

  -- La ocupación de una sala es dato de la iglesia que la organiza.
  if not app.kids_cap(v_session.church_id, v_activity.campus_id, v_activity.id, 'kids.read')
     and not app.kids_cap(v_session.church_id, v_activity.campus_id, v_activity.id, 'kids.checkin') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select r.* into v_room from kids_rooms r
  where r.id = v_session.room_id and r.church_id = v_session.church_id;

  select count(*)::integer into v_children from kid_checkins
  where session_id = p_session_id and status = 'checked_in';

  select count(*)::integer into v_staff from kids_session_staff
  where session_id = p_session_id and checked_in_at is not null and checked_out_at is null;

  v_max := v_staff * coalesce(v_room.ratio_children_per_adult, 0);

  if v_staff < coalesce(v_room.min_adults, 0) or v_children > v_max then
    v_state := 'blocked';
  elsif v_max > 0 and v_children >= v_max then
    v_state := 'warning';
  else
    v_state := 'safe';
  end if;

  return query select v_state, v_children, v_staff,
    coalesce(v_room.min_adults, 0), coalesce(v_room.ratio_children_per_adult, 0), v_max;
end;
$function$;


CREATE OR REPLACE FUNCTION app.kids_staff_eligibility(p_church_id uuid, p_person_id uuid, p_campus_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(eligible boolean, reasons text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_reasons text[] := '{}';
  v_member_active boolean;
  v_req record;
begin
  perform app.assert_can_read_church(p_church_id);
  -- Lo único que cambia respecto de la versión original es esta guardia: lo que
  -- devuelve la función es información de personal —pertenencia y estado de la
  -- credencial obligatoria, que aquí es el certificado de antecedentes—, y
  -- antes respondía a cualquiera, incluso desde otra iglesia.
  if not (p_church_id = any (app.church_ids_for_user()))
     or not (app.has_capability(p_church_id, 'kids.session.manage')
             or app.has_capability(p_church_id, 'kids.manage')
             or app.has_capability(p_church_id, 'kids.checkin')) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select (cp.archived_at is null) into v_member_active
  from church_people cp
  where cp.church_id = p_church_id and cp.person_id = p_person_id;

  if v_member_active is null or not v_member_active then
    v_reasons := array_append(v_reasons, 'inactive_person');
  end if;

  if p_campus_id is not null then
    if not exists (
      select 1 from church_people cp
      where cp.church_id = p_church_id and cp.person_id = p_person_id
        and (cp.primary_campus_id = p_campus_id or cp.primary_campus_id is null)
    ) then
      v_reasons := array_append(v_reasons, 'wrong_campus');
    end if;
  end if;

  for v_req in
    select krc.credential_type_id, ct.requires_expiry
    from kids_required_credentials krc
    join credential_types ct on ct.id = krc.credential_type_id and ct.church_id = krc.church_id
    where krc.church_id = p_church_id and krc.active and krc.required
  loop
    if not exists (
      select 1 from person_credentials pc
      where pc.church_id = p_church_id
        and pc.person_id = p_person_id
        and pc.credential_type_id = v_req.credential_type_id
        and pc.status = 'valid'
        and (not v_req.requires_expiry or pc.expires_at is null or pc.expires_at > now())
    ) then
      v_reasons := array_append(v_reasons, 'missing_credential');
    end if;
  end loop;

  return query select (array_length(v_reasons, 1) is null), v_reasons;
end;
$function$;


CREATE OR REPLACE FUNCTION app.kids_add_session_staff(p_session_id uuid, p_person_id uuid, p_role text DEFAULT 'assistant'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_session kids_sessions%rowtype;
  v_activity activities%rowtype;
  v_eligible boolean;
  v_reasons text[];
  v_id uuid;
begin
  perform app.assert_can_read_church((select s.church_id from kids_sessions s where s.id = p_session_id));
  select ks.* into v_session from kids_sessions ks where ks.id = p_session_id;
  if not found or not (v_session.church_id = any (app.church_ids_for_user())) then
    raise exception 'Sesión Kids no encontrada.' using errcode = 'P0002';
  end if;

  select a.* into v_activity from activities a
  where a.id = v_session.activity_id and a.church_id = v_session.church_id;

  if not app.kids_cap(v_session.church_id, v_activity.campus_id, v_activity.id, 'kids.session.manage') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  -- El snapshot de elegibilidad se calcula aquí; no se acepta del cliente.
  select e.eligible, e.reasons into v_eligible, v_reasons
  from app.kids_staff_eligibility(v_session.church_id, p_person_id, v_activity.campus_id) e;

  if not v_eligible then
    raise exception 'Esa persona no puede estar con menores: %.', array_to_string(v_reasons, ', ')
      using errcode = '22023';
  end if;

  insert into kids_session_staff (church_id, session_id, person_id, role,
                                  eligible_at_assignment, eligibility_reasons)
  values (v_session.church_id, p_session_id, p_person_id, p_role::kids_staff_role, true, v_reasons)
  returning id into v_id;

  perform app.write_audit_log(v_session.church_id, 'kids.staff_added', 'kids_session_staff', v_id,
    jsonb_build_object('session_id', p_session_id, 'person_id', p_person_id, 'role', p_role));

  return v_id;
end;
$function$;


CREATE OR REPLACE FUNCTION app.kids_remove_session_staff(p_staff_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_staff kids_session_staff%rowtype;
  v_session kids_sessions%rowtype;
  v_activity activities%rowtype;
begin
  perform app.assert_can_read_church((select ks.church_id from kids_session_staff ks where ks.id = p_staff_id));
  select s.* into v_staff from kids_session_staff s where s.id = p_staff_id;
  if not found or not (v_staff.church_id = any (app.church_ids_for_user())) then
    raise exception 'Asignación no encontrada.' using errcode = 'P0002';
  end if;

  select ks.* into v_session from kids_sessions ks where ks.id = v_staff.session_id;
  select a.* into v_activity from activities a
  where a.id = v_session.activity_id and a.church_id = v_session.church_id;

  if not app.kids_cap(v_staff.church_id, v_activity.campus_id, v_activity.id, 'kids.session.manage') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  delete from kids_session_staff where id = p_staff_id;

  perform app.write_audit_log(v_staff.church_id, 'kids.staff_removed', 'kids_session_staff', p_staff_id,
    jsonb_build_object('session_id', v_staff.session_id, 'person_id', v_staff.person_id,
                       'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end;
$function$;


-- Página pública de eventos: un evento público de una iglesia suspendida deja de verse.
create or replace function app.can_read_event_public(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from events e
    join activities a on a.id = e.activity_id and a.church_id = e.church_id
    where e.id = p_event_id
      and e.visibility = 'public'
      -- La activity también tiene que ser de audiencia pública: el evento no
      -- puede ampliar por su cuenta la audiencia decidida en la activity.
      and a.visibility = 'public_future'
      and e.archived_at is null
      and a.status in ('published', 'completed')
      and app.church_access_mode(e.church_id) in ('full', 'grace')
  );
$$;

-- Notificaciones: sin bandeja de negocio fuera de full/grace (la recuperación va por su propia RPC).
create or replace function app.list_my_notifications(
  p_church_id uuid,
  p_only_unread boolean default false,
  p_limit integer default 50
)
returns table (
  id uuid,
  event_type text,
  title text,
  body text,
  entity_type text,
  entity_id uuid,
  activity_id uuid,
  created_at timestamp with time zone,
  read_at timestamp with time zone
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select n.id, n.event_type, n.title, n.body, n.entity_type, n.entity_id, n.activity_id, n.created_at, n.read_at
  from notifications n
  where n.church_id = p_church_id
    and p_church_id = any (app.church_ids_for_user())
    and app.can_read_church(p_church_id)
    and n.person_id in (select app.current_person_ids())
    and (not coalesce(p_only_unread, false) or n.read_at is null)
  order by n.created_at desc, n.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

create or replace function app.count_my_unread_notifications(p_church_id uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(*)::integer
  from notifications n
  where n.church_id = p_church_id
    and p_church_id = any (app.church_ids_for_user())
    and app.can_read_church(p_church_id)
    and n.person_id in (select app.current_person_ids())
    and n.read_at is null;
$$;

-- Cierre seguro de Kids: la recogida de un menor que sigue dentro se puede validar
-- en cualquier modo. Para el resto de menores, solo en full/grace.
create or replace function app.kids_authorized_pickups(p_kid_person_id uuid, p_church_id uuid)
returns table (
  id uuid,
  authorized_name_snapshot text,
  relation_text text,
  authorization_type pickup_authorization_type
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select a.id, a.authorized_name_snapshot, a.relation_text, a.authorization_type
  from kid_pickup_authorizations a
  where a.church_id = p_church_id
    and a.kid_person_id = p_kid_person_id
    and a.status = 'active'
    and a.valid_from <= now()
    and (a.valid_until is null or a.valid_until > now())
    and app.has_capability(p_church_id, 'kids.checkout')
    and (
      app.can_read_church(p_church_id)
      or exists (
        select 1 from kid_checkins kc
        where kc.church_id = p_church_id
          and kc.kid_person_id = p_kid_person_id
          and kc.status = 'checked_in'
      )
    );
$$;
