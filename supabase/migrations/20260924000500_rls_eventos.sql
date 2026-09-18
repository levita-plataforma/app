-- Fase 6 · RLS de eventos, formularios e inscripciones.
-- Ver prompt de Fase 6 §9, §41.
--
-- Superficie pública mínima y controlada (§41): anon solo puede leer
-- `events` (columnas no sensibles vía la función pública, nunca la tabla
-- entera) cuando el evento está publicado, visible=public y no
-- archivado/cancelado. anon NUNCA tiene SELECT general sobre registrations,
-- attendees, submissions ni consent_records.

-- app.can_read_event_public(): lectura pública sin sesión. No depende de
-- church_ids_for_user() (que siempre es vacío para anon) a propósito.
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
      and e.archived_at is null
      and a.status in ('published', 'completed')
  );
$$;

revoke all on function app.can_read_event_public(uuid) from public;
grant execute on function app.can_read_event_public(uuid) to anon, authenticated;

-- app.can_read_event(): lectura administrativa/interna (autenticado).
create or replace function app.can_read_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select
      app.can_read_activity(e.activity_id)
      and (
        e.visibility = 'public'
        or e.visibility = 'members'
        or app.event_cap(e.church_id, a.campus_id, e.activity_id, 'event.read')
        or app.event_cap(e.church_id, a.campus_id, e.activity_id, 'event.manage')
      )
    from events e
    join activities a on a.id = e.activity_id and a.church_id = e.church_id
    where e.id = p_event_id
  ), false);
$$;

revoke all on function app.can_read_event(uuid) from public, anon;
grant execute on function app.can_read_event(uuid) to authenticated;

-- events ---------------------------------------------------------------------
create policy events_select_authenticated on events
  for select to authenticated
  using ( app.can_read_event(id) );

create policy events_select_public on events
  for select to anon
  using ( app.can_read_event_public(id) );

create policy events_manage on events
  for all to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and exists (
      select 1 from activities a
      where a.id = activity_id and a.church_id = events.church_id
        and app.event_cap(events.church_id, a.campus_id, a.id, 'event.manage')
    )
  )
  with check (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and exists (
      select 1 from activities a
      where a.id = activity_id and a.church_id = events.church_id
        and app.event_cap(events.church_id, a.campus_id, a.id, 'event.manage')
    )
  );

-- forms / form_fields ---------------------------------------------------------
create policy forms_select on forms
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'form.read'))
  );

create policy forms_manage on forms
  for all to authenticated
  using ( (select app.has_capability(church_id, 'form.manage')) )
  with check ( (select app.has_capability(church_id, 'form.manage')) );

create policy form_fields_select on form_fields
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      classification in ('normal', 'personal')
      and (select app.has_capability(church_id, 'form.read'))
      or (select app.has_capability(church_id, 'form.sensitive.manage'))
    )
  );

create policy form_fields_manage on form_fields
  for all to authenticated
  using (
    case when classification in ('sensitive', 'restricted')
      then (select app.has_capability(church_id, 'form.sensitive.manage'))
      else (select app.has_capability(church_id, 'form.manage'))
    end
  )
  with check (
    case when classification in ('sensitive', 'restricted')
      then (select app.has_capability(church_id, 'form.sensitive.manage'))
      else (select app.has_capability(church_id, 'form.manage'))
    end
  );

-- form_submissions / form_submission_answers ----------------------------------
-- Solo gestión administrativa lee/gestiona submissions; el alta pública pasa
-- por la RPC app.register_for_event (security definer), nunca por INSERT
-- directo de anon.
create policy form_submissions_select on form_submissions
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      (select app.has_capability(church_id, 'form.read'))
      or (event_id is not null and exists (
        select 1 from events e join activities a on a.id = e.activity_id and a.church_id = e.church_id
        where e.id = event_id and app.event_cap(e.church_id, a.campus_id, a.id, 'event.registration.manage')
      ))
    )
  );

create policy form_submissions_manage on form_submissions
  for all to authenticated
  using ( (select app.has_capability(church_id, 'form.manage')) )
  with check ( (select app.has_capability(church_id, 'form.manage')) );

