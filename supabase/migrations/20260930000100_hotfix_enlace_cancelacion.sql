-- Hotfix · El enlace de cancelación de una inscripción caduca y deja de
-- guardarse en claro.
--
-- Cómo estaba: al inscribirse sin cuenta se genera un token opaco de 256 bits
-- que viaja en la URL del enlace de cancelación. El token es robusto, pero
-- se guardaba tal cual en registrations.cancel_token y **no caducaba nunca**.
-- Consecuencias: un correo reenviado, o encontrado en un buzón compartido años
-- después, seguía cancelando la inscripción; y un volcado de la tabla entregaba
-- los enlaces activos de todo el mundo.
--
-- Qué cambia:
--   1. En la tabla se guarda solo la huella del token, no el token.
--   2. El enlace caduca al terminar el evento —que es hasta cuando tiene
--      sentido cancelar— o a los 90 días si el evento no tiene fecha de fin.
--      Decisión de Carlos del 19 de septiembre de 2026.
--   3. Al usarlo, se invalida.
--
-- Se hace con un trigger y redefiniendo solo la función de cancelar, que es
-- corta. app.register_for_event no se toca: es larga, la reescribió un hotfix
-- anterior, y rehacerla de memoria es justo como se introducen fallos.

alter table registrations add column cancel_token_hash text;
alter table registrations add column cancel_token_expires_at timestamptz;

comment on column registrations.cancel_token_hash is
  'Huella del token de cancelación. El token en claro solo existe en el enlace que recibe la persona: aquí no se guarda, para que un volcado de la tabla no entregue las cancelaciones de todo el mundo.';
comment on column registrations.cancel_token_expires_at is
  'Hasta cuándo sirve el enlace de cancelación: el fin del evento, o 90 días desde la inscripción si el evento no tiene fecha de fin.';

create index registrations_cancel_token_hash_idx
  on registrations (cancel_token_hash) where cancel_token_hash is not null;

-- app.registration_cancel_deadline(): hasta cuándo vale el enlace.
create or replace function app.registration_cancel_deadline(p_event_id uuid, p_desde timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (select a.ends_at
     from events e
     join activities a on a.id = e.activity_id and a.church_id = e.church_id
     where e.id = p_event_id),
    p_desde + interval '90 days'
  );
$$;

revoke all on function app.registration_cancel_deadline(uuid, timestamptz) from public, anon, authenticated;

-- Trigger: la fila guarda la huella y la caducidad, nunca el token.
create or replace function app.registrations_protect_cancel_token()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if new.cancel_token is not null then
    new.cancel_token_hash := encode(digest(new.cancel_token, 'sha256'), 'hex');
    new.cancel_token_expires_at := coalesce(
      new.cancel_token_expires_at,
      app.registration_cancel_deadline(new.event_id, coalesce(new.registered_at, now()))
    );
    -- El token en claro sigue su camino en el valor devuelto por la RPC, que es
    -- lo que se envía a la persona. En la tabla no queda.
    new.cancel_token := null;
  end if;
  return new;
end;
$$;

revoke all on function app.registrations_protect_cancel_token() from public, anon, authenticated;

create trigger registrations_protect_cancel_token
  before insert or update of cancel_token on registrations
  for each row execute function app.registrations_protect_cancel_token();

-- Las inscripciones que ya existan pasan al modelo nuevo.
do $migrar$
begin
  update registrations r
  set cancel_token_hash = encode(extensions.digest(r.cancel_token, 'sha256'), 'hex'),
      cancel_token_expires_at = app.registration_cancel_deadline(r.event_id, r.registered_at)
  where r.cancel_token is not null;

  update registrations set cancel_token = null where cancel_token is not null;
end;
$migrar$;

comment on column registrations.cancel_token is
  'Obsoleta: el token ya no se guarda. Queda por compatibilidad con app.register_for_event, que la sigue rellenando; un trigger la vacía y guarda solo la huella. Retirar cuando esa función se reescriba.';

-- La huella no viaja al cliente. Con 256 bits no es atacable por fuerza bruta,
-- pero no hay motivo para exponerla.
revoke select on table registrations from authenticated;
grant select (
  id, church_id, event_id, registration_code, registration_type,
  primary_person_id, primary_name, primary_email, primary_phone,
  status, attendees_count, waitlist_position, source,
  form_submission_id, idempotency_key, registered_at, confirmed_at,
  cancelled_at, cancel_reason, cancel_token_expires_at, created_by, updated_at
) on table registrations to authenticated;

-- app.cancel_registration_by_token(): busca por huella, respeta la caducidad y
-- deja el enlace inservible después de usarlo.
create or replace function app.cancel_registration_by_token(p_cancel_token text, p_reason text default null)
returns table (registration_id uuid, status registration_status, promoted_count integer)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_reg registrations%rowtype;
  v_promoted integer := 0;
  v_hash text;
begin
  if p_cancel_token is null or length(btrim(p_cancel_token)) < 16 then
    raise exception 'Inscripción no encontrada.' using errcode = 'P0002';
  end if;

  v_hash := encode(digest(btrim(p_cancel_token), 'sha256'), 'hex');

  select * into v_reg from registrations where cancel_token_hash = v_hash for update;
  if not found then
    raise exception 'Inscripción no encontrada.' using errcode = 'P0002';
  end if;

  -- Se distingue del «no encontrada» a propósito: quien tiene un enlace válido
  -- pero caducado merece saber por qué no funciona, y eso no revela nada que no
  -- supiera ya.
  if v_reg.cancel_token_expires_at is not null and v_reg.cancel_token_expires_at < now() then
    raise exception 'Este enlace de cancelación ya ha caducado. Ponte en contacto con la iglesia.'
      using errcode = '22023';
  end if;

  if v_reg.status = 'cancelled' then
    return query select v_reg.id, v_reg.status, 0;
    return;
  end if;

  update registrations
  set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason, waitlist_position = null,
      -- El enlace se gasta al usarlo.
      cancel_token_hash = null
  where id = v_reg.id;

  perform app.write_audit_log(v_reg.church_id, 'registration.cancelled', 'registrations', v_reg.id,
    jsonb_build_object('event_id', v_reg.event_id, 'was_status', v_reg.status, 'via', 'token'));

  if v_reg.status = 'confirmed' then
    v_promoted := app.promote_waitlist(v_reg.event_id);
  end if;

  return query select v_reg.id, 'cancelled'::registration_status, v_promoted;
end;
$$;

revoke all on function app.cancel_registration_by_token(text, text) from public, anon;
grant execute on function app.cancel_registration_by_token(text, text) to authenticated, anon;
