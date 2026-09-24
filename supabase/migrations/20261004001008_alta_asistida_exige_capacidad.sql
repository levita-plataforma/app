-- CA-0.2 · El alta asistida exige la capacidad de crear iglesias.
--
-- app.assisted_provision_church es de la Fase 1, cuando ser operador de
-- plataforma era binario. La Fase 14 introdujo capacidades por operador y su
-- propia función de alta, que sí las comprueba, pero esta siguió en pie y es la
-- que usa /operacion/altas: la separación de capacidades tenía una puerta de
-- atrás por la que un operador SIN ninguna capacidad podía crear iglesias y
-- generar invitaciones de propietario.
--
-- Comprobado en una base local antes de tocar nada: platform_create_church
-- rechazaba con 42501 y esta creaba la iglesia de verdad. No era una sospecha
-- salida de leer el código.
--
-- El cuerpo es el mismo de 20260917000600, extraído de ese fichero en vez de
-- copiado a mano para que no se desvíe. Lo único que cambia es la autorización.
-- Se conserva la firma exacta, con p_module_keys, para REEMPLAZAR la función:
-- cambiar un nombre de parámetro crearía una sobrecarga nueva y dejaría la
-- vieja accesible, que es justo lo contrario de lo que se busca.

create or replace function app.assisted_provision_church(
  p_name text,
  p_slug text,
  p_locale text,
  p_timezone text,
  p_currency text,
  p_country text,
  p_owner_email text,
  p_module_keys text[] default array['people', 'serving', 'events', 'communications']
)
returns table (out_church_id uuid, out_invitation_id uuid, out_invitation_token text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_church_id uuid;
  v_campus_id uuid;
  v_onboarding_id uuid;
  v_subscription_id uuid;
  v_invitation_id uuid;
  v_token text;
  v_module_key text;
begin
  -- CA-0.2: antes bastaba con pertenecer al equipo. Ahora hace falta la
  -- capacidad concreta, la misma que exige app.platform_create_church desde la
  -- Fase 14. Sin esto, un operador con cero capacidades creaba iglesias.
  perform app.assert_platform_capability('platform.churches.create');

  if not (select app.slug_available(p_slug)) then
    raise exception 'SLUG_UNAVAILABLE: el identificador "%" no está disponible', p_slug;
  end if;

  insert into churches (name, slug, status, locale, timezone, currency, settings)
  values (p_name, p_slug, 'provisioning', p_locale, p_timezone, p_currency, jsonb_build_object('country', p_country))
  returning id into v_church_id;

  insert into campuses (church_id, name, slug, is_primary, status)
  values (v_church_id, 'Sede principal', 'principal', true, 'active')
  returning id into v_campus_id;

  foreach v_module_key in array p_module_keys loop
    insert into church_modules (church_id, module_key, status, enabled_at)
    values (v_church_id, v_module_key, 'enabled', now())
    on conflict (church_id, module_key) do nothing;
  end loop;

  insert into subscriptions (church_id, plan_key, status, trial_ends_at)
  values (v_church_id, 'trial', 'trial', now() + interval '30 days')
  returning id into v_subscription_id;

  update churches set subscription_id = v_subscription_id where id = v_church_id;

  insert into church_onboarding (church_id, current_step, completed_steps)
  values (v_church_id, 'church', array['account']::church_onboarding_step[])
  returning id into v_onboarding_id;

  -- Token de invitación: 32 bytes aleatorios en hex. Se devuelve una única
  -- vez en el resultado de esta función; solo el hash se persiste.
  v_token := encode(gen_random_bytes(32), 'hex');

  insert into invitations (church_id, email, role_key, token_hash, invited_by, expires_at)
  values (v_church_id, lower(p_owner_email), 'church_owner', encode(digest(v_token, 'sha256'), 'hex'), auth.uid(), now() + interval '7 days')
  returning id into v_invitation_id;

  perform app.write_audit_log(
    v_church_id, 'church.created', 'churches', v_church_id,
    jsonb_build_object('name', p_name, 'slug', p_slug, 'assisted', true)
  );
  perform app.write_audit_log(
    v_church_id, 'campus.created', 'campuses', v_campus_id,
    jsonb_build_object('name', 'Sede principal', 'is_primary', true)
  );
  perform app.write_audit_log(
    v_church_id, 'subscription.initialized', 'subscriptions', v_subscription_id,
    jsonb_build_object('plan_key', 'trial', 'status', 'trial')
  );
  perform app.write_audit_log(
    v_church_id, 'invitation.created', 'invitations', v_invitation_id,
    jsonb_build_object('role_key', 'church_owner')
  );

  return query select v_church_id, v_invitation_id, v_token;
end;
$$;

comment on function app.assisted_provision_church(text, text, text, text, text, text, text, text[]) is
  'Alta asistida desde el panel de operación. Desde CA-0.2 exige platform.churches.create: antes bastaba con pertenecer al equipo, y eso vaciaba la separación de capacidades de la Fase 14.';

revoke all on function app.assisted_provision_church(text, text, text, text, text, text, text, text[]) from public, anon;
grant execute on function app.assisted_provision_church(text, text, text, text, text, text, text, text[]) to authenticated;
