-- Fase 10 · La capa de ocupación: adquirir, soltar y mover una franja.
-- Ver docs/CONTRATO-FASE-10.md §10 y riesgo 2.
--
-- Todo lo que ocupa un recurso pasa por aquí. Es el punto único donde se
-- adquiere el intervalo, y por eso es también el único sitio donde hay que
-- traducir el error de la restricción de exclusión a algo que una persona
-- entienda.
--
-- Estas funciones son internas: no se conceden a authenticated ni tienen
-- envoltorio público. Las llaman las RPC de reservas y de mantenimiento, que
-- son las que comprueban permisos.

-- app.occupancy_conflict_detail ------------------------------------------------
--
-- Qué hay en esa franja, para poder explicar el choque. Devuelve solo cuándo y
-- de qué tipo: nunca el título de la actividad ni quién la reservó. Saber que
-- una sala está cogida no da derecho a saber para qué (§47).

create or replace function app.occupancy_conflict_detail(
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_occupancy_id uuid default null
)
returns table (source occupancy_source, starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select o.source, lower(o.during), upper(o.during)
  from resource_occupancy o
  where o.resource_id = p_resource_id
    and o.during && tstzrange(p_starts_at, p_ends_at, '[)')
    and (p_exclude_occupancy_id is null or o.id <> p_exclude_occupancy_id)
  order by lower(o.during)
  limit 1;
$$;

revoke all on function app.occupancy_conflict_detail(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

-- app.raise_occupancy_conflict --------------------------------------------------
--
-- Un único sitio donde se redacta el conflicto, para que el mensaje sea el
-- mismo venga de una reserva, de una aprobación, de un mantenimiento o de
-- mover una actividad de hora.

create or replace function app.raise_occupancy_conflict(
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_occupancy_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_conflicto record;
  v_nombre text;
  v_zona text;
begin
  select r.name, coalesce(c.timezone, ch.timezone, 'Europe/Madrid')
  into v_nombre, v_zona
  from resources r
  join churches ch on ch.id = r.church_id
  left join campuses c on c.id = r.campus_id
  where r.id = p_resource_id;

  select * into v_conflicto
  from app.occupancy_conflict_detail(p_resource_id, p_starts_at, p_ends_at, p_exclude_occupancy_id);

  if v_conflicto is null then
    -- Puede pasar si la fila que estorbaba desapareció entre el fallo y esta
    -- consulta. Se informa igual, sin inventar un detalle que ya no existe.
    raise exception '% ya está ocupado en ese horario.', coalesce(v_nombre, 'El recurso')
      using errcode = '23P01';
  end if;

  raise exception '% ya está ocupado de % a % por %.',
    coalesce(v_nombre, 'El recurso'),
    to_char(v_conflicto.starts_at at time zone v_zona, 'DD/MM/YYYY HH24:MI'),
    to_char(v_conflicto.ends_at at time zone v_zona, 'DD/MM/YYYY HH24:MI'),
    case v_conflicto.source when 'maintenance' then 'un mantenimiento' else 'otra reserva' end
    using errcode = '23P01';
end;
$$;

revoke all on function app.raise_occupancy_conflict(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

-- app.occupy_resource -----------------------------------------------------------
--
-- Adquiere la franja. Si otra transacción la tiene a medio confirmar, esta
-- espera a que termine y entonces falla; no se cuela ni sobreescribe.

create or replace function app.occupy_resource(
  p_church_id uuid,
  p_resource_id uuid,
  p_source occupancy_source,
  p_reservation_id uuid,
  p_maintenance_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if p_ends_at <= p_starts_at then
    raise exception 'La hora de fin tiene que ser posterior a la de inicio.' using errcode = '22023';
  end if;

  begin
    insert into resource_occupancy (church_id, resource_id, source, reservation_id, maintenance_id, during)
    values (p_church_id, p_resource_id, p_source, p_reservation_id, p_maintenance_id,
            tstzrange(p_starts_at, p_ends_at, '[)'))
    returning id into v_id;
  exception when exclusion_violation then
    -- 23P01. Aquí es donde la garantía se convierte en un mensaje útil.
    perform app.raise_occupancy_conflict(p_resource_id, p_starts_at, p_ends_at);
  end;

  return v_id;
end;
$$;

comment on function app.occupy_resource(uuid, uuid, occupancy_source, uuid, uuid, timestamptz, timestamptz) is
  'Adquiere la franja de un recurso. Único punto de entrada a resource_occupancy: si una ruta de escritura no pasa por aquí, rompe la protección para todas las demás.';

revoke all on function app.occupy_resource(uuid, uuid, occupancy_source, uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- app.release_occupancy ----------------------------------------------------------

create or replace function app.release_occupancy(
  p_reservation_id uuid default null,
  p_maintenance_id uuid default null
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  delete from resource_occupancy
  where (p_reservation_id is not null and reservation_id = p_reservation_id)
     or (p_maintenance_id is not null and maintenance_id = p_maintenance_id);
$$;

comment on function app.release_occupancy(uuid, uuid) is
  'Suelta la franja de una reserva cancelada o de un mantenimiento que deja de bloquear.';

revoke all on function app.release_occupancy(uuid, uuid) from public, anon, authenticated;

-- app.move_occupancy --------------------------------------------------------------
--
-- Cambiar la franja de algo ya ocupado. Se hace con un update sobre la fila
-- existente, no borrando y volviendo a insertar: así la restricción sigue
-- vigente durante todo el cambio y no se abre un hueco por el que otra
-- transacción pudiera colarse.

create or replace function app.move_occupancy(
  p_reservation_id uuid,
  p_maintenance_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_fila record;
begin
  if p_ends_at <= p_starts_at then
    raise exception 'La hora de fin tiene que ser posterior a la de inicio.' using errcode = '22023';
  end if;

  select o.id, o.resource_id into v_fila
  from resource_occupancy o
  where (p_reservation_id is not null and o.reservation_id = p_reservation_id)
     or (p_maintenance_id is not null and o.maintenance_id = p_maintenance_id);

  if not found then
    -- No ocupaba nada: una reserva pendiente o un mantenimiento informativo.
    -- No es un error, simplemente no hay franja que mover.
    return;
  end if;

  begin
    update resource_occupancy
    set during = tstzrange(p_starts_at, p_ends_at, '[)')
    where id = v_fila.id;
  exception when exclusion_violation then
    perform app.raise_occupancy_conflict(v_fila.resource_id, p_starts_at, p_ends_at, v_fila.id);
  end;
end;
$$;

comment on function app.move_occupancy(uuid, uuid, timestamptz, timestamptz) is
  'Mueve una franja ya adquirida. Update en vez de borrar y reinsertar: sin hueco intermedio por el que otra transacción pueda entrar.';

revoke all on function app.move_occupancy(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- app.resource_is_available -------------------------------------------------------
--
-- Consulta de disponibilidad para pintar la interfaz. Es informativa: dice lo
-- que hay ahora mismo, no reserva nada. La decisión de verdad la toma la
-- restricción al adquirir, y por eso la interfaz nunca puede prometer que algo
-- está libre.

create or replace function app.resource_is_available(
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_reservation_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select not exists (
    select 1
    from resource_occupancy o
    where o.resource_id = p_resource_id
      and o.during && tstzrange(p_starts_at, p_ends_at, '[)')
      and (p_exclude_reservation_id is null or o.reservation_id is distinct from p_exclude_reservation_id)
  );
$$;

comment on function app.resource_is_available(uuid, timestamptz, timestamptz, uuid) is
  'Si la franja está libre AHORA. Informativa: entre esta consulta y la reserva puede entrar otra persona, y quien decide es la restricción de exclusión.';

revoke all on function app.resource_is_available(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function app.resource_is_available(uuid, timestamptz, timestamptz, uuid) to authenticated;

create or replace function public.resource_is_available(
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_reservation_id uuid default null
)
returns boolean
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.resource_is_available(p_resource_id, p_starts_at, p_ends_at, p_exclude_reservation_id);
$$;

revoke all on function public.resource_is_available(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.resource_is_available(uuid, timestamptz, timestamptz, uuid) to authenticated;
