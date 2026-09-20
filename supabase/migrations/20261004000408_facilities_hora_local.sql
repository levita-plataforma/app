-- Fase 10 · Las reservas y los mantenimientos aceptan hora local más zona.
-- Ver docs/CONTRATO-FASE-10.md §12.
--
-- Un campo `datetime-local` de un formulario devuelve «2026-10-04T10:00» sin
-- zona. Convertirlo a instante en JavaScript obliga a hacer aritmética con el
-- desfase del navegador, que es justo donde se cuelan los errores de una hora
-- dos veces al año.
--
-- La Fase 4 ya resolvió esto: create_activity recibe local_start, local_end y
-- timezone, y convierte con app.local_to_instant. Aquí se hace igual en vez de
-- inventar un segundo criterio, porque además es lo que la persona quiso decir:
-- «las diez» es las diez donde está la sala, no donde esté el servidor.
--
-- Se mantiene la entrada por instante (starts_at/ends_at) para quien ya la
-- tenga resuelta, por ejemplo al reservar desde una actividad.

create or replace function app.reservation_window(
  p_church_id uuid,
  p_activity_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_local_start text default null,
  p_local_end text default null,
  p_timezone text default null
)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_act activities%rowtype;
  v_zona text;
  v_inicio timestamptz;
  v_fin timestamptz;
begin
  if p_activity_id is null then
    if p_local_start is not null and p_local_end is not null then
      -- Sin zona explícita manda la de la iglesia: es donde están las salas.
      v_zona := coalesce(nullif(btrim(coalesce(p_timezone, '')), ''),
                         (select timezone from churches where id = p_church_id),
                         'Europe/Madrid');

      v_inicio := app.local_to_instant(app.parse_local_timestamp(p_local_start), v_zona);
      v_fin := app.local_to_instant(app.parse_local_timestamp(p_local_end), v_zona);

      if v_inicio is null or v_fin is null then
        raise exception 'No se entiende la fecha indicada.' using errcode = '22023';
      end if;

      return query select v_inicio, v_fin;
      return;
    end if;

    if p_starts_at is null or p_ends_at is null then
      raise exception 'La reserva necesita hora de inicio y de fin.' using errcode = '22023';
    end if;
    return query select p_starts_at, p_ends_at;
    return;
  end if;

  select * into v_act from activities where id = p_activity_id and church_id = p_church_id;
  if not found then
    raise exception 'La actividad no existe.' using errcode = 'P0002';
  end if;

  if v_act.starts_at is null or v_act.ends_at is null then
    raise exception 'Esta actividad todavía no tiene horario concreto: fíjalo antes de reservar recursos.'
      using errcode = '22023';
  end if;

  return query select v_act.starts_at, v_act.ends_at;
end;
$$;

revoke all on function app.reservation_window(uuid, uuid, timestamptz, timestamptz, text, text, text) from public, anon, authenticated;

-- La versión anterior de cuatro argumentos se retira para que no queden dos
-- caminos que puedan divergir.
drop function if exists app.reservation_window(uuid, uuid, timestamptz, timestamptz);

