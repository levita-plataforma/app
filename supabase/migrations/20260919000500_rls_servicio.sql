-- Fase 3 · Políticas RLS para el módulo Serving.
-- Patrón fijo: ver docs/adr/0013-estrategia-rls.md y prompt Fase 3 §25-26.
--
-- has_capability(church, cap, scope_type, scope_id) ya evalúa: un rol con
-- scope_type='church' autoriza cualquier scope más específico, y un rol con
-- scope_type='service_area' + scope_id=X solo autoriza esa área concreta
-- (ver app.has_capability, Fase 0). Por eso basta pasar el service_area_id
-- de la fila como scope_id: un líder de Sonido con scope 'service_area'
-- limitado a su área nunca satisface la condición para otra área.

-- service_areas ---------------------------------------------------------------
create policy service_areas_select on service_areas
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy service_areas_manage on service_areas
  for all to authenticated
  using (
    (select app.has_capability(church_id, 'service_area.manage'))
    or (select app.has_capability(church_id, 'service_area.manage', 'service_area', id))
  )
  with check (
    (select app.has_capability(church_id, 'service_area.manage'))
    or (select app.has_capability(church_id, 'service_area.manage', 'service_area', id))
  );

-- service_area_leaders ----------------------------------------------------
create policy service_area_leaders_select on service_area_leaders
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy service_area_leaders_manage on service_area_leaders
  for all to authenticated
  using (
    (select app.has_capability(church_id, 'service_area.leaders.manage'))
    or (select app.has_capability(church_id, 'service_area.leaders.manage', 'service_area', service_area_id))
  )
  with check (
    (select app.has_capability(church_id, 'service_area.leaders.manage'))
    or (select app.has_capability(church_id, 'service_area.leaders.manage', 'service_area', service_area_id))
  );

-- service_area_members -----------------------------------------------------
create policy service_area_members_select on service_area_members
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy service_area_members_manage on service_area_members
  for all to authenticated
  using (
    (select app.has_capability(church_id, 'service_members.manage'))
    or (select app.has_capability(church_id, 'service_members.manage', 'service_area', service_area_id))
  )
  with check (
    (select app.has_capability(church_id, 'service_members.manage'))
    or (select app.has_capability(church_id, 'service_members.manage', 'service_area', service_area_id))
  );

-- service_teams / service_team_members --------------------------------------
create policy service_teams_select on service_teams
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy service_teams_manage on service_teams
  for all to authenticated
  using (
    (select app.has_capability(church_id, 'service_teams.manage'))
    or (select app.has_capability(church_id, 'service_teams.manage', 'service_area', service_area_id))
  )
  with check (
    (select app.has_capability(church_id, 'service_teams.manage'))
    or (select app.has_capability(church_id, 'service_teams.manage', 'service_area', service_area_id))
  );

create policy service_team_members_select on service_team_members
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy service_team_members_manage on service_team_members
  for all to authenticated
  using (
    (select app.has_capability(church_id, 'service_teams.manage'))
    or church_id in (
      select st.church_id from service_teams st
      where st.id = service_team_id
        and (select app.has_capability(st.church_id, 'service_teams.manage', 'service_area', st.service_area_id))
    )
  )
  with check (
    (select app.has_capability(church_id, 'service_teams.manage'))
    or church_id in (
      select st.church_id from service_teams st
      where st.id = service_team_id
        and (select app.has_capability(st.church_id, 'service_teams.manage', 'service_area', st.service_area_id))
    )
  );

-- service_positions ---------------------------------------------------------
create policy service_positions_select on service_positions
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy service_positions_manage on service_positions
  for all to authenticated
  using (
    (select app.has_capability(church_id, 'service_positions.manage'))
    or (select app.has_capability(church_id, 'service_positions.manage', 'service_area', service_area_id))
  )
  with check (
    (select app.has_capability(church_id, 'service_positions.manage'))
    or (select app.has_capability(church_id, 'service_positions.manage', 'service_area', service_area_id))
  );

-- position_requirements -------------------------------------------------------
create policy position_requirements_select on position_requirements
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy position_requirements_manage on position_requirements
  for all to authenticated
  using (
    (select app.has_capability(church_id, 'service_positions.manage'))
    or church_id in (
      select sp.church_id from service_positions sp
      where sp.id = service_position_id
        and (select app.has_capability(sp.church_id, 'service_positions.manage', 'service_area', sp.service_area_id))
    )
  )
  with check (
    (select app.has_capability(church_id, 'service_positions.manage'))
    or church_id in (
      select sp.church_id from service_positions sp
      where sp.id = service_position_id
        and (select app.has_capability(sp.church_id, 'service_positions.manage', 'service_area', sp.service_area_id))
    )
  );

-- qualifications / person_qualifications -------------------------------------
create policy qualifications_select on qualifications
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy qualifications_manage on qualifications
  for all to authenticated
  using ( (select app.has_capability(church_id, 'qualification.manage')) )
  with check ( (select app.has_capability(church_id, 'qualification.manage')) );

create policy person_qualifications_select on person_qualifications
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy person_qualifications_manage on person_qualifications
  for all to authenticated
  using ( (select app.has_capability(church_id, 'qualification.manage')) )
  with check ( (select app.has_capability(church_id, 'qualification.manage')) );

-- credential_types ------------------------------------------------------------
-- La lectura de tipos de credencial no expone datos de personas: visible con
-- credential.read. La escritura exige credential.manage.
create policy credential_types_select on credential_types
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'credential.read'))
  );

create policy credential_types_manage on credential_types
  for all to authenticated
  using ( (select app.has_capability(church_id, 'credential.manage')) )
  with check ( (select app.has_capability(church_id, 'credential.manage')) );

-- person_credentials ------------------------------------------------------
-- Las credenciales de tipo sensible (LOPIVI) solo son visibles con
-- credential.sensitive.read; el resto basta con credential.read. Ver prompt
-- Fase 3 §14 y §23.
create policy person_credentials_select on person_credentials
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      (select app.has_capability(church_id, 'credential.sensitive.read'))
      or (
        (select app.has_capability(church_id, 'credential.read'))
        and not exists (
          select 1 from credential_types ct
          where ct.id = credential_type_id and ct.sensitive
        )
      )
    )
  );

create policy person_credentials_manage on person_credentials
  for all to authenticated
  using ( (select app.has_capability(church_id, 'credential.manage')) )
  with check ( (select app.has_capability(church_id, 'credential.manage')) );
