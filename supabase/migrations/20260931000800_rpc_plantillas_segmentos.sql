-- Fase 9 · Las RPC que faltaban para plantillas y segmentos.
--
-- La migración de RLS revoca insert, update y delete sobre las cuatro tablas de
-- la fase y su comentario dice que «toda escritura pasa por RPC security
-- definer». Para comunicaciones es cierto; para plantillas y segmentos esa RPC
-- no existía, y el servidor escribía directamente con el cliente del usuario.
--
-- Resultado: crear o archivar una plantilla o un segmento fallaba siempre con
-- permiso denegado. Media fase no arrancaba, y la suite no lo detectaba porque
-- probaba las funciones y no el camino que usa la aplicación.
--
-- Se completa el patrón en vez de abrir la escritura directa: la validación de
-- las reglas y de los placeholders ya vive en triggers, y las capacidades
-- manage_segments y manage_templates existían desde 20260931000400 sin que
-- nada las comprobara.

-- Plantillas -------------------------------------------------------------------

create or replace function app.save_communication_template(p_church_id uuid, p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := nullif(p_input ->> 'id', '')::uuid;
  v_name text := app.j_text(p_input, 'name');
  v_body text := app.j_text(p_input, 'body');
  v_placeholders text[];
begin
  perform app.assert_church_member(p_church_id);

  if not app.has_capability(p_church_id, 'communications.manage_templates') then
    raise exception 'No tienes permiso para gestionar plantillas.' using errcode = '42501';
  end if;

  if p_input ? 'placeholders_allowed' and jsonb_typeof(p_input -> 'placeholders_allowed') = 'array' then
    select coalesce(array_agg(value::text), array['first_name', 'church_name'])
    into v_placeholders
    from jsonb_array_elements_text(p_input -> 'placeholders_allowed') as value;
  else
    v_placeholders := array['first_name', 'church_name'];
  end if;

  if v_id is null then
    if v_name is null or v_body is null then
      raise exception 'La plantilla necesita nombre y cuerpo.' using errcode = '22023';
    end if;

    insert into communication_templates (
      church_id, name, subject, body, placeholders_allowed, category, created_by_person_id
    ) values (
      p_church_id, v_name, app.j_text(p_input, 'subject'), v_body,
      v_placeholders, app.j_text(p_input, 'category'),
      app.current_person_id(p_church_id)
    )
    returning id into v_id;
  else
    update communication_templates set
      name = coalesce(v_name, name),
      subject = case when p_input ? 'subject' then app.j_text(p_input, 'subject') else subject end,
      body = coalesce(v_body, body),
      placeholders_allowed = v_placeholders,
      category = case when p_input ? 'category' then app.j_text(p_input, 'category') else category end,
      updated_at = now()
    where id = v_id and church_id = p_church_id;

    if not found then
      raise exception 'La plantilla no existe.' using errcode = 'P0002';
    end if;
  end if;

  perform app.write_audit_log(p_church_id, 'communication_template.saved',
    'communication_templates', v_id, jsonb_build_object('name', v_name));
  return v_id;
end;
$$;

revoke all on function app.save_communication_template(uuid, jsonb) from public, anon;
grant execute on function app.save_communication_template(uuid, jsonb) to authenticated;

create or replace function app.set_communication_template_archived(p_template_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church uuid;
begin
  select church_id into v_church from communication_templates where id = p_template_id;
  if v_church is null or not (v_church = any (app.church_ids_for_user())) then
    raise exception 'La plantilla no existe.' using errcode = 'P0002';
  end if;

  if not app.has_capability(v_church, 'communications.manage_templates') then
    raise exception 'No tienes permiso para gestionar plantillas.' using errcode = '42501';
  end if;

  update communication_templates
  set archived_at = case when p_archived then now() else null end, updated_at = now()
  where id = p_template_id;

  perform app.write_audit_log(v_church,
    case when p_archived then 'communication_template.archived' else 'communication_template.restored' end,
    'communication_templates', p_template_id, '{}'::jsonb);
end;
$$;

revoke all on function app.set_communication_template_archived(uuid, boolean) from public, anon;
grant execute on function app.set_communication_template_archived(uuid, boolean) to authenticated;

-- Segmentos ---------------------------------------------------------------------

create or replace function app.save_communication_segment(p_church_id uuid, p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := nullif(p_input ->> 'id', '')::uuid;
  v_name text := app.j_text(p_input, 'name');
  v_rules jsonb := p_input -> 'rules';
begin
  perform app.assert_church_member(p_church_id);

  if not app.has_capability(p_church_id, 'communications.manage_segments') then
    raise exception 'No tienes permiso para gestionar segmentos.' using errcode = '42501';
  end if;

  -- Las reglas las valida además el trigger de la tabla; comprobarlas aquí da
  -- un error claro antes de intentar escribir.
  if v_rules is not null then
    perform app.validate_segment_rules(v_rules);
  end if;

  if v_id is null then
    if v_name is null or v_rules is null then
      raise exception 'El segmento necesita nombre y reglas.' using errcode = '22023';
    end if;

    insert into communication_segments (church_id, name, description, rules, created_by_person_id)
    values (p_church_id, v_name, app.j_text(p_input, 'description'), v_rules,
            app.current_person_id(p_church_id))
    returning id into v_id;
  else
    update communication_segments set
      name = coalesce(v_name, name),
      description = case when p_input ? 'description' then app.j_text(p_input, 'description') else description end,
      rules = coalesce(v_rules, rules),
      updated_at = now()
    where id = v_id and church_id = p_church_id;

    if not found then
      raise exception 'El segmento no existe.' using errcode = 'P0002';
    end if;
  end if;

  perform app.write_audit_log(p_church_id, 'communication_segment.saved',
    'communication_segments', v_id, jsonb_build_object('name', v_name));
  return v_id;
end;
$$;

revoke all on function app.save_communication_segment(uuid, jsonb) from public, anon;
grant execute on function app.save_communication_segment(uuid, jsonb) to authenticated;

create or replace function app.set_communication_segment_archived(p_segment_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church uuid;
begin
  select church_id into v_church from communication_segments where id = p_segment_id;
  if v_church is null or not (v_church = any (app.church_ids_for_user())) then
    raise exception 'El segmento no existe.' using errcode = 'P0002';
  end if;

  if not app.has_capability(v_church, 'communications.manage_segments') then
    raise exception 'No tienes permiso para gestionar segmentos.' using errcode = '42501';
  end if;

  update communication_segments
  set archived_at = case when p_archived then now() else null end, updated_at = now()
  where id = p_segment_id;

  perform app.write_audit_log(v_church,
    case when p_archived then 'communication_segment.archived' else 'communication_segment.restored' end,
    'communication_segments', p_segment_id, '{}'::jsonb);
end;
$$;

revoke all on function app.set_communication_segment_archived(uuid, boolean) from public, anon;
grant execute on function app.set_communication_segment_archived(uuid, boolean) to authenticated;

-- Envoltorios públicos ------------------------------------------------------------

create or replace function public.save_communication_template(p_church_id uuid, p_input jsonb)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.save_communication_template(p_church_id, p_input); $$;

create or replace function public.set_communication_template_archived(p_template_id uuid, p_archived boolean)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.set_communication_template_archived(p_template_id, p_archived); $$;

create or replace function public.save_communication_segment(p_church_id uuid, p_input jsonb)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.save_communication_segment(p_church_id, p_input); $$;

create or replace function public.set_communication_segment_archived(p_segment_id uuid, p_archived boolean)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.set_communication_segment_archived(p_segment_id, p_archived); $$;

do $grants$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.save_communication_template(uuid, jsonb)',
    'public.set_communication_template_archived(uuid, boolean)',
    'public.save_communication_segment(uuid, jsonb)',
    'public.set_communication_segment_archived(uuid, boolean)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
end;
$grants$;
