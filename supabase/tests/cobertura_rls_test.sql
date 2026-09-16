-- Cobertura de RLS: toda tabla con columna church_id debe tener RLS activo
-- (ENABLE + FORCE). Falla automáticamente si se añade una tabla tenant-aware
-- nueva sin protegerla. Ver docs/adr/0001 y docs/adr/0013.

begin;

select plan((
  select count(*)::int
  from information_schema.columns
  where table_schema = 'public'
    and column_name = 'church_id'
));

select ok(
  (
    select c.relrowsecurity and c.relforcerowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t.table_name
  ),
  format('Tabla %I tiene church_id: debe tener RLS ENABLE + FORCE activo', t.table_name)
)
from (
  select distinct table_name
  from information_schema.columns
  where table_schema = 'public' and column_name = 'church_id'
  order by table_name
) t;

select * from finish();
rollback;
