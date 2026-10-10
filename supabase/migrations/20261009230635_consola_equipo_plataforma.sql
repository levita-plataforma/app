-- Consola · Equipo de plataforma (CA-3.1)
--
-- Conceder y retirar capacidades existe desde CA-0 y ninguna pantalla podía
-- llamarlo: no había wrapper público, ni listado del equipo, ni forma de dar de
-- alta o retirar a nadie. Añadir a alguien al equipo de LEVITA o quitarle
-- permisos exigía entrar a la base a mano, que es justo lo que el panel
-- pretende evitar.
--
-- Y la protección del «último gestor» tenía una carrera, comprobada con dos
-- conexiones sobre esta misma base: con dos cuentas gestoras, si A retira la de
-- B mientras B retira la de A, las dos transacciones cuentan dos, las dos se
-- creen a salvo y las dos borran. Quedan cero. A partir de ahí nadie puede
-- gestionar operadores desde el panel, y recuperarse exige abrir la base,
-- porque bootstrap_platform_operator no está concedida a nadie a propósito.
--
-- El arreglo es un cerrojo de transacción sobre la capacidad crítica: las
-- retiradas que pueden dejar la plataforma sin gestión se ponen en fila, y la
-- segunda ya cuenta el estado que dejó la primera.

-- 1. Ver el equipo -------------------------------------------------------------
--
-- platform_operators solo tenía política «veo mi propia fila», así que ni
-- siquiera quien gestiona operadores podía listar el equipo. Se añade la lectura
-- para quien tiene la capacidad, igual que ya ocurre con sus capacidades.
--
-- La comprobación va por app.has_platform_capability, que es security definer y
-- no vuelve a pasar por RLS: consultar aquí la propia tabla reproduciría la
-- recursión infinita que hubo que arreglar el 07/10 en las capacidades.

create policy platform_operators_select_team on platform_operators
  for select to authenticated
  using ( app.has_platform_capability('platform.operators.manage') );

create or replace function app.platform_team()
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  capabilities text[],
  es_uno_mismo boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  perform app.assert_platform_capability('platform.operators.manage');

  return query
  select
    o.user_id,
    u.email::text,
    o.created_at,
    coalesce(
      (select array_agg(c.capability_key order by c.capability_key)
       from platform_operator_capabilities c
       where c.user_id = o.user_id),
      array[]::text[]
    ),
    o.user_id = auth.uid()
  from platform_operators o
  join auth.users u on u.id = o.user_id
  order by o.created_at;
end;
$$;

comment on function app.platform_team() is
  'Equipo de operación de LEVITA con sus capacidades. Exige platform.operators.manage. Muestra el correo porque sin él no se puede distinguir a dos compañeros, y son cuentas del propio equipo, no personas de las iglesias: por eso no se audita cada consulta, a diferencia de los contactos de una iglesia.';

revoke all on function app.platform_team() from public, anon;
grant execute on function app.platform_team() to authenticated;

create or replace function public.platform_team()
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  capabilities text[],
  es_uno_mismo boolean
)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.platform_team();
$$;

revoke all on function public.platform_team() from public, anon;
grant execute on function public.platform_team() to authenticated;

-- 2. El catálogo, para que la pantalla no lo escriba a mano ---------------------
--
-- Sin esto la interfaz tendría que repetir la lista de capacidades, y en cuanto
-- se añadiera una en la base quedaría invisible en el panel. Ya pasó con los
-- estados de comunicación en la Fase 13.

