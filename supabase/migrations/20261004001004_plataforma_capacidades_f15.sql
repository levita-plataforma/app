-- Fase 15 · Capacidades de plataforma por función, y estados separados.
--
-- F14 dejó cinco capacidades para lo que entonces hacía el panel: mirar
-- iglesias, darlas de alta, tocar responsables, encender módulos y gestionar el
-- equipo. F15 añade dinero, procesos y soporte, que son competencias distintas
-- y que no deben venir en el mismo paquete: quien atiende una incidencia no
-- tiene por qué poder cambiar un precio.

-- 1. Capacidades nuevas --------------------------------------------------------

insert into platform_capabilities (key, description) values
  ('platform.commercial.read',   'Ver planes, suscripciones y excepciones comerciales'),
  ('platform.commercial.manage', 'Cambiar de plan, conceder excepciones y cancelar suscripciones'),
  ('platform.operations.read',   'Ver procesos, trabajos, webhooks y sus errores'),
  ('platform.operations.retry',  'Reintentar operaciones que se puedan repetir sin efectos duplicados'),
  ('platform.support.manage',    'Abrir y revocar sesiones de soporte sobre una iglesia'),
  ('platform.audit.read',        'Consultar la auditoría de operaciones de plataforma'),
  ('platform.config.manage',     'Cambiar la disponibilidad de planes y módulos')
on conflict (key) do nothing;

-- 2. Los estados dejan de ser uno solo ------------------------------------------
--
-- `churches.status` mezclaba tres preguntas distintas en un enum: en qué punto
-- del ciclo de vida está la iglesia (`provisioning`, `archived`), cómo va su
-- relación comercial (`trial`, `past_due`, `cancelling`) y si está castigada
-- (`suspended`, sin decir por qué).
--
-- Mezclarlas obliga a elegir: una iglesia que no ha pagado Y tiene un problema
-- de seguridad solo podía estar en uno de los dos estados, y al resolver uno se
-- perdía el otro. Se separan en dimensiones que conviven.
--
-- El enum NO se toca: sigue siendo la fuente del ciclo de vida y lo usan
-- migraciones ya aplicadas. Lo que se añade son las otras dos dimensiones.

alter table churches
  add column if not exists security_block_reason text,
  add column if not exists security_blocked_at timestamptz,
  add column if not exists security_blocked_by uuid references auth.users (id) on delete set null,
  add column if not exists maintenance_until timestamptz,
  add column if not exists maintenance_reason text;

comment on column churches.security_block_reason is
  'Por qué está bloqueada por seguridad. Su presencia ES el bloqueo: no hay un booleano aparte que pueda desincronizarse del motivo. Nada que ver con la situación comercial.';
comment on column churches.maintenance_until is
  'Hasta cuándo está en mantenimiento. Pasada esa hora deja de estarlo sola, sin que nadie tenga que acordarse de quitarlo.';

-- Un bloqueo sin motivo es un bloqueo que nadie sabe levantar.
alter table churches
  drop constraint if exists churches_security_block_coherente_check;
alter table churches
  add constraint churches_security_block_coherente_check
  check (
    (security_block_reason is null and security_blocked_at is null)
    or (security_block_reason is not null and btrim(security_block_reason) <> '' and security_blocked_at is not null)
  );

alter table churches
  drop constraint if exists churches_maintenance_coherente_check;
alter table churches
  add constraint churches_maintenance_coherente_check
  check (
    maintenance_until is null
    or (maintenance_reason is not null and btrim(maintenance_reason) <> '')
  );

create index if not exists churches_security_blocked_idx
  on churches (security_blocked_at) where security_block_reason is not null;

