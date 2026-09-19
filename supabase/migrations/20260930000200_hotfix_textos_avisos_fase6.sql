-- Hotfix · Los avisos de eventos e inscripciones dejan de llegar como «Aviso».
--
-- La Fase 6 añadió ocho tipos de aviso (event.* y registration.*) pero nunca
-- escribió sus textos, así que todos caían en la rama final de
-- app.notification_text y llegaban a la bandeja con el título genérico «Aviso»
-- y el cuerpo «Tienes un aviso nuevo en “una actividad”». Es decir: la persona
-- recibe que algo ha pasado con un evento, pero no qué.
--
-- Se aprovecha el despachador que introdujo la Fase 7: cada fase pone sus
-- textos en su propia función y el despachador prueba una tras otra.

create or replace function app.notification_text_fase6(p_event notification_events)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_payload jsonb := coalesce(p_event.payload, '{}'::jsonb);
  v_when text := app.notification_when(v_payload);
  v_evento text := coalesce(nullif(v_payload ->> 'event_title', ''),
                            nullif(v_payload ->> 'activity_title', ''), 'un evento');
  v_lugar text := nullif(v_payload ->> 'location_text', '');
  v_titulo text;
  v_cuerpo text;
begin
  case p_event.event_type
    when 'event.published' then
      v_titulo := 'Nuevo evento abierto';
      v_cuerpo := 'Ya puedes apuntarte a «' || v_evento || '»' || v_when || '.';

    when 'event.cancelled' then
      v_titulo := 'Evento cancelado';
      v_cuerpo := 'Se ha cancelado «' || v_evento || '»' || v_when
        || '. No hace falta que hagas nada: tu inscripción queda anulada.';

    when 'event.rescheduled' then
      v_titulo := 'Cambio de fecha';
      v_cuerpo := '«' || v_evento || '» cambia de fecha: ahora empieza'
        || coalesce(nullif(v_when, ''), ' en otro momento')
        || coalesce(', en ' || v_lugar, '') || '. Tu inscripción sigue en pie.';

    when 'event.reminder' then
      v_titulo := 'Te esperamos pronto';
      v_cuerpo := '«' || v_evento || '»' || v_when
        || coalesce(', en ' || v_lugar, '') || '. Si no vas a poder ir, avisa para dejar la plaza libre.';

    when 'registration.confirmed' then
      v_titulo := 'Inscripción confirmada';
      v_cuerpo := 'Tienes plaza en «' || v_evento || '»' || v_when || '.';

    when 'registration.waitlisted' then
      v_titulo := 'Estás en lista de espera';
      v_cuerpo := '«' || v_evento || '»' || v_when
        || ' está completo. Te avisaremos aquí si queda una plaza libre.';

    when 'registration.promoted' then
      v_titulo := 'Ya tienes plaza';
      v_cuerpo := 'Ha quedado una plaza libre en «' || v_evento || '»' || v_when
        || ' y es tuya. Ya no estás en lista de espera.';

    when 'registration.cancelled' then
      v_titulo := 'Inscripción cancelada';
      v_cuerpo := 'Tu inscripción a «' || v_evento || '»' || v_when || ' queda cancelada.';

    else
      return null;
  end case;

  return jsonb_build_object('title', left(v_titulo, 200), 'body', left(v_cuerpo, 1000));
end;
$$;

revoke all on function app.notification_text_fase6(notification_events) from public, anon, authenticated;

-- El despachador prueba Fase 7, luego Fase 6, y por último la Fase 5, que es la
-- que conserva la rama genérica final.
create or replace function app.notification_text(p_event notification_events)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_text jsonb;
begin
  v_text := app.notification_text_fase7(p_event);
  if v_text is not null then
    return v_text;
  end if;

  v_text := app.notification_text_fase6(p_event);
  if v_text is not null then
    return v_text;
  end if;

  return app.notification_text_fase5(p_event);
end;
$$;

revoke all on function app.notification_text(notification_events) from public, anon, authenticated;

-- app.event_notification_payload() no incluía el título del evento, así que
-- aunque hubiera textos no habrían tenido qué decir. Se añade, y de paso el
-- lugar y la hora, que es lo que la persona necesita para saber si le afecta.
create or replace function app.event_notification_payload(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'event_id', e.id,
    'event_title', a.title,
    'activity_title', a.title,
    'activity_id', a.id,
    'starts_at', a.starts_at,
    'timezone', a.timezone,
    'location_text', a.location_text,
    'campus_id', a.campus_id
  )
  from events e
  join activities a on a.id = e.activity_id and a.church_id = e.church_id
  where e.id = p_event_id;
$$;

revoke all on function app.event_notification_payload(uuid) from public, anon, authenticated;
