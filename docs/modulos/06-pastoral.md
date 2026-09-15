# Módulo Pastoral — Acompañamiento y seguimiento

## Principio

Pastoral es un dominio de **alta sensibilidad**. No debe implementarse como una columna “notas” en People ni quedar visible a cualquier church_admin.

## Entidades

- `pastoral_cases`
- `pastoral_case_members`
- `pastoral_notes`
- `pastoral_tasks`
- `prayer_requests` si se prioriza
- `pastoral_access_grants` cuando se requiera ACL específica

## Capacidades

- crear solicitud/caso;
- asignar responsable;
- limitar colaboradores;
- registrar notas;
- crear tareas y recordatorios;
- cerrar/reabrir;
- transferir;
- aplicar retención.

## Acceso

Deny-by-default. Capacidades explícitas:

- `pastoral.case.create`
- `pastoral.case.read_assigned`
- `pastoral.case.read_all`
- `pastoral.case.manage`

Un administrador técnico del tenant no recibe automáticamente contenido pastoral.

## Auditoría

Auditar cambios de acceso y acciones administrativas sin copiar indiscriminadamente el contenido de notas en logs.

## Exportación

No incluir casos pastorales en una exportación general de People salvo flujo explícito y autorizado.
