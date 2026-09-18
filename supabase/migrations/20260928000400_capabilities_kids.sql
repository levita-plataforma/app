-- Fase 8 (Diogo) · Capabilities de Kids. Ver prompt Fase 8 §8, §39.
--
-- Reutiliza los scopes ya existentes ('activity' para la sesión Kids,
-- 'campus'), sin crear un scope nuevo (§39). No todo líder de área accede a
-- Kids: church_owner/church_admin/campus_admin sí; ministry_leader NO
-- recibe nada de Kids por defecto (§8).

insert into capabilities (key, description, module_key) values
  ('kids.read', 'Ver menores, salas y sesiones Kids (sin datos sensibles)', 'kids'),
  ('kids.manage', 'Gestionar perfiles Kids', 'kids'),
  ('kids.guardians.manage', 'Gestionar relaciones menor-responsable', 'kids'),
  ('kids.pickup.manage', 'Gestionar autorizaciones de recogida', 'kids'),
  ('kids.pickup.override', 'Autorizar recogidas excepcionales con motivo obligatorio', 'kids'),
  ('kids.room.manage', 'Gestionar salas/clases Kids', 'kids'),
  ('kids.session.manage', 'Gestionar sesiones Kids y su staff', 'kids'),
  ('kids.checkin', 'Registrar check-in de menores', 'kids'),
  ('kids.checkout', 'Registrar check-out de menores', 'kids'),
  ('kids.incident.read', 'Ver incidencias Kids', 'kids'),
  ('kids.incident.manage', 'Crear y resolver incidencias Kids', 'kids'),
  ('kids.sensitive.read', 'Ver notas médicas/accesibilidad y detalle de credenciales sensibles Kids', 'kids');

-- church_owner, church_admin y campus_admin: todas las capabilities de
-- Kids, igual que en fases anteriores (el seed de Fase 0 no cubre
-- capabilities creadas después).
insert into role_capabilities (role_key, capability_key)
select 'church_owner', key from capabilities where key like 'kids.%'
union all
select 'church_admin', key from capabilities where key like 'kids.%'
union all
select 'campus_admin', key from capabilities where key like 'kids.%';

-- app.kids_cap(): capability efectiva sobre una sesión Kids, reutilizando
-- el scope 'activity' de la activity subyacente y 'campus'. Mismo patrón
-- que app.event_cap (Fase 6) y app.activity_cap (Fase 4).
create or replace function app.kids_cap(
  p_church_id uuid,
  p_campus_id uuid,
  p_activity_id uuid,
  p_capability text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app.has_capability(p_church_id, p_capability)
    or (p_campus_id is not null and app.has_capability(p_church_id, p_capability, 'campus', p_campus_id))
    or (p_activity_id is not null and app.has_capability(p_church_id, p_capability, 'activity', p_activity_id));
$$;

revoke all on function app.kids_cap(uuid, uuid, uuid, text) from public, anon;
grant execute on function app.kids_cap(uuid, uuid, uuid, text) to authenticated;
