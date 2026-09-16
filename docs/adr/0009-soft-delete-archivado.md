# ADR 0009 · Soft-delete y archivado

## Estado

Aceptado — 16 de septiembre de 2026.

## Contexto

Borrar físicamente una persona, un área o una iglesia mediante una acción ordinaria de UI puede destruir historial legítimo (asignaciones pasadas, estadísticas de participación) y es difícilmente reversible ante un error humano.

## Decisión

Se establece la convención transversal `archived_at` / `archived_by` (nullable) en toda entidad con historial relevante. "Archivar" es la acción ordinaria disponible en la interfaz; el borrado físico queda reservado a flujos específicos y controlados (cumplimiento RGPD, limpieza de datos de prueba, retención vencida — ver `docs/08-rgpd-y-lopivi.md`).

Cada entidad nueva debe decidir explícitamente, documentado en su migración o ADR de módulo:
- si puede borrarse físicamente y bajo qué flujo;
- qué dependencias bloquean el archivado;
- qué se anonimiza en vez de archivarse (ver retención RGPD);
- quién puede restaurar una entidad archivada;
- el periodo de retención aplicable.

## Alternativas consideradas

1. **DELETE físico ordinario en toda la aplicación.** Descartado: irreversible desde la UI, incompatible con historial de servicio y con obligaciones de retención documentadas.
2. **Nunca borrar físicamente nada, ni siquiera en flujos de cumplimiento.** Descartado: contradice el derecho de supresión RGPD y la necesidad de anonimización real (`public.anonimizar_persona()` del backlog histórico ya sienta este precedente).

## Consecuencias

- Las consultas por defecto excluyen registros archivados salvo que se pida explícitamente lo contrario (auditoría, papelera, informes históricos).
- El archivado de una entidad padre (ej. un área) no borra en cascada sus relaciones (turnos publicados), consistente con la decisión ya registrada en `docs/12-iglesias-y-tenants.md`.

## Riesgos

- Acumulación indefinida de datos archivados sin política de retención aplicada. Mitigación: la Fase 0 documenta la convención; la implementación de jobs de retención automática (`app.aplicar_retencion()` u equivalente) se prioriza según el calendario de `docs/08-rgpd-y-lopivi.md` (antes de abrir a iglesias fuera del piloto).
