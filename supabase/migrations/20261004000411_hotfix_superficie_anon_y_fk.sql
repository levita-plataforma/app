-- Fase 13 · Endurecimiento: escritura anónima y claves foráneas entre tenants.
--
-- Dos hallazgos de la auditoría, ninguno explotable hoy, los dos del mismo tipo:
-- una defensa que está puesta una sola vez y debería estarlo dos.

-- 1. Anon no escribe en ninguna tabla ----------------------------------------
--
-- Supabase concede privilegios por defecto sobre el esquema public a `anon` y
-- `authenticated` al crear el proyecto. Cada migración que crea una tabla tiene
-- que revocarlos a mano, y en 43 tablas del proyecto no se hizo: `anon` tiene
-- insert, update y delete sobre ellas, incluidas roles, role_capabilities,
-- subscriptions y platform_operators.
--
-- No es explotable: se comprobó tabla por tabla y TODAS tienen RLS habilitada y
-- forzada, así que una sesión anónima no llega a escribir ninguna fila. Pero la
-- protección depende entonces de una sola capa, y basta con que alguien añada
-- una política permisiva —o cree una tabla sin RLS— para que el grant que sobra
-- se convierta en la puerta.
--
-- La lectura NO se toca: hay superficie pública que depende de ella (la página
-- del evento público lee con políticas dirigidas a anon), y revocarla aquí a
-- ciegas rompería la Fase 6.

do $revoca_anon$
declare
  r record;
  v_contador integer := 0;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind = 'r'
      and exists (
        select 1 from information_schema.role_table_grants g
        where g.table_schema = 'public'
          and g.table_name = c.relname
          and g.grantee = 'anon'
          and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
      )
  loop
    execute format('revoke insert, update, delete, truncate on table public.%I from anon', r.relname);
    v_contador := v_contador + 1;
  end loop;

  raise notice 'Escritura anónima revocada en % tablas', v_contador;
end;
$revoca_anon$;

-- Y que no vuelva a pasar con las tablas que se creen a partir de ahora.
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon;

-- 2. Claves foráneas tenant-safe ----------------------------------------------
--
-- ADR 0014: una hija referencia a su padre por (id, church_id), no solo por id.
-- Sin la composición, nada a nivel de esquema impide que una fila de la iglesia
-- A apunte a una de la B; queda en manos de que todas las RPC lo comprueben, y
-- basta con que una se olvide.
--
-- Quedaban dos:
--
--   * activity_position_requirements.source_requirement_id: el requisito de
--     origen desde el que se copió uno de actividad. Apuntar al de otra iglesia
--     haría que una condición ajena influyera en quién puede servir aquí.
--   * audit_logs.support_session_id: la sesión de soporte durante la que se
--     registró una acción. Apuntar a la de otra iglesia mezclaría trazas.

-- El padre necesita el índice único compuesto para poder referenciarlo así.
alter table position_requirements
  add constraint position_requirements_id_church_unique unique (id, church_id);

alter table support_sessions
  add constraint support_sessions_id_church_unique unique (id, church_id);

alter table activity_position_requirements
  drop constraint activity_position_requirements_source_requirement_id_fkey;

alter table activity_position_requirements
  add constraint activity_position_requirements_source_requirement_fkey
  foreign key (source_requirement_id, church_id)
  references position_requirements (id, church_id) on delete set null;

alter table audit_logs
  drop constraint audit_logs_support_session_id_fkey;

alter table audit_logs
  add constraint audit_logs_support_session_fkey
  foreign key (support_session_id, church_id)
  references support_sessions (id, church_id) on delete set null;

comment on constraint activity_position_requirements_source_requirement_fkey
  on activity_position_requirements is
  'Compuesta con church_id (ADR 0014): el requisito de origen tiene que ser de la misma iglesia, y eso lo impone el esquema, no la confianza en que cada RPC lo compruebe.';