create policy form_submission_answers_select on form_submission_answers
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      classification in ('normal', 'personal')
      and exists (
        select 1 from form_submissions fs
        where fs.id = submission_id
          and (
            (select app.has_capability(fs.church_id, 'form.read'))
            or (fs.event_id is not null and exists (
              select 1 from events e join activities a on a.id = e.activity_id and a.church_id = e.church_id
              where e.id = fs.event_id and app.event_cap(e.church_id, a.campus_id, a.id, 'event.registration.manage')
            ))
          )
      )
      or (select app.has_capability(church_id, 'form.sensitive.manage'))
    )
  );

create policy form_submission_answers_manage on form_submission_answers
  for all to authenticated
  using ( (select app.has_capability(church_id, 'form.manage')) )
  with check ( (select app.has_capability(church_id, 'form.manage')) );

-- registrations ----------------------------------------------------------
-- authenticated: gestión (event.registration.manage) o la propia inscripción
-- (primary_person_id = persona actual). anon: SIN select general (§41); solo
-- lectura puntual mediante RPC pública con el código/token, no vía RLS.
create policy registrations_select on registrations
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      primary_person_id in (select app.current_person_ids())
      or exists (
        select 1 from events e join activities a on a.id = e.activity_id and a.church_id = e.church_id
        where e.id = event_id and app.event_cap(e.church_id, a.campus_id, a.id, 'event.registration.manage')
      )
    )
  );

create policy registrations_manage on registrations
  for all to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and exists (
      select 1 from events e join activities a on a.id = e.activity_id and a.church_id = e.church_id
      where e.id = event_id and app.event_cap(e.church_id, a.campus_id, a.id, 'event.registration.manage')
    )
  )
  with check (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and exists (
      select 1 from events e join activities a on a.id = e.activity_id and a.church_id = e.church_id
      where e.id = event_id and app.event_cap(e.church_id, a.campus_id, a.id, 'event.registration.manage')
    )
  );

-- registration_attendees ---------------------------------------------------
create policy registration_attendees_select on registration_attendees
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      exists (
        select 1 from registrations r
        where r.id = registration_id and r.primary_person_id in (select app.current_person_ids())
      )
      or exists (
        select 1 from events e join activities a on a.id = e.activity_id and a.church_id = e.church_id
        where e.id = event_id and app.event_cap(e.church_id, a.campus_id, a.id, 'event.registration.manage')
      )
    )
  );

create policy registration_attendees_manage on registration_attendees
  for all to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and exists (
      select 1 from events e join activities a on a.id = e.activity_id and a.church_id = e.church_id
      where e.id = event_id and (
        app.event_cap(e.church_id, a.campus_id, a.id, 'event.registration.manage')
        or app.event_cap(e.church_id, a.campus_id, a.id, 'event.checkin')
      )
    )
  )
  with check (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and exists (
      select 1 from events e join activities a on a.id = e.activity_id and a.church_id = e.church_id
      where e.id = event_id and (
        app.event_cap(e.church_id, a.campus_id, a.id, 'event.registration.manage')
        or app.event_cap(e.church_id, a.campus_id, a.id, 'event.checkin')
      )
    )
  );

-- consent_definitions / consent_records ---------------------------------------
create policy consent_definitions_select on consent_definitions
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy consent_definitions_select_public on consent_definitions
  for select to anon
  using ( active );

create policy consent_definitions_manage on consent_definitions
  for all to authenticated
  using ( (select app.has_capability(church_id, 'form.manage')) )
  with check ( (select app.has_capability(church_id, 'form.manage')) );

create policy consent_records_select on consent_records
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      person_id in (select app.current_person_ids())
      or exists (
        select 1 from registrations r
        join events e on e.id = r.event_id
        join activities a on a.id = e.activity_id and a.church_id = e.church_id
        where r.id = registration_id and app.event_cap(e.church_id, a.campus_id, a.id, 'event.registration.manage')
      )
    )
  );

create policy consent_records_manage on consent_records
  for all to authenticated
  using ( (select app.has_capability(church_id, 'form.manage')) )
  with check ( (select app.has_capability(church_id, 'form.manage')) );
