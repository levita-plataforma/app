-- Fase 12 (Diogo) · Analítica: capabilities.
--
-- analytics.read no sustituye las capabilities de los módulos fuente: cada
-- sub-métrica sensible del dashboard (Kids, detalle de comunicaciones) se
-- comprueba también contra la capability real de su módulo de origen dentro
-- de app.analytics_dashboard (ver 20261002000400). Ver docs/02-datos-y-rls.md
-- §10 y docs/FASE-12-ANALITICA.md.
insert into capabilities (key, description, module_key) values
  ('analytics.read', 'Ver el dashboard agregado de Informes', 'analytics'),
  ('analytics.export', 'Exportar los agregados de Informes en CSV', 'analytics');

insert into role_capabilities (role_key, capability_key)
select 'church_owner', key from capabilities where key like 'analytics.%'
union all
select 'church_admin', key from capabilities where key like 'analytics.%'
union all
select 'campus_admin', key from capabilities where key like 'analytics.%';

create or replace function app.require_analytics_module(p_church_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not app.module_enabled(p_church_id, 'analytics') then
    raise exception 'El módulo Informes no está activo para esta iglesia.'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function app.require_analytics_module(uuid) from public, anon;
grant execute on function app.require_analytics_module(uuid) to authenticated;
