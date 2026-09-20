-- Fase 13 · Una comunicación rota deja de atascar la cola.
--
-- Hallazgo comprobado: el runner recorre las comunicaciones vencidas y llama a
-- cron_materialize_communication una por una; si alguna lanza, la excepción
-- corta la pasada. Con una fila cuyo snapshot de segmentación sea inválido —por
-- un bug, una migración o un cambio de reglas—, esa comunicación vuelve a
-- fallar en cada ejecución y las que van detrás no se procesan NUNCA. Nadie se
-- entera: el cron simplemente devuelve error y al día siguiente lo repite.
--
-- Se reproduce con dos comunicaciones vencidas, la primera con un campo de
-- segmentación que no existe: ninguna de las dos se procesa, las dos siguen en
-- cola, y la siguiente pasada hará lo mismo.
--
-- La corrección tiene dos partes:
--
--   1. Un estado para lo que no se puede procesar. Sin él, la única salida es
--      dejarlo en cola o mentir diciendo que se envió.
--   2. Una función que intenta materializar y, si falla por un motivo que no se
--      va a arreglar solo, marca esa comunicación y sigue. El runner deja de
--      depender de que ninguna fila esté mal.
--
-- Lo que NO se hace: descartar en silencio. La comunicación queda en 'failed'
-- con el motivo guardado, visible en su ficha, para que alguien pueda
-- corregirla y reprogramarla.

alter type communication_status add value if not exists 'failed_to_process' after 'failed';

comment on type communication_status is
  'draft, scheduled, processing, queued, sent, partially_sent, failed, failed_to_process (no se pudo preparar: datos inválidos, requiere intervención) y cancelled.';

alter table communications
  add column if not exists processing_error text;

comment on column communications.processing_error is
  'Por qué no se pudo preparar esta comunicación. Se rellena al pasar a failed_to_process y se limpia al reprogramarla. No guarda trazas internas: solo el mensaje de dominio.';

-- app.try_materialize_communication -------------------------------------------
--
-- La misma operación, pero que no tumba la pasada. Devuelve qué pasó para que
-- el runner pueda contarlo y registrarlo.

create or replace function app.try_materialize_communication(p_communication_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_resultado jsonb;
  v_error text;
  v_sqlstate text;
begin
  begin
    v_resultado := app.materialize_communication_impl(p_communication_id);
    return jsonb_build_object('ok', true, 'resultado', v_resultado);

  exception when others then
    get stacked diagnostics v_error = message_text, v_sqlstate = returned_sqlstate;

    -- Un bloqueo momentáneo o un fallo de infraestructura NO son datos
    -- inválidos: esos se reintentan en la pasada siguiente sin marcar nada.
    -- Marcar aquí convertiría un problema pasajero en una comunicación muerta.
    if v_sqlstate in ('40001', '40P01', '55P03', '57014') then
      return jsonb_build_object('ok', false, 'reintentable', true, 'error', v_error);
    end if;

    update communications
    set status = 'failed_to_process',
        processing_error = left(v_error, 500),
        updated_at = now()
    where id = p_communication_id;

    perform app.write_audit_log(
      (select church_id from communications where id = p_communication_id),
      'communication.failed_to_process', 'communications', p_communication_id,
      jsonb_build_object('sqlstate', v_sqlstate, 'error', left(v_error, 200))
    );

    return jsonb_build_object('ok', false, 'reintentable', false, 'error', v_error);
  end;
end;
$$;

comment on function app.try_materialize_communication(uuid) is
  'Materializa sin tumbar la pasada. Distingue lo que se reintenta —bloqueos, interbloqueos, cancelaciones— de lo que no se va a arreglar solo, que se marca como failed_to_process con su motivo.';

revoke all on function app.try_materialize_communication(uuid) from public, anon, authenticated;
grant execute on function app.try_materialize_communication(uuid) to service_role;

create or replace function public.try_materialize_communication(p_communication_id uuid)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.try_materialize_communication(p_communication_id); $$;

revoke all on function public.try_materialize_communication(uuid) from public, anon, authenticated;
grant execute on function public.try_materialize_communication(uuid) to service_role;

-- Reprogramar una comunicación atascada ----------------------------------------
--
-- Para que 'failed_to_process' no sea un callejón sin salida: se corrige lo que
-- estuviera mal y se devuelve a borrador para volver a programarla.

create or replace function app.reset_failed_communication(p_communication_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church uuid;
  v_status communication_status;
begin
  select church_id, status into v_church, v_status
  from communications where id = p_communication_id;

  if v_church is null or not (v_church = any (app.church_ids_for_user())) then
    raise exception 'La comunicación no existe.' using errcode = 'P0002';
  end if;

  if not app.has_capability(v_church, 'communications.schedule') then
    raise exception 'No tienes permiso para reprogramar comunicaciones.' using errcode = '42501';
  end if;

  if v_status <> 'failed_to_process' then
    raise exception 'Esta comunicación no está atascada.' using errcode = '22023';
  end if;

  update communications
  set status = 'draft', processing_error = null, scheduled_at = null, updated_at = now()
  where id = p_communication_id;

  perform app.write_audit_log(v_church, 'communication.reset', 'communications', p_communication_id, '{}'::jsonb);
end;
$$;

revoke all on function app.reset_failed_communication(uuid) from public, anon;
grant execute on function app.reset_failed_communication(uuid) to authenticated;

create or replace function public.reset_failed_communication(p_communication_id uuid)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.reset_failed_communication(p_communication_id); $$;

revoke all on function public.reset_failed_communication(uuid) from public, anon;
grant execute on function public.reset_failed_communication(uuid) to authenticated;

-- No hace falta tocar app.due_scheduled_communications: filtra por
-- status = scheduled, así que una comunicación marcada como failed_to_process
-- deja de aparecer sola. Reescribirla habría cambiado su firma y su semántica
-- sin necesidad.
