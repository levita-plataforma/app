-- Fase 8 (Diogo) · RLS de Kids. Ver prompt Fase 8 §40-42.
--
-- Kids es el módulo más sensible hasta ahora: deny by default, ninguna
-- RPC pública para `anon` (a diferencia de Fase 6, aquí NO hay superficie
-- pública), consultas mínimas. kids.read/kids.manage/etc. NUNCA se
-- conceden por defecto a ministry_leader (§8): solo capabilities
-- explícitas por rol/scope.

-- kids_profiles ---------------------------------------------------------
create policy kids_profiles_select on kids_profiles
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'kids.read'))
  );

create policy kids_profiles_manage on kids_profiles
  for all to authenticated
  using ( (select app.has_capability(church_id, 'kids.manage')) )
  with check ( (select app.has_capability(church_id, 'kids.manage')) );

-- kid_guardians ------------------------------------------------------------
create policy kid_guardians_select on kid_guardians
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      (select app.has_capability(church_id, 'kids.read'))
      or guardian_person_id in (select app.current_person_ids())
    )
  );

create policy kid_guardians_manage on kid_guardians
  for all to authenticated
  using ( (select app.has_capability(church_id, 'kids.guardians.manage')) )
  with check ( (select app.has_capability(church_id, 'kids.guardians.manage')) );

-- kid_pickup_authorizations -------------------------------------------------
-- Lectura restringida: nunca se expone la lista completa de autorizados a
-- alguien sin kids.pickup.manage (§21 - "no revelar lista completa a
-- alguien sin permiso"). Un guardian con can_view puede ver que existe una
-- autorización, pero solo quien gestiona pickup ve el detalle completo.
create policy kid_pickup_authorizations_select on kid_pickup_authorizations
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'kids.pickup.manage'))
  );

create policy kid_pickup_authorizations_manage on kid_pickup_authorizations
  for all to authenticated
  using ( (select app.has_capability(church_id, 'kids.pickup.manage')) )
  with check ( (select app.has_capability(church_id, 'kids.pickup.manage')) );

-- kids_rooms ---------------------------------------------------------------
create policy kids_rooms_select on kids_rooms
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'kids.read'))
  );

create policy kids_rooms_manage on kids_rooms
  for all to authenticated
  using ( (select app.has_capability(church_id, 'kids.room.manage')) )
  with check ( (select app.has_capability(church_id, 'kids.room.manage')) );

-- kids_sessions --------------------------------------------------------------
create policy kids_sessions_select on kids_sessions
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      (select app.has_capability(church_id, 'kids.read'))
      or exists (
        select 1 from activities a
        where a.id = activity_id and a.church_id = kids_sessions.church_id
          and app.kids_cap(kids_sessions.church_id, a.campus_id, a.id, 'kids.session.manage')
      )
    )
  );

create policy kids_sessions_manage on kids_sessions
  for all to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and exists (
      select 1 from activities a
      where a.id = activity_id and a.church_id = kids_sessions.church_id
        and app.kids_cap(kids_sessions.church_id, a.campus_id, a.id, 'kids.session.manage')
    )
  )
  with check (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and exists (
      select 1 from activities a
      where a.id = activity_id and a.church_id = kids_sessions.church_id
        and app.kids_cap(kids_sessions.church_id, a.campus_id, a.id, 'kids.session.manage')
    )
  );

-- kids_session_staff ---------------------------------------------------------
create policy kids_session_staff_select on kids_session_staff
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      (select app.has_capability(church_id, 'kids.read'))
      or person_id in (select app.current_person_ids())
      or exists (
        select 1 from kids_sessions ks join activities a on a.id = ks.activity_id and a.church_id = ks.church_id
        where ks.id = session_id and app.kids_cap(ks.church_id, a.campus_id, a.id, 'kids.session.manage')
      )
    )
  );

create policy kids_session_staff_manage on kids_session_staff
  for all to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and exists (
      select 1 from kids_sessions ks join activities a on a.id = ks.activity_id and a.church_id = ks.church_id
      where ks.id = session_id and app.kids_cap(ks.church_id, a.campus_id, a.id, 'kids.session.manage')
    )
  )
  with check (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and exists (
      select 1 from kids_sessions ks join activities a on a.id = ks.activity_id and a.church_id = ks.church_id
      where ks.id = session_id and app.kids_cap(ks.church_id, a.campus_id, a.id, 'kids.session.manage')
    )
  );

-- kid_checkins ---------------------------------------------------------------
-- Escritura SOLO por RPC (app.kids_checkin / app.kids_checkout,
-- security definer): no hay policy de INSERT directo para authenticated a
-- propósito, igual que audit_logs en Fase 0. La política "manage" cubre
-- UPDATE/DELETE administrativos excepcionales (p. ej. corregir un registro
-- erróneo), nunca el alta.
create policy kid_checkins_select on kid_checkins
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      (select app.has_capability(church_id, 'kids.read'))
      or exists (
        select 1 from kids_sessions ks join activities a on a.id = ks.activity_id and a.church_id = ks.church_id
        where ks.id = session_id and app.kids_cap(ks.church_id, a.campus_id, a.id, 'kids.checkin')
      )
    )
  );

create policy kid_checkins_update on kid_checkins
  for update to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and exists (
      select 1 from kids_sessions ks join activities a on a.id = ks.activity_id and a.church_id = ks.church_id
      where ks.id = session_id and app.kids_cap(ks.church_id, a.campus_id, a.id, 'kids.checkout')
    )
  )
  with check (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and exists (
      select 1 from kids_sessions ks join activities a on a.id = ks.activity_id and a.church_id = ks.church_id
      where ks.id = session_id and app.kids_cap(ks.church_id, a.campus_id, a.id, 'kids.checkout')
    )
  );

-- kids_incidents ---------------------------------------------------------
-- Solo capabilities específicas de incidencias, nunca kids.read genérico
-- (§23-24: el contenido nunca aparece en dashboards/People/logs generales).
create policy kids_incidents_select on kids_incidents
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'kids.incident.read'))
  );

create policy kids_incidents_manage on kids_incidents
  for all to authenticated
  using ( (select app.has_capability(church_id, 'kids.incident.manage')) )
  with check ( (select app.has_capability(church_id, 'kids.incident.manage')) );

-- kid_pickup_overrides -------------------------------------------------------
create policy kid_pickup_overrides_select on kid_pickup_overrides
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'kids.pickup.manage'))
  );

-- Solo por RPC (app.kids_checkout con override); no hay policy de INSERT
-- directo a propósito.
