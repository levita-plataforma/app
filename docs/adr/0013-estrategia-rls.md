# ADR 0013 · Estrategia de RLS

## Estado

Aceptado — 16 de septiembre de 2026.

## Contexto

RLS es la capa central de aislamiento (ADR 0001), pero una política mal escrita puede ser lenta (la guía de rendimiento de Supabase documenta casos de 178 s bajando a 12 ms al corregir el patrón) o, peor, dejar una tabla efectivamente abierta.

## Decisión

Patrón obligatorio para toda tabla tenant-aware:

```sql
alter table tabla enable row level security;
alter table tabla force row level security;

create policy tabla_select on tabla
for select to authenticated
using ( church_id = any((select app.church_ids_for_user())::uuid[]) );
```

Reglas fijas:
1. `(select ...)` en vez de llamar la función directamente, para que Postgres cachee el resultado en el `initPlan` en vez de evaluarlo por fila.
2. Cast explícito `::uuid[]` al comparar con `any(...)`, evitando el error de tipos que aparece si se omite.
3. `to authenticated` para descartar el rol anónimo antes de evaluar cualquier condición.
4. Toda columna usada en una política va indexada.
5. Las funciones de contexto (`app.church_ids_for_user()`, `app.current_person_id()`, `app.has_church_role()`, etc.) son `security definer` (para evitar recursión infinita de una política sobre `people` que consulta `people`), `stable` (evaluación una vez por consulta, no por fila), con `search_path` fijo, y `execute` revocado a `public`/`anon`.
6. El esquema `app` que contiene estas funciones no está en `schemas` expuestos de la API; solo el rol `authenticated` tiene `execute` porque las políticas se evalúan con ese rol.

Se mantiene una prueba de cobertura que recorre `pg_tables` y falla si una tabla tenant-aware nueva no tiene RLS activo.

## Alternativas consideradas

1. **Políticas RLS con joins directos a tablas padre en vez de funciones de contexto cacheadas.** Descartado: es la causa principal de RLS lento documentada por Supabase.
2. **Confiar en filtrado de aplicación (`WHERE church_id = ...` en cada query) sin RLS.** Descartado en ADR 0001: sin RLS, un solo bug de aplicación filtra datos entre tenants.

## Consecuencias

- Cada PR que añade una tabla tenant-aware debe incluir su política RLS y su entrada en la suite de cobertura en el mismo commit.
- Los tests de aislamiento (usuario de iglesia A intentando leer/escribir/borrar datos de iglesia B) son parte obligatoria de la Fase 0 y de toda fase posterior.

## Riesgos

- Proliferación de funciones `security definer` sin auditar. Mitigación: cada una requiere un test propio y se documenta su propósito exacto; se prohíben `security definer` genéricas de propósito amplio.
