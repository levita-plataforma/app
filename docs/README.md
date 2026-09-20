# Documentación de LEVITA

Revisión documental: **15 de septiembre de 2026 — arquitectura integral multi-tenant**.

LEVITA se documenta como una **plataforma SaaS modular para iglesias evangélicas**, preparada para operar múltiples tenants, sedes y módulos con aislamiento, permisos, suscripción y evolución independiente.

## 1. Estado de esta documentación

Esta documentación define el **producto objetivo y el orden de implementación**. No debe interpretarse como evidencia de que todas las funciones descritas ya estén construidas.

Estados usados:

- **Especificado:** comportamiento requerido.
- **Decidido:** criterio de producto/arquitectura aprobado en documentación.
- **Histórico:** afirmación procedente de backlogs o repositorios anteriores que debe verificarse contra el código real.
- **Implementado:** solo cuando exista código verificable en el repositorio correspondiente.
- **Verificado:** pruebas ejecutadas contra una versión concreta.
- **Desplegado:** comprobado en un entorno/URL concreto.

El checkout que originó estos documentos contenía principalmente la landing; los repositorios históricos citados fueron `Documents/Levitaapp` y `Documents/Calserv`. Antes de programar, comprobar siempre repositorio, rama, HEAD y cambios locales.

## 2. Qué documento manda

| Documento | Responsabilidad |
|---|---|
| [00 · Visión](00-vision.md) | Alcance integral, principios, módulos y estrategia |
| [01 · Modelo de dominio](01-modelo-dominio.md) | Vocabulario e invariantes de negocio |
| [02 · Datos y RLS](02-datos-y-rls.md) | Seguridad de filas, columnas, scopes y tests |
| [03 · Notificaciones](03-notificaciones.md) | Mensajes, canales, preferencias y campañas |
| [04 · Aplicaciones](04-apps.md) | Superficies, navegación y experiencia común |
| [05 · Despliegue](05-despliegue.md) | Entornos, CI/CD, observabilidad y backups |
| [06 · Facturación](06-facturacion.md) | Planes, suscripción y entitlements |
| [07 · Decisiones](07-decisiones.md) | Decisiones vigentes y cuestiones abiertas |
| [08 · RGPD/LOPIVI](08-rgpd-y-lopivi.md) | Privacidad y datos sensibles |
| [09 · Flujos](09-flujos.md) | Recorridos end-to-end |
| [10 · Brief de diseño](10-brief-diseno.md) | Pantallas y criterios visuales |
| [11 · Escenarios](11-escenarios-diseno.md) | Datos consistentes para diseño/prueba |
| [12 · Iglesias y tenants](12-iglesias-y-tenants.md) | Alta, sedes, configuración y aislamiento |
| [13 · Plan por fases](13-plan-por-fases.md) | Roadmap vigente 0–13 |
| [14 · Referencia UI/UX](14-referencia-uiux-alabanza.md) | Calserv como base de experiencia común |
| [15 · Núcleo](15-nucleo-plataforma.md) | Entidades core transversales |
| [16 · Arquitectura multi-tenant](16-arquitectura-multitenant.md) | Modelo SaaS profesional |
| [17 · Seguridad y operación](17-seguridad-operacion.md) | Threat model, secure SDLC, soporte y continuidad |
| [18 · Módulos funcionales](18-modulos-funcionales.md) | Catálogo y fronteras de módulos |
| [19 · Integraciones y datos](19-integraciones-y-datos.md) | API, webhooks, import/export y portabilidad |
| [20 · Matriz de cobertura](20-matriz-cobertura.md) | Control de dominios, fases y sensibilidad |
| [Changelog documental](CHANGELOG-DOCUMENTACION.md) | Resumen de la ampliación integral |
| [Áreas](areas/00-indice.md) | Necesidades específicas de áreas de servicio |
| [Módulos](modulos/00-indice.md) | Especificaciones por dominio funcional |
| [Backlog histórico](TAREAS.md) | Trabajo antiguo; no sustituye al roadmap vigente |
| [Prompt Claude Code](PROMPT-CLAUDE-CODE.md) | Instrucciones para desarrollar contra esta arquitectura |

