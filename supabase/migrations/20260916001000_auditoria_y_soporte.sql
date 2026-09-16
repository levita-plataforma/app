-- Fase 0 · Auditoría y support sessions.
-- Ver docs/adr/0007-auditoria.md y docs/adr/0012-support-impersonation.md.

create table support_sessions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  operator_user_id uuid not null references auth.users (id),
  reason text not null,
  capabilities text[] not null default '{}',
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table support_sessions is
  'Sesión temporal y auditada de soporte de operación LEVITA sobre un tenant. Expiración obligatoria. Ver docs/adr/0012.';

alter table support_sessions add constraint support_sessions_id_unique unique (id, church_id);
create index support_sessions_church_id_idx on support_sessions (church_id);
create index support_sessions_operator_idx on support_sessions (operator_user_id);

-- app.support_session_active(church): ¿hay sesión de soporte activa? ---------
create or replace function app.support_session_active(p_church_id uuid)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from support_sessions
    where church_id = p_church_id
      and operator_user_id = auth.uid()
      and revoked_at is null
      and expires_at > now()
  );
$$;

revoke all on function app.support_session_active(uuid) from public, anon;
grant execute on function app.support_session_active(uuid) to authenticated;

alter table support_sessions enable row level security;
alter table support_sessions force row level security;

-- Solo el propio operador ve/gestiona sus sesiones. La gestión de a quién se
-- le permite crear sesiones de soporte se resuelve con un rol de plataforma
-- separado, fuera del alcance de la Fase 0 (ver docs/adr/0012).
create policy support_sessions_select_own on support_sessions
  for select to authenticated
  using ( operator_user_id = auth.uid() );

-- audit_logs -------------------------------------------------------------
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  church_id uuid references churches (id) on delete cascade,
  actor_person_id uuid,
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  correlation_id uuid,
  origin text,
  support_session_id uuid references support_sessions (id),
  created_at timestamptz not null default now()
);

comment on table audit_logs is
  'Registro de auditoría de acciones administrativas relevantes. Nunca contiene secretos, tokens ni contenido pastoral/financiero completo. Ver docs/adr/0007.';

create index audit_logs_church_id_idx on audit_logs (church_id);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id);
create index audit_logs_created_at_idx on audit_logs (created_at);

alter table audit_logs enable row level security;
alter table audit_logs force row level security;

create policy audit_logs_select on audit_logs
  for select to authenticated
  using (
    church_id is not null
    and (select app.has_capability(church_id, 'audit.read'))
  );

-- Solo se inserta vía función security definer (app.write_audit_log), nunca
-- por INSERT directo del cliente: no existe policy de insert para
-- authenticated a propósito.

create or replace function app.write_audit_log(
  p_church_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb,
  p_correlation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_actor_person_id uuid;
  v_support_session_id uuid;
begin
  select app.current_person_id(p_church_id) into v_actor_person_id;

  select id into v_support_session_id
  from support_sessions
  where church_id = p_church_id
    and operator_user_id = auth.uid()
    and revoked_at is null
    and expires_at > now()
  limit 1;

  insert into audit_logs (
    church_id, actor_person_id, actor_user_id, action,
    entity_type, entity_id, metadata, correlation_id, support_session_id
  ) values (
    p_church_id, v_actor_person_id, auth.uid(), p_action,
    p_entity_type, p_entity_id, p_metadata, p_correlation_id, v_support_session_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function app.write_audit_log(uuid, text, text, uuid, jsonb, uuid) from public, anon;
grant execute on function app.write_audit_log(uuid, text, text, uuid, jsonb, uuid) to authenticated;