create or replace function app.platform_capability_catalog()
returns table (key text, description text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  perform app.assert_platform_capability('platform.operators.manage');
  return query select c.key, c.description from platform_capabilities c order by c.key;
end;
$$;

revoke all on function app.platform_capability_catalog() from public, anon;
grant execute on function app.platform_capability_catalog() to authenticated;

create or replace function public.platform_capability_catalog()
returns table (key text, description text)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.platform_capability_catalog();
$$;

revoke all on function public.platform_capability_catalog() from public, anon;
grant execute on function public.platform_capability_catalog() to authenticated;

-- 3. Dar de alta a alguien del equipo ------------------------------------------
--
-- Por correo, y solo si esa persona ya tiene cuenta en LEVITA. No se inventa un
-- flujo de invitación de operadores: no existe, y fingirlo dejaría una fila
-- apuntando a una cuenta que nadie puede usar.
--
-- Entra sin ninguna capacidad. Pertenecer al equipo y poder hacer algo son cosas
-- distintas, y mezclarlas convertiría el alta en una concesión en blanco.

create or replace function app.platform_add_operator(p_email text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
begin
  perform app.assert_platform_capability('platform.operators.manage');

  if p_email is null or btrim(p_email) = '' then
    raise exception 'Indica el correo de la persona.' using errcode = '22023';
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(btrim(p_email));

  if v_user_id is null then
    raise exception 'No hay ninguna cuenta de LEVITA con ese correo. Esa persona tiene que registrarse antes de poder entrar al equipo.'
      using errcode = 'P0002';
  end if;

  if exists (select 1 from platform_operators where user_id = v_user_id) then
    raise exception 'Esa cuenta ya está en el equipo.' using errcode = '23505';
  end if;

  insert into platform_operators (user_id, granted_by) values (v_user_id, auth.uid());

  perform app.write_platform_audit('platform.operator_added', null,
    jsonb_build_object('target_user', v_user_id));

  return v_user_id;
end;
$$;

revoke all on function app.platform_add_operator(text) from public, anon;
grant execute on function app.platform_add_operator(text) to authenticated;

create or replace function public.platform_add_operator(p_email text)
returns uuid
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.platform_add_operator(p_email);
$$;

revoke all on function public.platform_add_operator(text) from public, anon;
grant execute on function public.platform_add_operator(text) to authenticated;

-- 4. Retirar a alguien del equipo ----------------------------------------------
--
-- Borrar el operador arrastra sus capacidades por la clave ajena, así que esta
-- vía podía saltarse la protección del último gestor sin tocarla. Aquí se
-- comprueba igual, y bajo el mismo cerrojo.

create or replace function app.platform_remove_operator(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform app.assert_platform_capability('platform.operators.manage');

  -- Antes de contar: ver punto 5.
  perform pg_advisory_xact_lock(hashtext('levita:platform.operators.manage'));

  if not exists (select 1 from platform_operators where user_id = p_user_id) then
    raise exception 'Esa cuenta no está en el equipo.' using errcode = 'P0002';
  end if;

  if exists (
       select 1 from platform_operator_capabilities
       where user_id = p_user_id and capability_key = 'platform.operators.manage'
     )
     and (select count(*) from platform_operator_capabilities
          where capability_key = 'platform.operators.manage') <= 1 then
    raise exception 'Es la última cuenta que puede gestionar operadores: da la capacidad a otra persona antes de retirarla.'
      using errcode = '22023';
  end if;

  delete from platform_operators where user_id = p_user_id;

  perform app.write_platform_audit('platform.operator_removed', null,
    jsonb_build_object('target_user', p_user_id));
end;
$$;

revoke all on function app.platform_remove_operator(uuid) from public, anon;
grant execute on function app.platform_remove_operator(uuid) to authenticated;

create or replace function public.platform_remove_operator(p_user_id uuid)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.platform_remove_operator(p_user_id);
$$;

revoke all on function public.platform_remove_operator(uuid) from public, anon;
grant execute on function public.platform_remove_operator(uuid) to authenticated;

-- 5. La carrera de la retirada --------------------------------------------------
--
-- Mismo cuerpo que en CA-0 salvo el cerrojo. Se toma antes de contar y dura lo
-- que dure la transacción: dos retiradas de la capacidad crítica no pueden
-- solaparse, y la segunda cuenta lo que dejó la primera.
--
-- Es un cerrojo consultivo, no un bloqueo de filas, porque lo que hay que
-- proteger no es una fila concreta sino «cuántas quedan»: A borra la fila de B
-- y B la de A, que son filas distintas y nunca se estorbarían.

create or replace function app.revoke_platform_capability(p_user_id uuid, p_capability text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform app.assert_platform_capability('platform.operators.manage');

  if p_capability = 'platform.operators.manage' then
    perform pg_advisory_xact_lock(hashtext('levita:platform.operators.manage'));

    -- Quitársela a uno mismo sí se permite: reducir el propio acceso nunca es
    -- una escalada. Lo que se impide es quedarse sin nadie que pueda gestionar
    -- operadores, que dejaría la plataforma sin salida.
    if (select count(*) from platform_operator_capabilities
        where capability_key = 'platform.operators.manage') <= 1 then
      raise exception 'Es la última cuenta que puede gestionar operadores: concede la capacidad a otra persona antes de retirarla.'
        using errcode = '22023';
    end if;
  end if;

  delete from platform_operator_capabilities
  where user_id = p_user_id and capability_key = p_capability;

  perform app.write_platform_audit('platform.capability_revoked', null,
    jsonb_build_object('target_user', p_user_id, 'capability', p_capability));
end;
$$;

-- 6. Wrappers de conceder y retirar capacidad -----------------------------------
--
-- Las funciones de app ya existían; lo que faltaba era poder llamarlas desde la
-- aplicación.

create or replace function public.platform_grant_capability(p_user_id uuid, p_capability text)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.grant_platform_capability(p_user_id, p_capability);
$$;

revoke all on function public.platform_grant_capability(uuid, text) from public, anon;
grant execute on function public.platform_grant_capability(uuid, text) to authenticated;

create or replace function public.platform_revoke_capability(p_user_id uuid, p_capability text)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.revoke_platform_capability(p_user_id, p_capability);
$$;

revoke all on function public.platform_revoke_capability(uuid, text) from public, anon;
grant execute on function public.platform_revoke_capability(uuid, text) to authenticated;
