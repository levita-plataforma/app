-- Fase 4 · RLS de actividades, estructura, planning, series y plantillas.
-- Ver docs/adr/0013 y docs/adr/0017.
--
-- Cambios respecto a Fase 0:
-- * Se ELIMINAN activities_select (cualquier miembro leía todo) y
--   activities_manage (church.settings.manage escribía todo). Añadir políticas
--   restrictivas sin retirarlas mantendría el acceso anterior, porque las
--   políticas permisivas se combinan con OR.
-- * Escritura: solo mediante funciones RPC (security definer) que comprueban
--   capability, scope, módulo y reglas. Se revocan INSERT/UPDATE/DELETE
--   directos a anon/authenticated en todas las tablas de este dominio, así
--   que no existen políticas de escritura: una escritura directa vía API o
--   SQL con rol authenticated falla por privilegios antes de llegar a RLS.

drop policy if exists activities_select on activities;
drop policy if exists activities_manage on activities;

revoke insert, update, delete, truncate on
  activities,
  activity_series,
  activity_admin_notes,
  activity_service_areas,
  activity_positions,
  activity_position_requirements,
  activity_plan_items,
  activity_templates,
  activity_template_areas,
  activity_template_positions,
  activity_template_plan_items
from anon, authenticated;

grant select on
  activities,
  activity_series,
  activity_admin_notes,
  activity_service_areas,
  activity_positions,
  activity_position_requirements,
  activity_plan_items,
  activity_templates,
  activity_template_areas,
  activity_template_positions,
  activity_template_plan_items
to authenticated;

revoke select on
  activities,
  activity_series,
  activity_admin_notes,
  activity_service_areas,
  activity_positions,
  activity_position_requirements,
  activity_plan_items,
  activity_templates,
  activity_template_areas,
  activity_template_positions,
  activity_template_plan_items
from anon;

-- activities -------------------------------------------------------------------
create policy activities_select on activities
  for select to authenticated
  using (
    church_id = any ((select app.church_ids_for_user())::uuid[])
    and app.can_read_activity_row(id, church_id, campus_id, status, visibility, organizer_person_id)
  );

-- Estructura y planning: visibles para quien puede leer la actividad ------------
create policy activity_service_areas_select on activity_service_areas
  for select to authenticated
  using (
    church_id = any ((select app.church_ids_for_user())::uuid[])
    and app.can_read_activity(activity_id)
  );

create policy activity_positions_select on activity_positions
  for select to authenticated
  using (
    church_id = any ((select app.church_ids_for_user())::uuid[])
    and app.can_read_activity(activity_id)
  );

create policy activity_position_requirements_select on activity_position_requirements
  for select to authenticated
  using (
    church_id = any ((select app.church_ids_for_user())::uuid[])
    and app.can_read_activity(activity_id)
  );

create policy activity_plan_items_select on activity_plan_items
  for select to authenticated
  using (
    church_id = any ((select app.church_ids_for_user())::uuid[])
    and app.can_read_activity(activity_id)
  );

-- Notas administrativas: nunca con la audiencia general -------------------------
create policy activity_admin_notes_select on activity_admin_notes
  for select to authenticated
  using (
    church_id = any ((select app.church_ids_for_user())::uuid[])
    and app.can_read_activity_admin_notes(activity_id)
  );

-- Series: con activity.read de iglesia, o si se puede leer alguna ocurrencia ----
-- (la subconsulta sobre activities aplica la RLS de activities del usuario).
create policy activity_series_select on activity_series
  for select to authenticated
  using (
    church_id = any ((select app.church_ids_for_user())::uuid[])
    and (
      (select app.has_capability(church_id, 'activity.read'))
      or exists (select 1 from activities a where a.series_id = activity_series.id)
    )
  );

-- Plantillas: quien las gestiona o puede crear actividades ----------------------
-- (las de una sede, solo con permiso en esa sede; las hijas heredan la
-- visibilidad de su plantilla mediante la RLS de activity_templates)
create policy activity_templates_select on activity_templates
  for select to authenticated
  using ( app.can_read_activity_template(church_id, campus_id) );

create policy activity_template_areas_select on activity_template_areas
  for select to authenticated
  using ( exists (select 1 from activity_templates t where t.id = template_id) );

create policy activity_template_positions_select on activity_template_positions
  for select to authenticated
  using ( exists (select 1 from activity_templates t where t.id = template_id) );

create policy activity_template_plan_items_select on activity_template_plan_items
  for select to authenticated
  using ( exists (select 1 from activity_templates t where t.id = template_id) );
