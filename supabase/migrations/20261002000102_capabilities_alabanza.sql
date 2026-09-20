-- Fase 11 (Diogo) · Capabilities de Alabanza (contenido). Mismo patrón que
-- 20261001000400_capabilities_comunicaciones.sql: el seed de Fase 0 no
-- cubre capabilities nuevas, hay que concederlas explícitamente.
--
-- module_key = 'worship' ya existe en el catálogo desde la Fase 0
-- (20260916000600_modulos_entitlements_flags.sql:20).

insert into capabilities (key, description, module_key) values
  ('worship.song.read', 'Ver canciones de Alabanza dentro de su ámbito', 'worship'),
  ('worship.song.manage', 'Crear, editar y archivar canciones', 'worship'),
  ('worship.repertoire.read', 'Ver repertorios de Alabanza', 'worship'),
  ('worship.repertoire.manage', 'Crear, editar, archivar y reordenar repertorios', 'worship'),
  ('worship.atril.use', 'Abrir el atril (modo ejecución) de un repertorio', 'worship');

-- Reparto por rol (propuesta del contrato, §22 del encargo): sin roles
-- nuevos, reutilizando los ya existentes. church_owner/church_admin/
-- campus_admin reciben gestión completa; el resto de roles no reciben nada
-- en esta fase salvo decisión explícita futura de Carlos (integración de
-- equipo de Alabanza, fuera de esta branch).
insert into role_capabilities (role_key, capability_key)
select 'church_owner', key from capabilities where key like 'worship.%'
union all
select 'church_admin', key from capabilities where key like 'worship.%'
union all
select 'campus_admin', key from capabilities where key like 'worship.%';
