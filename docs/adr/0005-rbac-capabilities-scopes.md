# ADR 0005 · RBAC + capabilities + scopes

## Estado

Aceptado — 16 de septiembre de 2026.

## Contexto

Un rol único y rígido (`admin`/`member`) no puede expresar que un líder de área administre solo su área, que un coordinador Kids necesite acceso restringido, o que un caso pastoral requiera visibilidad distinta de la del directorio general. El permiso puede depender de iglesia, sede, módulo, área, grupo, actividad, recurso o caso pastoral.

## Decisión

Los roles son **paquetes nombrados de capabilities**, no la fuente última de autorización. Una capability es una acción atómica (`people.read`, `schedule.publish`, `pastoral.case.read_assigned`). La autorización real es la intersección de: tenant activo + módulo habilitado (entitlement) + pertenencia activa + capability + scope aplicable + estado del recurso.

Roles de referencia para la Fase 0: `church_owner`, `church_admin`, `campus_admin`, `ministry_leader`, `group_leader`, `kids_coordinator`, `finance_manager`, `pastoral_worker`, `member`. Estos roles son plantillas de capabilities, resueltas en tiempo de autorización, no strings comparados directamente en lógica de negocio.

Scopes soportados desde la Fase 0: `church`, `campus`, `module`, `service_area`, `group`, `activity`, `resource`, `pastoral_case`.

Se aplica **deny-by-default**: sin una capability explícita en el scope pedido, la acción se rechaza.

## Alternativas consideradas

1. **Rol único global por usuario (`admin`/`member`).** Descartado: no expresa scopes (un líder de un área no debe administrar otra) ni dominios sensibles (Pastoral no debe heredar acceso de `church_admin`).
2. **Permisos hardcodeados por `if (role === "admin")` dispersos en el código.** Descartado explícitamente por la documentación de producto: impide auditar quién puede qué, y mezcla autorización con lógica de presentación.

## Consecuencias

- Toda mutación sensible se valida en servidor (y en base mediante RLS) comprobando capability + scope, nunca solo ocultando un botón en la UI.
- Un módulo desactivado bloquea la capability aunque el rol la incluya (ver ADR 0006).
- La tabla de capabilities y su mapeo a roles vive en el núcleo, tenant-aware para overrides futuros, global para el catálogo base.

## Riesgos

- Sobre-modelar scopes antes de tener casos de uso reales de fases posteriores. Mitigación: la Fase 0 implementa el mecanismo genérico y lo prueba con capabilities mínimas (`church.settings.manage`, `people.read`, `audit.read`); cada fase futura añade sus propias capabilities sin cambiar el mecanismo.
