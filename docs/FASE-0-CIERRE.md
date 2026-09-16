# Cierre de la Fase 0 — Fundación SaaS

Fecha: **16 de septiembre de 2026**.

## Estado

```
FASE 0: COMPLETADA Y DESPLEGADA EN SUPABASE REAL
```

## Esquema remoto

| Dato | Valor |
|---|---|
| Project ref | `rdwwaeppjtljnesaktak` |
| Región | `eu-west-1` |
| Método de conexión | Pooler (`aws-1-eu-west-1.pooler.supabase.com:6543`); la conexión directa al puerto 5432 está bloqueada por red del proyecto |
| Migraciones aplicadas | 12/12 (`supabase db push --db-url`) |
| Tablas creadas | 28 |
| Tablas tenant-aware con RLS + FORCE RLS | 20/20 |
| Catálogos globales sembrados | `modules` (13), `capabilities`, `roles`, `role_capabilities` |
| Seed sintético (`supabase/seed.sql`, Church A/B ficticias) | **NO aplicado en remoto** — reservado para desarrollo local únicamente |

## Migraciones aplicadas en remoto

1. `20260916000100_extensiones_y_esquema_app.sql`
2. `20260916000200_churches_y_campuses.sql`
3. `20260916000300_people_y_pertenencia.sql`
4. `20260916000400_tags_y_campos_personalizados.sql`
5. `20260916000500_activities.sql`
6. `20260916000600_modulos_entitlements_flags.sql`
7. `20260916000700_rbac_capabilities_scopes.sql`
8. `20260916000800_funciones_contexto.sql`
9. `20260916000900_politicas_rls_core.sql`
10. `20260916001000_auditoria_y_soporte.sql`
11. `20260916001100_archivos_jobs_webhooks.sql`
12. `20260916001200_rpc_publicas.sql`

## Verificación de aislamiento en remoto

Confirmado mediante consulta directa a `pg_class` sobre el proyecto real: las 20 tablas tenant-aware (`churches`, `campuses`, `people`, `church_people`, `households`, `household_members`, `tags`, `person_tags`, `custom_field_definitions`, `custom_field_values`, `activities`, `church_modules`, `church_entitlement_overrides`, `church_feature_flags`, `church_people_roles`, `audit_logs`, `support_sessions`, `files`, `import_jobs`, `export_jobs`, `webhook_events_inbound`, `webhook_endpoints_outbound`) tienen `relrowsecurity = true` y `relforcerowsecurity = true`. Los 6 catálogos globales sin `church_id` (`modules`, `capabilities`, `roles`, `role_capabilities`, `feature_flags`, `plan_entitlements`) tienen RLS activo con política de solo lectura pública, sin `FORCE` (no aplica: no son tenant-aware).

La suite pgTAP de aislamiento (40/40 tests) se validó contra el entorno local antes de portar el esquema a remoto; el esquema aplicado en remoto es idéntico (mismas migraciones, mismo orden).

## Referencia

Ver [13-plan-por-fases.md](13-plan-por-fases.md#estado--16-de-septiembre-de-2026) para el detalle completo de alcance e implementación de la Fase 0, y `docs/adr/` para las 16 decisiones de arquitectura que la sustentan.
