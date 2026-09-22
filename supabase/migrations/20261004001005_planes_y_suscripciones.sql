-- Fase 15 · Catálogo de planes versionado, suscripción y excepciones.
--
-- Hoy `subscriptions.plan_key` es texto libre y `plan_entitlements` está vacía:
-- no hay catálogo, ni precios, ni forma de saber qué incluía un plan cuando
-- alguien lo contrató.
--
-- El problema que resuelve el versionado: si los planes fueran una tabla plana,
-- subir el precio o recortar un límite cambiaría en el acto lo que tienen
-- contratado las iglesias que ya estaban. Eso no es una decisión de producto que
-- se pueda tomar sin querer desde un formulario. Aquí un plan se edita creando
-- una versión nueva, y las suscripciones vigentes siguen apuntando a la suya.
--
-- Lo que esta migración NO hace: fijar planes, precios ni periodos. El catálogo
-- nace vacío porque esas decisiones son de Carlos y no se inventan aquí. La
-- estructura no presupone ninguna.

-- 1. Planes --------------------------------------------------------------------

create table plans (
  key text primary key,
  name text not null,
  description text,
  -- Si se puede contratar HOY. Retirar un plan del escaparate no toca a quien
  -- ya lo tiene: son cosas distintas y por eso son dos campos distintos.
  available_for_signup boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint plans_key_no_vacia_check check (btrim(key) <> ''),
  constraint plans_name_no_vacia_check check (btrim(name) <> '')
);

comment on table plans is
  'Catálogo comercial de LEVITA hacia las iglesias. Nada que ver con el módulo Giving, que son las donaciones que recibe una iglesia: eso es dinero de la iglesia y esto es la cuota que la iglesia paga.';
comment on column plans.available_for_signup is
  'Si admite contrataciones nuevas. Ponerlo en false NO afecta a quien ya lo tiene contratado.';

create table plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null references plans (key) on delete restrict,
  version integer not null,
  -- Precio en la unidad mínima (céntimos) para no arrastrar decimales binarios
  -- en dinero. Nulo mientras no haya precio acordado, que es hoy.
  price_cents integer,
  currency text not null default 'EUR',
  billing_period text not null default 'monthly',
  trial_days integer,
  effective_from timestamptz not null default now(),
  -- Hasta cuándo se pudo contratar esta versión. Nulo = es la vigente.
  effective_until timestamptz,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (plan_key, version),
  constraint plan_versions_precio_check check (price_cents is null or price_cents >= 0),
  constraint plan_versions_moneda_check check (currency ~ '^[A-Z]{3}$'),
  constraint plan_versions_periodo_check check (billing_period in ('monthly', 'yearly')),
  constraint plan_versions_prueba_check check (trial_days is null or trial_days between 0 and 365),
  constraint plan_versions_vigencia_check check (effective_until is null or effective_until > effective_from)
);

comment on table plan_versions is
  'Cada edición de un plan es una versión nueva. Las suscripciones apuntan a una versión concreta, así que cambiar el catálogo nunca altera lo que alguien ya tiene contratado.';
comment on column plan_versions.price_cents is
  'En céntimos. Nulo significa «sin precio acordado», que es distinto de gratis: no se rellena con 0 por comodidad.';


-- Los límites que incluye cada versión.
create table plan_version_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_version_id uuid not null references plan_versions (id) on delete cascade,
  capability text not null,
  -- Nulo = sin límite. La presencia de la fila es lo que concede.
  limit_value integer,
  created_at timestamptz not null default now(),
  unique (plan_version_id, capability),
  constraint plan_version_entitlements_limite_check check (limit_value is null or limit_value >= 0)
);

comment on table plan_version_entitlements is
  'Qué incluye una versión de plan. limit_value nulo es «sin límite»; que no haya fila es «no incluido». Sustituye a plan_entitlements, que nació en la Fase 0 y nunca llegó a tener una fila.';

-- 2. La suscripción, con lo que le faltaba --------------------------------------

alter table subscriptions
  add column if not exists plan_version_id uuid references plan_versions (id) on delete restrict,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists scheduled_plan_version_id uuid references plan_versions (id) on delete restrict,
  add column if not exists scheduled_change_at timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;

comment on column subscriptions.plan_version_id is
  'La versión concreta contratada. plan_key se conserva por compatibilidad con lo ya escrito, pero la fuente de verdad de qué incluye la suscripción es esta.';
comment on column subscriptions.scheduled_plan_version_id is
  'Cambio de plan programado para el final del periodo. Mientras no llegue, lo que rige sigue siendo plan_version_id.';
comment on column subscriptions.cancel_at_period_end is
  'Cancelar al final del periodo frente a cancelar ya. Sin este campo habría que elegir una de las dos y la otra sería imposible de expresar.';

alter table subscriptions
  drop constraint if exists subscriptions_cambio_programado_check;
alter table subscriptions
  add constraint subscriptions_cambio_programado_check
  check (
    (scheduled_plan_version_id is null and scheduled_change_at is null)
    or (scheduled_plan_version_id is not null and scheduled_change_at is not null)
  );

alter table subscriptions
  drop constraint if exists subscriptions_periodo_check;
alter table subscriptions
  add constraint subscriptions_periodo_check
  check (current_period_end is null or current_period_start is null or current_period_end > current_period_start);

create index if not exists subscriptions_periodo_idx
  on subscriptions (current_period_end) where current_period_end is not null;
create index if not exists subscriptions_cambio_idx
  on subscriptions (scheduled_change_at) where scheduled_change_at is not null;

