# Changelog de documentación

## 15 de septiembre de 2026 — arquitectura integral multi-tenant

### Cambio de alcance

LEVITA pasa de estar documentado principalmente como plataforma multiiglesia de turnos/servicios a una arquitectura modular preparada para gestión integral de iglesias evangélicas.

### Cambios principales

- People pasa a ser núcleo transversal y separado de Auth.
- Se incorpora Households/Families.
- Multi-campus entra en la fundación.
- Se define Activity como raíz para cultos, eventos, reuniones, cursos, tareas y turnos.
- Se incorporan Modules, Church Modules, Entitlements y Feature Flags.
- Se amplía RBAC a capacidades y scopes.
- Se formaliza auditoría, soporte con impersonación, import/export, observabilidad, backups y jobs.
- Se agregan módulos Groups, Discipleship, Events, Kids, Communications, Pastoral, Giving, Facilities, Analytics e Integrations.
- Se amplían áreas de servicio de 12 referencias iniciales a 16.
- Kids deja de ser “fuera del producto”: continúa fuera del MVP pero entra explícitamente en Fase 8.
- Giving y Pastoral quedan previstos como módulos avanzados con permisos restringidos.
- Alabanza pasa a Fase 11 del roadmap integral; su UI/UX continúa siendo referencia desde Fase 0.
- El roadmap pasa a Fases 0–13.
- Fases 0–5 forman el MVP comercial recomendado.
- El backlog `TAREAS.md` queda marcado como histórico.

### Documentos nuevos

- `15-nucleo-plataforma.md`
- `16-arquitectura-multitenant.md`
- `17-seguridad-operacion.md`
- `18-modulos-funcionales.md`
- `19-integraciones-y-datos.md`
- `20-matriz-cobertura.md`
- `modulos/*`
- nuevas fichas `areas/13` a `areas/16`.
