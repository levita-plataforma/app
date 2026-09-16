-- Fase 0 · Políticas RLS reales para las tablas tenant-aware del núcleo.
-- Patrón fijo: ver docs/adr/0013-estrategia-rls.md.

-- churches -------------------------------------------------------------------
create policy churches_select on churches
  for select to authenticated
  using ( id = any((select app.church_ids_for_user())::uuid[]) );

create policy churches_update on churches
  for update to authenticated
  using ( (select app.has_capability(id, 'church.settings.manage')) )
  with check ( (select app.has_capability(id, 'church.settings.manage')) );

-- campuses ---------------------------------------------------------------
create policy campuses_select on campuses
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy campuses_manage on campuses
  for all to authenticated
  using ( (select app.has_capability(church_id, 'church.settings.manage')) )
  with check ( (select app.has_capability(church_id, 'church.settings.manage')) );

-- people -----------------------------------------------------------------
-- Una persona es visible si el usuario pertenece a alguna iglesia que a su
-- vez tiene esa persona en church_people, o si es su propia persona.
create policy people_select on people
  for select to authenticated
  using (
    id in (select app.current_person_ids())
    or id in (
      select cp.person_id from church_people cp
      where cp.church_id = any((select app.church_ids_for_user())::uuid[])
    )
  );

create policy people_update_self on people
  for update to authenticated
  using ( id in (select app.current_person_ids()) )
  with check ( id in (select app.current_person_ids()) );

create policy people_manage on people
  for all to authenticated
  using (
    id in (
      select cp.person_id from church_people cp
      where (select app.has_capability(cp.church_id, 'people.manage'))
    )
  )
  with check (
    id in (
      select cp.person_id from church_people cp
      where (select app.has_capability(cp.church_id, 'people.manage'))
    )
  );

-- church_people ------------------------------------------------------------
create policy church_people_select on church_people
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy church_people_manage on church_people
  for all to authenticated
  using ( (select app.has_capability(church_id, 'people.manage')) )
  with check ( (select app.has_capability(church_id, 'people.manage')) );

-- households / household_members --------------------------------------------
create policy households_select on households
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy households_manage on households
  for all to authenticated
  using ( (select app.has_capability(church_id, 'people.manage')) )
  with check ( (select app.has_capability(church_id, 'people.manage')) );

create policy household_members_select on household_members
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy household_members_manage on household_members
  for all to authenticated
  using ( (select app.has_capability(church_id, 'people.manage')) )
  with check ( (select app.has_capability(church_id, 'people.manage')) );

-- tags / person_tags -------------------------------------------------------
create policy tags_select on tags
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy tags_manage on tags
  for all to authenticated
  using ( (select app.has_capability(church_id, 'people.manage')) )
  with check ( (select app.has_capability(church_id, 'people.manage')) );

create policy person_tags_select on person_tags
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy person_tags_manage on person_tags
  for all to authenticated
  using ( (select app.has_capability(church_id, 'people.manage')) )
  with check ( (select app.has_capability(church_id, 'people.manage')) );

-- custom fields ------------------------------------------------------------
create policy custom_field_definitions_select on custom_field_definitions
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy custom_field_definitions_manage on custom_field_definitions
  for all to authenticated
  using ( (select app.has_capability(church_id, 'church.settings.manage')) )
  with check ( (select app.has_capability(church_id, 'church.settings.manage')) );

create policy custom_field_values_select on custom_field_values
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy custom_field_values_manage on custom_field_values
  for all to authenticated
  using ( (select app.has_capability(church_id, 'people.manage')) )
  with check ( (select app.has_capability(church_id, 'people.manage')) );

-- activities -----------------------------------------------------------------
create policy activities_select on activities
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy activities_manage on activities
  for all to authenticated
  using ( (select app.has_capability(church_id, 'church.settings.manage')) )
  with check ( (select app.has_capability(church_id, 'church.settings.manage')) );

-- church_modules -------------------------------------------------------------
create policy church_modules_select on church_modules
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy church_modules_manage on church_modules
  for all to authenticated
  using ( (select app.has_capability(church_id, 'modules.manage')) )
  with check ( (select app.has_capability(church_id, 'modules.manage')) );

-- church_entitlement_overrides ------------------------------------------------
-- Solo visibles/gestionables por quien administra el tenant; los overrides
-- comerciales no son de consulta general.
create policy church_entitlement_overrides_select on church_entitlement_overrides
  for select to authenticated
  using ( (select app.has_capability(church_id, 'church.settings.manage')) );

create policy church_entitlement_overrides_manage on church_entitlement_overrides
  for all to authenticated
  using ( (select app.has_capability(church_id, 'church.settings.manage')) )
  with check ( (select app.has_capability(church_id, 'church.settings.manage')) );

-- church_feature_flags -------------------------------------------------------
create policy church_feature_flags_select on church_feature_flags
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy church_feature_flags_manage on church_feature_flags
  for all to authenticated
  using ( (select app.has_capability(church_id, 'modules.manage')) )
  with check ( (select app.has_capability(church_id, 'modules.manage')) );

-- church_people_roles ---------------------------------------------------------
create policy church_people_roles_select on church_people_roles
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy church_people_roles_manage on church_people_roles
  for all to authenticated
  using ( (select app.has_capability(church_id, 'roles.manage')) )
  with check ( (select app.has_capability(church_id, 'roles.manage')) );