## 3. Orden de autoridad

Cuando dos documentos parezcan entrar en conflicto:

1. decisiones confirmadas más recientes;
2. visión y plan vigente;
3. arquitectura/core;
4. dominio y permisos;
5. módulo/área específica;
6. flujos;
7. diseño/escenarios;
8. backlog histórico.

Una implementación antigua no invalida una decisión de producto nueva; requiere migración o adaptación explícita.

## 4. Arquitectura resumida

```text
LEVITA SaaS
├── Platform Admin / Operación
└── Church Tenant
    ├── Campus
    ├── People & Households
    ├── Roles / Permissions
    ├── Modules / Entitlements
    ├── Activities
    ├── Serving
    ├── Worship
    ├── Groups
    ├── Discipleship
    ├── Events
    ├── Kids
    ├── Communications
    ├── Pastoral
    ├── Giving
    ├── Facilities
    └── Analytics
```

## 5. Roadmap resumido

- **F0:** fundación SaaS.
- **F1:** tenant, sedes, suscripción y onboarding.
- **F2:** personas, familias e importación.
- **F3:** áreas, puestos y equipos.
- **F4:** actividades, plantillas, estructura de servicio y planificación.
- **F5:** asignaciones, disponibilidad, respuestas y notificaciones.
- **F6:** eventos, calendario, formularios e inscripciones.
- **F7:** grupos y discipulado.
- **F8:** Kids.
- **F9:** comunicación segmentada.
- **F10:** recursos e instalaciones.
- **F11:** integración de Alabanza/Calserv.
- **F12:** Pastoral, Giving y módulos avanzados.
- **F13:** hardening, piloto ampliado y escala.

Fases 0–5 forman el MVP comercial recomendado. El detalle está en [13-plan-por-fases.md](13-plan-por-fases.md).

## 6. Reglas para desarrollo

Antes de crear una tabla, endpoint o pantalla:

- identificar tenant y scope;
- comprobar módulo/entitlement;
- definir capacidades;
- clasificar privacidad;
- definir auditoría;
- definir archivado/retención;
- definir import/export si aplica;
- definir estados vacíos/error;
- escribir tests tenant-crossing negativos;
- revisar si ya existe componente/patrón en Calserv.

## 7. Mantenimiento documental

Al cambiar una regla:

1. actualizar documento responsable;
2. actualizar ejemplos/flujo;
3. revisar permisos y privacidad;
4. revisar roadmap si cambia dependencia;
5. registrar decisión si existía alternativa relevante.

No marcar una fase como completada solo por tener documentación o diseño.

## Colaboración y reparto del trabajo

- [Funcionamiento y normas de trabajo](../FUNCIONAMIENTO.md): ramas por tarea y validación expresa del propietario antes de integrar en `main`.
- [Plan de trabajo compartido](PLAN-TRABAJO-COMPARTIDO.md): propuesta para dos personas con dependencias, tareas y cierres conjuntos.
- [Encargo para Claude — Fase 4](PROMPT-CLAUDE-FASE-4.md): alcance de actividades y planificación adaptado al encargo de Diogo, con revisión obligatoria de Carlos.
- [Reparto por nombres — Carlos y Diogo](REPARTO-CARLOS-DIOGO.md): responsables, tareas, dependencias y cierres conjuntos.
- [Registro de integraciones](REGISTRO-INTEGRACIONES.md): quién validó qué y cuándo, para lo que no pasó por una pull request.
- [Encargo para Claude — Fase 5](PROMPT-CLAUDE-FASE-5.md): modos Carlos/Diogo, contratos con F4, pruebas y cierre conjunto.
- [Encargo para Claude — Fase 7](PROMPT-CLAUDE-FASE-7.md): Carlos, grupos y discipulado, contratos con F4–F6 y validación antes de main.
- [Encargo para Claude — Fase 10](PROMPT-CLAUDE-FASE-10.md): Carlos, recursos, reservas sin solapes y mantenimiento integrado con Activity.