-- 3. Una sola función que responde «¿en qué situación está?» --------------------
--
-- Que las dimensiones estén separadas no significa que cada pantalla tenga que
-- recomponerlas por su cuenta: eso acabaría en tres versiones distintas de la
-- misma regla. Esta función es el único sitio donde se juntan.
--
-- Devuelve las razones, en plural y por orden de gravedad, no un veredicto
-- único. Quién decide qué se impide con cada una es una política que todavía no
-- está acordada (ver docs/FASE-15-GESTION-COMERCIAL.md), y esta función no la
-- inventa: informa.

create or replace function app.church_service_state(p_church_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'lifecycle', c.status::text,
    'commercial', coalesce(s.status::text, 'sin_suscripcion'),
    'security_blocked', c.security_block_reason is not null,
    'security_block_reason', c.security_block_reason,
    'in_maintenance', c.maintenance_until is not null and c.maintenance_until > now(),
    'maintenance_until', c.maintenance_until,
    'archived', c.archived_at is not null,
    -- Las razones por las que el servicio no es normal, todas las que haya.
    'reasons', (
      select coalesce(jsonb_agg(r order by r), '[]'::jsonb)
      from (
        select 'security_block' as r where c.security_block_reason is not null
        union all
        select 'archived' where c.archived_at is not null or c.status = 'archived'
        union all
        select 'maintenance' where c.maintenance_until is not null and c.maintenance_until > now()
        union all
        select 'commercial' where s.status in ('suspended', 'cancelled')
        union all
        select 'provisioning' where c.status = 'provisioning'
      ) x
    )
  )
  from churches c
  left join subscriptions s on s.church_id = c.id
  where c.id = p_church_id;
$$;

comment on function app.church_service_state(uuid) is
  'Las cuatro dimensiones del estado de una iglesia en una sola lectura, con TODAS las razones por las que su servicio no es normal. No decide qué se bloquea: eso es una política acordada, no una propiedad del dato.';

revoke all on function app.church_service_state(uuid) from public, anon, authenticated;
grant execute on function app.church_service_state(uuid) to authenticated;

-- 4. Bloquear y desbloquear por seguridad ---------------------------------------
--
-- Va con `platform.support.manage` y no con la capacidad comercial a propósito:
-- bloquear por seguridad no es una decisión de negocio, y quien lleva los
-- precios no tiene por qué poder dejar a una iglesia fuera.

create or replace function app.platform_set_security_block(
  p_church_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existe boolean;
  v_anterior text;
begin
  perform app.assert_platform_capability('platform.support.manage');

  select true, security_block_reason into v_existe, v_anterior
  from churches where id = p_church_id;

  if not coalesce(v_existe, false) then
    raise exception 'La iglesia no existe.' using errcode = 'P0002';
  end if;

  if p_reason is not null and btrim(p_reason) = '' then
    raise exception 'El motivo del bloqueo no puede estar vacío.' using errcode = '22023';
  end if;

  update churches
  set security_block_reason = nullif(btrim(coalesce(p_reason, '')), ''),
      security_blocked_at = case when p_reason is null then null else now() end,
      security_blocked_by = case when p_reason is null then null else auth.uid() end,
      updated_at = now()
  where id = p_church_id;

  perform app.write_platform_audit(
    case when p_reason is null then 'church.security_unblocked' else 'church.security_blocked' end,
    p_church_id,
    jsonb_build_object('reason', p_reason, 'previous_reason', v_anterior)
  );
end;
$$;

revoke all on function app.platform_set_security_block(uuid, text) from public, anon, authenticated;
grant execute on function app.platform_set_security_block(uuid, text) to authenticated;

create or replace function public.platform_set_security_block(p_church_id uuid, p_reason text)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.platform_set_security_block(p_church_id, p_reason); $$;

revoke all on function public.platform_set_security_block(uuid, text) from public, anon;
grant execute on function public.platform_set_security_block(uuid, text) to authenticated;

create or replace function public.church_service_state(p_church_id uuid)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.church_service_state(p_church_id); $$;

revoke all on function public.church_service_state(uuid) from public, anon;
grant execute on function public.church_service_state(uuid) to authenticated;
