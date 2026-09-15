# Prompts para Claude Code — LEVITA

Revisión: **15 de septiembre de 2026 — arquitectura integral**.

## Prompt base obligatorio

```text
Vamos a trabajar en LEVITA, una plataforma SaaS multiiglesia modular para iglesias evangélicas.

Antes de tocar código:
1. Lee docs/README.md, docs/00-vision.md, docs/13-plan-por-fases.md,
   docs/15-nucleo-plataforma.md, docs/16-arquitectura-multitenant.md y
   docs/17-seguridad-operacion.md.
2. Lee el documento del módulo/área afectado.
3. Comprueba repositorio, rama, HEAD, cambios locales, AGENTS.md y CLAUDE.md.
4. No asumas como implementado nada solo porque aparezca en documentación histórica.

Invariantes:
- Cada iglesia es un tenant aislado.
- People no es Auth; una persona puede existir sin cuenta.
- Campus pertenece al tenant y no es otro tenant.
- Permiso y entitlement son conceptos distintos.
- Datos tenant-aware llevan aislamiento real en base; no basta filtrar en frontend.
- Usa RLS + grants mínimos + constraints tenant-safe + tests negativos.
- Módulos sensibles (Kids, Pastoral, Giving) requieren permisos específicos.
- Las operaciones críticas deben ser idempotentes y auditables.
- Archiva antes que borrar cuando exista historial.
- Reutiliza UI/UX y comportamiento común de Calserv; no inventes otra app visual.
- No migres Alabanza antes de la Fase 11 salvo tarea explícita de preparación.

Antes de implementar, explica brevemente:
- qué fase/tarea estás resolviendo;
- entidades afectadas;
- tenant/scope;
- permisos/entitlements;
- datos sensibles;
- migraciones necesarias;
- tests que vas a ejecutar.

Después implementa solo el alcance autorizado y entrega:
- cambios realizados;
- migraciones;
- pruebas ejecutadas y resultado real;
- decisiones o limitaciones pendientes.
```

## Implementar una tarea concreta

```text
Implementa <tarea> de la Fase <n> del plan vigente.

Lee el documento responsable y sus dependencias. Si crea una nueva entidad tenant-aware,
añade church_id, índices, RLS, grants, constraints cross-tenant y tests de aislamiento.
Si usa un módulo, valida church_modules/entitlement además del rol.
Si afecta a People, no obligues a crear auth.user.
Si afecta a una actividad, revisa el modelo Activity y la zona horaria.
Si afecta a comunicación, crea primero el mensaje persistente y después la entrega.
Si afecta a datos sensibles, minimiza contenido en logs/notificaciones.

No copies patrones antiguos si contradicen los documentos vigentes. No informes de pruebas no ejecutadas.
```

## Revisión arquitectónica antes de merge

```text
Revisa este cambio de LEVITA contra:
- aislamiento tenant;
- scope campus/área/grupo;
- entitlement;
- RLS/grants/FKs;
- privacidad;
- auditoría;
- idempotencia;
- concurrencia;
- archivado;
- import/export;
- observabilidad;
- accesibilidad;
- paridad UI/UX con Calserv.

Lista primero defectos bloqueantes, después riesgos y finalmente mejoras no bloqueantes.
No cambies alcance de producto para simplificar el código.
```