-- 3. Historial comercial ---------------------------------------------------------
--
-- `platform_audit_logs` registra quién hizo qué, pero está pensada para
-- auditoría y no para responder «qué condiciones tenía esta iglesia en marzo».
-- Esto es lo segundo: un historial consultable de condiciones efectivas.

create table subscription_history (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  event text not null,
  from_plan_version_id uuid references plan_versions (id) on delete set null,
  to_plan_version_id uuid references plan_versions (id) on delete set null,
  from_status subscription_status,
  to_status subscription_status,
  reason text,
  actor_user_id uuid references auth.users (id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint subscription_history_event_check check (btrim(event) <> ''),
  constraint subscription_history_metadata_check check (jsonb_typeof(metadata) = 'object')
);

comment on table subscription_history is
  'Qué condiciones tuvo cada iglesia y desde cuándo. Se conserva aunque la versión del plan se retire del catálogo: por eso las claves foráneas son «set null» y no «cascade».';

create index subscription_history_church_idx on subscription_history (church_id, occurred_at desc);

-- 4. Excepciones comerciales ------------------------------------------------------
--
-- La tabla existía desde la Fase 0 con motivo y caducidad, pero sin fecha de
-- inicio ni forma de saber quién la concedió de verdad: `granted_by` era un uuid
-- suelto que nadie rellenaba.

alter table church_entitlement_overrides
  add column if not exists starts_at timestamptz not null default now(),
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references auth.users (id) on delete set null;

comment on column church_entitlement_overrides.starts_at is
  'Desde cuándo aplica. Sin esto no se podía conceder una excepción que empiece el mes que viene, ni saber si una excepción ya estaba activa en una fecha pasada.';

alter table church_entitlement_overrides
  drop constraint if exists church_entitlement_overrides_vigencia_check;
alter table church_entitlement_overrides
  add constraint church_entitlement_overrides_vigencia_check
  check (expires_at is null or expires_at > starts_at);

create index if not exists church_entitlement_overrides_vigentes_idx
  on church_entitlement_overrides (church_id, expires_at)
  where revoked_at is null;

-- 5. Qué tiene derecho a usar una iglesia, ahora mismo ------------------------------
--
-- Un único sitio donde se resuelve la pregunta, en vez de que cada pantalla
-- combine plan y excepciones a su manera. Una excepción vencida deja de aplicar
-- sola: no hace falta que nadie la borre, y por eso el vencimiento se comprueba
-- aquí y no con un proceso nocturno que podría no correr.

create or replace function app.church_entitlements(p_church_id uuid)
returns table (capability text, limit_value integer, source text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with del_plan as (
    select pve.capability, pve.limit_value
    from subscriptions s
    join plan_version_entitlements pve on pve.plan_version_id = s.plan_version_id
    where s.church_id = p_church_id
  ),
  excepciones as (
    select o.capability, o.limit_value
    from church_entitlement_overrides o
    where o.church_id = p_church_id
      and o.revoked_at is null
      and o.starts_at <= now()
      and (o.expires_at is null or o.expires_at > now())
  )
  select e.capability, e.limit_value, 'override'::text from excepciones e
  union all
  select p.capability, p.limit_value, 'plan'::text
  from del_plan p
  where not exists (select 1 from excepciones e where e.capability = p.capability);
$$;

comment on function app.church_entitlements(uuid) is
  'Los derechos vigentes de una iglesia: los de su versión de plan, con las excepciones vigentes por encima. Una excepción caducada o revocada no aparece, sin que nadie tenga que limpiarla.';

revoke all on function app.church_entitlements(uuid) from public, anon, authenticated;
grant execute on function app.church_entitlements(uuid) to authenticated;

create or replace function public.church_entitlements(p_church_id uuid)
returns table (capability text, limit_value integer, source text)
language sql security invoker set search_path = pg_catalog, public
as $$ select * from app.church_entitlements(p_church_id); $$;

revoke all on function public.church_entitlements(uuid) from public, anon;
grant execute on function public.church_entitlements(uuid) to authenticated;

-- 6. RLS -------------------------------------------------------------------------
--
-- El catálogo lo lee cualquier cuenta autenticada: una iglesia tiene derecho a
-- saber qué planes hay. Escribir es solo de plataforma, y se hace por RPC.

alter table plans enable row level security;
alter table plans force row level security;
alter table plan_versions enable row level security;
alter table plan_versions force row level security;
alter table plan_version_entitlements enable row level security;
alter table plan_version_entitlements force row level security;
alter table subscription_history enable row level security;
alter table subscription_history force row level security;

revoke all on table plans from public, anon, authenticated;
revoke all on table plan_versions from public, anon, authenticated;
revoke all on table plan_version_entitlements from public, anon, authenticated;
revoke all on table subscription_history from public, anon, authenticated;

grant select on table plans to authenticated;
grant select on table plan_versions to authenticated;
grant select on table plan_version_entitlements to authenticated;
grant select on table subscription_history to authenticated;

create policy plans_select on plans
  for select to authenticated using (true);

create policy plan_versions_select on plan_versions
  for select to authenticated using (true);

create policy plan_version_entitlements_select on plan_version_entitlements
  for select to authenticated using (true);

-- El historial comercial es de la iglesia y del equipo de plataforma. Un
-- miembro cualquiera no tiene por qué ver cuándo se le bajó el plan.
create policy subscription_history_select on subscription_history
  for select to authenticated
  using (
    app.has_platform_capability('platform.commercial.read')
    or (church_id = any (app.church_ids_for_user()) and app.has_capability(church_id, 'settings.manage'))
  );
