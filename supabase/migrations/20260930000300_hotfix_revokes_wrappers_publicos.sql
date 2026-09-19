-- Hotfix transversal · Los revoke que faltaban en los wrappers públicos.
--
-- PostgreSQL concede execute a PUBLIC al crear una función. El proyecto lo
-- compensa revocando a mano en cada migración, pero a ocho wrappers de public
-- y a una función de app se les olvidó, así que anon los alcanza.
--
-- No es explotable. Los ocho wrappers son security invoker y la función de app
-- que llaman sí está revocada, de modo que una sesión anónima recibe 42501 al
-- llegar abajo. Y app.create_person, que sí es security definer, comprueba la
-- capacidad por dentro: llamada como anon responde «No autorizado», comprobado
-- contra el estado actual de main antes de escribir esto.
--
-- Se cierra igualmente porque una defensa que solo funciona mientras la capa de
-- abajo no falle no es defensa en profundidad, y porque el resto del proyecto
-- sigue el criterio contrario en todas partes menos aquí.
--
-- Queda fuera, a propósito, la superficie pública de verdad: register_for_event,
-- cancel_registration_by_token, submit_marketing_lead, public_event_by_slug,
-- public_form_fields, public_consent_definitions y event_registration_status.
--
-- El grant a authenticated no es decorativo: estas funciones no tenían grant
-- explícito en la capa public y llegaban a la aplicación por herencia de
-- PUBLIC. Revocar sin conceder dejaría la aplicación sin acceso.

do $wrappers$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.proname in (
      'admin_cancel_registration',
      'checkin_attendee',
      'undo_checkin_attendee',
      'promote_waitlist',
      'notify_event_registrants',
      'create_person',
      'eligible_people_for_position',
      'evaluate_person_eligibility'
    )
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$wrappers$;

-- Abajo, en app, faltan dos: create_person y activity_structure_editable. Las
-- dos son security definer, así que saltan RLS por definición y no pueden
-- quedar al alcance de una sesión anónima aunque comprueben por dentro. El
-- resto de lo que anon alcanza en app son funciones de trigger, que no se
-- pueden invocar por RPC, y helpers security invoker, a los que RLS ya responde
-- por nosotros.

do $app$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'app'
    where p.proname in ('create_person', 'activity_structure_editable')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$app$;
