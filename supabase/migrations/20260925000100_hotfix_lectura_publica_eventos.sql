-- Hotfix Fase 6 · Lectura pública de eventos: coherencia con la visibilidad
-- de la activity y con el envoltorio público del estado de inscripción.
--
-- Corrige dos fallos detectados en la revisión adversarial de la Fase 6
-- (migraciones 20260924*, ya aplicadas en producción; por eso todo va aquí y
-- no editando aquellas):
--
--   F-09 (medio) · app.can_read_event_public ignoraba activities.visibility:
--   bastaba marcar el `events.visibility = 'public'` para exponer sin sesión
--   el título, la ubicación y el horario de una activity cuya audiencia era
--   'private' o 'leaders'. La visibilidad de la activity es la fuente de
--   verdad de la audiencia (ver 20260920000200_activities_ampliacion.sql), y
--   el evento no puede ampliarla por su cuenta: ahora se exigen LAS DOS.
--
--   F-11 (bajo) · public.event_registration_status estaba concedida a `anon`
--   siendo `security invoker` y llamando a app.event_registration_status, que
--   NO está concedida a `anon`: para un visitante la función fallaba siempre
--   (permiso denegado) y, peor, su contrato era incoherente — si algún día se
--   concedía la función interna, `anon` podría consultar el estado de
--   inscripción (y por tanto la existencia y el aforo) de CUALQUIER evento
--   conociendo su uuid, incluido uno interno. Se convierte en `security
--   definer` con la misma comprobación de lectura que el resto de la
--   superficie pública: devuelve null si quien pregunta no puede leer el
--   evento.

-- F-09 ----------------------------------------------------------------------
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
  );
$$;

comment on function app.can_read_event_public(uuid) is
  'Lectura pública sin sesión de un evento: exige events.visibility = public Y activities.visibility = public_future, evento no archivado y activity publicada/completada. Ver hotfix F-09.';

revoke all on function app.can_read_event_public(uuid) from public;
grant execute on function app.can_read_event_public(uuid) to anon, authenticated;

-- F-11 ----------------------------------------------------------------------
create or replace function public.event_registration_status(p_event_id uuid)
returns event_registration_status
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when auth.uid() is null then
      case when app.can_read_event_public(p_event_id)
        then app.event_registration_status(p_event_id) end
    else
      case when app.can_read_event(p_event_id)
        then app.event_registration_status(p_event_id) end
  end;
$$;

comment on function public.event_registration_status(uuid) is
  'Estado de inscripción de un evento para quien puede leerlo: superficie pública (sin sesión) solo para eventos públicos publicados; con sesión, según app.can_read_event. Devuelve null si no hay derecho de lectura. Ver hotfix F-11.';

revoke all on function public.event_registration_status(uuid) from public;
grant execute on function public.event_registration_status(uuid) to anon, authenticated;
