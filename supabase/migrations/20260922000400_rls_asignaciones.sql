-- Fase 5 (Carlos) · RLS de asignaciones, notas privadas y sustituciones.
-- Escritura solo por RPC: se revocan INSERT/UPDATE/DELETE directos.
--
-- Lectura de asignaciones:
-- * quien gestiona asignaciones del puesto (assignment.manage en su ámbito): todas;
-- * la propia persona: las suyas salvo borradores (proposed);
-- * quien puede leer la actividad por su modelo original (audiencia o
--   capabilities, no por estar asignado): solo las aceptadas (equipo confirmado).
-- Una persona que solo lee la actividad por estar asignada no ve al resto del equipo.

create or replace function app.can_read_assignment_row(
  p_church_id uuid,
  p_activity_id uuid,
  p_service_area_id uuid,
  p_person_id uuid,
  p_status activity_assignment_status
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

  if p_status <> 'proposed' and p_person_id in (select app.current_person_ids()) then
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

revoke all on function app.can_read_assignment_row(uuid, uuid, uuid, uuid, activity_assignment_status) from public, anon;
grant execute on function app.can_read_assignment_row(uuid, uuid, uuid, uuid, activity_assignment_status) to authenticated;

revoke insert, update, delete, truncate on activity_assignments, activity_assignment_notes, activity_substitution_requests
from anon, authenticated;
revoke select on activity_assignments, activity_assignment_notes, activity_substitution_requests from anon;
grant select on activity_assignments, activity_assignment_notes, activity_substitution_requests to authenticated;

create policy activity_assignments_select on activity_assignments
  for select to authenticated
  using (
    church_id = any ((select app.church_ids_for_user())::uuid[])
    and app.can_read_assignment_row(church_id, activity_id, service_area_id, person_id, status)
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
          aa.person_id in (select app.current_person_ids())
          or app.assignment_manage_cap(aa.church_id, a.campus_id, aa.activity_id, aa.service_area_id)
        )
    )
  );
