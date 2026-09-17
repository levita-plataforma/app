-- Fase 5 (Carlos) · RLS de asignaciones, notas privadas y sustituciones.
-- Escritura solo por RPC: se revocan INSERT/UPDATE/DELETE directos.
--
-- Lectura de asignaciones:
-- * quien gestiona asignaciones del puesto (assignment.manage en su ámbito): todas;
-- * la propia persona: las suyas que llegaron a comunicarse (nunca borradores);
-- * quien puede leer la actividad por su modelo original (audiencia o
--   capabilities, no por estar asignado): solo las aceptadas (equipo confirmado).
-- Una persona que solo lee la actividad por estar asignada no ve al resto del equipo.

create or replace function app.can_read_assignment_row(
  p_church_id uuid,
  p_activity_id uuid,
  p_service_area_id uuid,
  p_person_id uuid,
  p_status activity_assignment_status,
  p_sent_at timestamptz,
  p_response_source activity_assignment_response_source
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_activity activities%rowtype;
begin
  if not (p_church_id = any (app.church_ids_for_user())) then
    return false;
  end if;

  -- Propias: solo las que llegaron a comunicarse (un borrador cancelado sin
  -- enviar nunca existió para la persona).
  if p_status <> 'proposed' and (p_sent_at is not null or p_response_source is not null)
     and p_person_id in (select app.current_person_ids()) then
    return true;
  end if;

  select * into v_activity from activities where id = p_activity_id;
  if app.assignment_manage_cap(p_church_id, v_activity.campus_id, p_activity_id, p_service_area_id) then
    return true;
  end if;

  return p_status = 'accepted'
    and app.can_read_activity_row_base(v_activity.id, v_activity.church_id, v_activity.campus_id,
                                       v_activity.status, v_activity.visibility, v_activity.organizer_person_id);
end;
$$;

revoke all on function app.can_read_assignment_row(uuid, uuid, uuid, uuid, activity_assignment_status, timestamptz, activity_assignment_response_source) from public, anon;
grant execute on function app.can_read_assignment_row(uuid, uuid, uuid, uuid, activity_assignment_status, timestamptz, activity_assignment_response_source) to authenticated;

revoke insert, update, delete, truncate on activity_assignments, activity_assignment_notes, activity_substitution_requests
from anon, authenticated;
revoke select on activity_assignments, activity_assignment_notes, activity_substitution_requests from anon;
grant select on activity_assignment_notes, activity_substitution_requests to authenticated;

-- Los códigos de elegibilidad guardados (avisos confirmados, p. ej. no
-- disponibilidad) no los lee quien solo ve el equipo confirmado: se conceden
-- por columna todas las demás y quien gestiona el puesto los lee por RPC
-- (public.activity_assignment_recorded_warnings, migración 0500).
revoke select on activity_assignments from authenticated;
grant select (
  id, church_id, activity_id, activity_position_id, person_id, status, version, position_name, service_area_id,
  substitutes_assignment_id, eligibility_checked_at, created_by, created_at, sent_by, sent_at, responded_at,
  responded_by, response_source, confirmed_starts_at, confirmed_ends_at, reconfirmation_requested_at,
  cancelled_at, cancelled_by, cancel_cause, substituted_at, updated_at
) on activity_assignments to authenticated;

create policy activity_assignments_select on activity_assignments
  for select to authenticated
  using (
    church_id = any ((select app.church_ids_for_user())::uuid[])
    and app.can_read_assignment_row(church_id, activity_id, service_area_id, person_id, status, sent_at, response_source)
  );

-- Nota privada: solo la propia persona.
create policy activity_assignment_notes_select on activity_assignment_notes
  for select to authenticated
  using (
    church_id = any ((select app.church_ids_for_user())::uuid[])
    and person_id in (select app.current_person_ids())
  );

-- Sustituciones: la persona de la asignación original o quien gestiona su puesto.
create policy activity_substitution_requests_select on activity_substitution_requests
  for select to authenticated
  using (
    church_id = any ((select app.church_ids_for_user())::uuid[])
    and exists (
      select 1 from activity_assignments aa
      join activities a on a.id = aa.activity_id
      where aa.id = original_assignment_id
        and (
          (aa.person_id in (select app.current_person_ids()) and aa.status <> 'proposed'
           and (aa.sent_at is not null or aa.response_source is not null))
          or app.assignment_manage_cap(aa.church_id, a.campus_id, aa.activity_id, aa.service_area_id)
        )
    )
  );
