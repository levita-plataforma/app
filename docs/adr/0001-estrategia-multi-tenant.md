# ADR 0001 · Estrategia multi-tenant

## Estado

Aceptado — 16 de septiembre de 2026.

## Contexto

LEVITA debe servir a cientos o miles de iglesias pequeñas de forma aislada, segura y económica. Cada iglesia (tenant) tiene sus propias personas, áreas, actividades, configuración, roles y suscripción. Los datos de una iglesia nunca deben ser accesibles desde otra.

## Decisión

Usar **base de datos compartida (Postgres/Supabase) + columna `church_id` en toda tabla tenant-aware + Row Level Security (RLS) + grants mínimos por columna + constraints de integridad referencial compuestos** que impiden relacionar filas de tenants distintos.

No se usa un schema por iglesia ni una base de datos por iglesia.

## Alternativas consideradas

1. **Schema por tenant.** Mayor aislamiento físico, pero migrar cientos o miles de schemas es una pesadilla operativa; el coste por tenant se dispara; herramientas y tooling de Supabase asumen un schema público compartido.
2. **Base de datos por tenant.** Aislamiento máximo, pero coste de infraestructura y operación inasumible para el segmento de iglesias pequeñas objetivo del MVP.
3. **Base compartida sin RLS, solo filtrado en aplicación.** Descartado: un solo bug en una query filtra datos entre iglesias. No hay defensa en profundidad.

## Consecuencias

- Toda tabla tenant-aware requiere `church_id NOT NULL`, índice por `church_id`, política RLS con `ENABLE` + `FORCE`, y FKs compuestas `(id, church_id)` hacia sus tablas padre.
- Se requiere disciplina constante: cada migración nueva debe pasar por la checklist de aislamiento (ver ADR 0013).
- El coste por tenant adicional es marginal (una fila más en cada tabla), lo que permite escalar a miles de iglesias pequeñas sin rediseño.
- Es necesaria una suite de tests de aislamiento cross-tenant que se ejecute en CI y falle si una tabla nueva no tiene RLS.

## Riesgos

- Una política RLS mal escrita puede dejar una tabla abierta sin que sea evidente en desarrollo local. Mitigación: test que enumera `pg_tables` y falla si falta `rowsecurity = true` en una tabla tenant-aware.
- Funciones `SECURITY DEFINER` mal auditadas pueden saltarse RLS. Mitigación: ver ADR 0013, cada función de este tipo requiere test propio y `search_path` fijo.
