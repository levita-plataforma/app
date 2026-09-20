# Datos, permisos y Row Level Security

Revisión: **16 de septiembre de 2026**.

Este documento define la seguridad de datos objetivo. Las referencias históricas a migraciones de `Documents/Levitaapp` deben verificarse contra ese repositorio antes de considerarlas implementadas. La ampliación integral descrita aquí **no se considera construida** por existir en documentación.

**Estado de implementación (Fase 0):** el núcleo descrito en este documento está implementado en `supabase/migrations/` del repositorio `levita-app`, con 20 tablas tenant-aware bajo RLS activo/forzado y 40 tests pgTAP en verde (`supabase/tests/`). Ver [ADR 0001](adr/0001-estrategia-multi-tenant.md) y [ADR 0013](adr/0013-estrategia-rls.md) para el detalle de decisión, y [13-plan-por-fases.md](13-plan-por-fases.md) para el estado exacto de la Fase 0. Los módulos funcionales (Serving, Worship, Kids, etc.) aún no tienen tablas propias: eso llega en sus fases correspondientes.

## 1. Estrategia

Base compartida con `church_id` para datos tenant-aware, RLS en Postgres, grants mínimos, funciones de contexto seguras y claves compuestas que impiden relaciones cross-tenant.

## 2. Reglas obligatorias

1. Toda tabla tenant-aware declara `church_id NOT NULL`, salvo tablas globales justificadas.
2. `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY` donde corresponda.
3. Índices por `church_id` y claves usadas en políticas.
4. FKs tenant-safe: `(parent_id, church_id)`.
5. El cliente nunca decide autorización por slug/ID.
6. Service-role solo en procesos backend controlados.
7. Los módulos sensibles añaden capas de permiso; no relajan RLS.

## 3. Capas

### RLS — filas

Determina qué registros pueden verse/modificarse.

### Grants — columnas/operaciones

Ejemplo: una persona puede responder su asignación, pero no cambiar `person_id`, `event_id` o `church_id`.

**Toda función nueva se revoca explícitamente de `public` y `anon`, en las dos capas.** PostgreSQL concede `execute` a PUBLIC al crear una función, así que una RPC sin `revoke` queda al alcance de una sesión sin autenticar aunque la capa de debajo la rechace. Lo comprueba la suite `hotfix_revokes_publicos_test.sql`, que fija la superficie anónima por lista blanca: si alguien añade una RPC y se olvida del `revoke`, falla sola. Al revocar hay que conceder a `authenticated` en el mismo sitio, porque muchas funciones llegaban a la aplicación heredando de PUBLIC y revocar sin conceder las deja sin acceso.

### Constraints — integridad

Impedir físicamente referencias entre tenants.

### Funciones de contexto

Funciones `security definer` deben:

- tener `search_path` fijo;
- ser mínimas;
- no estar expuestas innecesariamente por API;
- ser `stable` cuando proceda;
- tener tests.

## 4. Contextos de autorización

El permiso puede depender de:

- iglesia;
- sede;
- módulo;
- área;
- grupo;
- actividad;
- caso pastoral;
- rol financiero;
- relación tutor-menor.

No intentar resolver todos los dominios con `is_admin boolean`.

## 5. Matriz conceptual

| Acción | Miembro | Líder área | Admin iglesia | Rol especializado |
|---|---:|---:|---:|---:|
| Ver su perfil | Sí | Sí | Sí | Sí |
| Editar su contacto permitido | Sí | Sí | Sí | Sí |
| Ver directorio básico | Según política | Según política | Sí | Según política |
| Gestionar personas | No | Limitado | Sí | People manager |
| Programar su área | No | Sí | Sí | Coordinator |
| Gestionar otra área | No | No | Sí | Según scope |
| Ver casos pastorales | No | No | No por defecto | Pastoral explícito |
| Ver donaciones | No | No | No por defecto | Finance explícito |
| Gestionar Kids | No | Solo si scope | Sí administrativo, no todo dato | Kids explícito |
| Exportación masiva | No | No | Solo capacidad específica | Export manager |

## 6. Entitlements

Una política de acceso a módulo considera:

- iglesia activa;
- módulo habilitado;
- pertenencia;
- capacidad;
- scope.

El módulo deshabilitado bloquea nuevas operaciones aunque el usuario conserve un rol antiguo.

## 7. People y Auth

`people` no depende obligatoriamente de `auth.users`. El usuario autenticado se resuelve a su persona dentro de cada iglesia.

Proteger especialmente:

- cambio de `user_id`;
- roles;
- church memberships;
- merges;
- datos de contacto;
- visibilidad.

## 8. Multi-campus

Campus filtra funcionalmente, pero no reemplaza RLS por tenant. Un `campus_admin` obtiene scope de campus; no se confía en `campus_id` enviado por cliente.

## 9. Pastoral

Casos pastorales requieren ACL/capacidad específica. La política puede restringir a miembros asignados al caso además del tenant.

## 10. Giving

Datos financieros requieren roles específicos. Un owner puede gestionar facturación de LEVITA sin que eso implique leer donaciones de personas.

## 11. Kids

El acceso se basa en:

- rol Kids;
- clase/sesión;
- relación tutor-menor cuando el acceso es familiar;
- necesidad operativa.

## 12. Storage

Objetos privados deben organizarse con metadatos tenant-aware y políticas coherentes. No confiar exclusivamente en rutas de archivo manipulables por cliente.

## 13. Tests obligatorios

Por cada nueva tabla/mutación:

- usuario sin iglesia;
- usuario de tenant A intentando leer B;
- insertar FK cross-tenant;
- actualizar `church_id`;
- escalar rol;
- modificar columna no autorizada;
- acceder con módulo deshabilitado;
- acceder fuera de scope de área/campus/grupo;
- service-role solo en ruta prevista.

## 14. Test de cobertura de RLS

Mantener una prueba que enumere tablas tenant-aware y falle si una tabla nueva no tiene RLS/políticas esperadas.

## 15. Seguridad de consultas

- paginación;
- límites máximos;
- evitar `select *` en endpoints sensibles;
- filtrar/ordenar solo campos permitidos;
- índices por patrones reales;
- evitar N+1;
- no exponer errores SQL al usuario.

## 16. Concurrencia

Operaciones como asignaciones, reservas, aforo y check-in pueden necesitar constraints o transacciones para evitar carreras. La UI optimista no sustituye integridad en base.

## 17. Datos globales permitidos

Ejemplos: catálogo de módulos, países, configuración de producto. Deben estar explícitamente marcados como globales y no contener PII tenant.