-- create_reservation pasa las tres claves nuevas tal como lleguen.
create or replace function app.create_reservation(p_church_id uuid, p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_resource_id uuid := nullif(p_input ->> 'resource_id', '')::uuid;
  v_activity_id uuid := nullif(p_input ->> 'activity_id', '')::uuid;
  v_responsible uuid := nullif(p_input ->> 'responsible_person_id', '')::uuid;
  v_purpose text := app.j_text(p_input, 'purpose');
  v_res resources%rowtype;
  v_ventana record;
  v_person uuid;
  v_status reservation_status;
  v_id uuid;
begin
  perform app.assert_church_member(p_church_id);

  v_person := app.current_person_id(p_church_id);
  if v_person is null then
    raise exception 'No perteneces a esta iglesia.' using errcode = '42501';
  end if;

  select * into v_res from resources where id = v_resource_id and church_id = p_church_id;
  if not found then
    raise exception 'El recurso no existe.' using errcode = 'P0002';
  end if;

  if not app.resource_cap(p_church_id, v_res.campus_id, v_res.id, 'facilities.create_reservation')
     and not app.resource_cap(p_church_id, v_res.campus_id, v_res.id, 'facilities.manage_reservations') then
    raise exception 'No tienes permiso para reservar este recurso.' using errcode = '42501';
  end if;

  if v_res.archived_at is not null then
    raise exception 'Este recurso está archivado.' using errcode = '22023';
  end if;

  if not v_res.reservable then
    raise exception 'Este recurso no admite reservas.' using errcode = '22023';
  end if;

  if v_res.status <> 'active' then
    raise exception 'Este recurso no está disponible ahora mismo (%).', v_res.status using errcode = '22023';
  end if;

  if v_purpose is null then
    raise exception 'Di para qué es la reserva.' using errcode = '22023';
  end if;

  select * into v_ventana from app.reservation_window(
    p_church_id, v_activity_id,
    nullif(p_input ->> 'starts_at', '')::timestamptz,
    nullif(p_input ->> 'ends_at', '')::timestamptz,
    app.j_text(p_input, 'local_start'),
    app.j_text(p_input, 'local_end'),
    app.j_text(p_input, 'timezone')
  );

  if v_ventana.ends_at <= v_ventana.starts_at then
    raise exception 'La hora de fin tiene que ser posterior a la de inicio.' using errcode = '22023';
  end if;

  v_status := case when v_res.requires_approval then 'pending' else 'confirmed' end;

  insert into resource_reservations (
    church_id, resource_id, activity_id, requested_by, responsible_person_id,
    starts_at, ends_at, status, purpose, notes
  ) values (
    p_church_id, v_resource_id, v_activity_id, v_person, coalesce(v_responsible, v_person),
    v_ventana.starts_at, v_ventana.ends_at, v_status, v_purpose, app.j_text(p_input, 'notes')
  )
  returning id into v_id;

  if v_status = 'confirmed' then
    perform app.occupy_resource(p_church_id, v_resource_id, 'reservation', v_id, null,
      v_ventana.starts_at, v_ventana.ends_at);
  end if;

  perform app.write_audit_log(p_church_id, 'reservation.created', 'resource_reservations', v_id,
    jsonb_build_object('resource_id', v_resource_id, 'status', v_status, 'activity_id', v_activity_id));

  return v_id;
end;
$$;

revoke all on function app.create_reservation(uuid, jsonb) from public, anon;
grant execute on function app.create_reservation(uuid, jsonb) to authenticated;

-- Y lo mismo para el mantenimiento, que se programa desde el mismo tipo de
-- formulario.
create or replace function app.maintenance_window(
  p_church_id uuid,
  p_input jsonb,
  p_actual_starts timestamptz,
  p_actual_ends timestamptz
)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_zona text;
begin
  if app.j_text(p_input, 'local_start') is not null and app.j_text(p_input, 'local_end') is not null then
    v_zona := coalesce(app.j_text(p_input, 'timezone'),
                       (select timezone from churches where id = p_church_id),
                       'Europe/Madrid');
    return query select
      app.local_to_instant(app.parse_local_timestamp(app.j_text(p_input, 'local_start')), v_zona),
      app.local_to_instant(app.parse_local_timestamp(app.j_text(p_input, 'local_end')), v_zona);
    return;
  end if;

  return query select
    coalesce(nullif(p_input ->> 'starts_at', '')::timestamptz, p_actual_starts),
    coalesce(nullif(p_input ->> 'ends_at', '')::timestamptz, p_actual_ends);
end;
$$;

revoke all on function app.maintenance_window(uuid, jsonb, timestamptz, timestamptz) from public, anon, authenticated;
