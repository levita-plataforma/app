-- Fase 2 · Capability people.archive. Ver encargo de Fase 2 §9.
--
-- Arquivar/reactivar una persona se separa de people.manage para permitir
-- un rol futuro que edite datos pero no pueda dar de baja a alguien del
-- directorio. church_owner y church_admin la reciben igual que el resto
-- de capabilities de people (ver seed de role_capabilities en Fase 0).

insert into capabilities (key, description, module_key) values
  ('people.archive', 'Archivar y reactivar personas', 'people');

insert into role_capabilities (role_key, capability_key)
select 'church_owner', 'people.archive'
union all
select 'church_admin', 'people.archive';
