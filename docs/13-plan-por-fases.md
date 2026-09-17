# Plan por fases vigente

Revisión: **15 de septiembre de 2026 — roadmap integral**.

Este plan sustituye el orden anterior de siete fases. La arquitectura se prepara para una plataforma integral, pero la implementación sigue siendo incremental. **No significa construir todos los módulos antes del MVP.**

## Regla general

Cada fase termina cuando cumple sus criterios de salida y pruebas, no cuando existe una maqueta. Cada fase debe incluir seguridad, RLS, auditoría y experiencia móvil/escritorio aplicables.

---

## Fase 0 · Fundación de producto y arquitectura SaaS

**Resultado:** núcleo estable sobre el que puedan crecer todos los módulos.

### Alcance

- Confirmar repositorios, código reutilizable y UI/UX de Calserv.
- Definir tenant `church` y `campus`.
- Definir People separado de Auth.
- Definir pertenencias, households y relaciones.
- Definir roles/capacidades y scopes.
- Definir catálogo de módulos y `church_modules`.
- Definir entitlements y feature flags.
- Definir raíz de Activity.
- Definir auditoría.
- Definir estrategia de archivos.
- Definir soft delete/archivado.
- Definir import/export.
- Definir observabilidad, jobs y webhooks.
- Definir backup y restauración.
- Definir soporte/impersonación.
- Consolidar RLS, grants y constraints tenant-safe.
- Reutilizar sistema visual, navegación, perfil, tema, campana y comportamiento común de Calserv — **sustituido**: la referencia visual vigente es `imagenes/layout*.png` (ver [D18](07-decisiones.md) y [ADR 0016](adr/0016-referencia-visual-layout.md)); se conserva de Calserv el comportamiento común no visual.

### No incluye todavía

CRUD completo de todos los módulos ni migración de Alabanza.

### Criterio de salida

Existe esquema/ADR aprobado para todas las entidades core, pruebas de aislamiento base y una shell de aplicación reconocible como continuación de Calserv.

### Estado — 16 de septiembre de 2026

**FASE 0: COMPLETADA** para el alcance de fundación descrito arriba. Implementado en el repositorio `levita-app` (ver [D17](07-decisiones.md)):

- 16 ADR en `docs/adr/` cubriendo tenancy, People/Auth, multi-campus, Activity, RBAC, módulos/entitlements/flags, auditoría, archivos, soft-delete, jobs, observabilidad, soporte, RLS y FKs tenant-safe.
- Esquema core en `supabase/migrations/` (churches, campuses, people, church_people, households, tags, custom fields, activities, modules/church_modules/entitlements/feature_flags, capabilities/roles/church_people_roles, funciones de contexto `app.*`, audit_logs, support_sessions, files, import/export jobs, webhooks).
- RLS activo y forzado en las 20 tablas tenant-aware, con política fija (`select app.church_ids_for_user()::uuid[]`) y funciones `security definer` con `search_path` fijo.
- Suite pgTAP (`supabase/tests/`): 20 tests de aislamiento cross-tenant + 20 tests de cobertura RLS automática (uno por tabla tenant-aware), 40/40 en verde.
- `TenantContext` centralizado (`src/server/tenant/tenant-context.ts`), autorización (`authorize.ts`), auditoría (`audit-log.ts`), logger estructurado, convención de errores de dominio, clientes Supabase server/browser/service-role separados.
- Shell de aplicación autenticada (`src/app/(app)/app`) siguiendo `imagenes/layout*.png`: sidebar con 13 módulos + Configuración/Ayuda (ocultos si el módulo no está habilitado), header con búsqueda/sede/campana/perfil, dashboard con stats reales del tenant, responsive con toggle de sidebar en móvil, probado con Playwright (login, aislamiento visual, mobile 390px).
- CI (`.github/workflows/ci.yml`): lint, typecheck, build y suite RLS en cada PR.

**Deuda explícita dejada para fases posteriores:** módulos funcionales son placeholders de navegación (sin CRUD); `import_jobs`/`export_jobs`/webhooks tienen esquema pero ningún worker real; `pg_cron` no tiene ningún job programado todavía; no hay proveedor de observabilidad externo conectado (solo el logger estructurado local); la consola de soporte/impersonación no tiene UI.

---

## Fase 1 · Alta, tenant, sedes, suscripción y onboarding

**Resultado:** una iglesia puede entrar en LEVITA de forma segura y recuperable.

### Alcance

- alta autoservicio;
- alta asistida;
- cuenta propietaria;
- tenant;
- sede principal;
- selector multiiglesia;
- módulos base;
- configuración regional;
- branding básico;
- suscripción/pago;
- provisioning idempotente;
- reanudación de alta;
- gestión inicial de administradores;
- perfil común;
- preferencias y push por dispositivo.

### Criterio de salida

Dos iglesias creadas por flujos diferentes quedan aisladas, con billing y configuración propios, sin duplicados tras reintentos.

---

## Fase 2 · Personas, familias, directorio e importación

**Resultado:** People se convierte en el núcleo real de la iglesia.

### Alcance

- CRUD/archivo de personas;
- invitaciones;
- enlace persona-cuenta;
- estados de relación;
- hogares/familias;
- contactos;
- campus principal opcional;
- etiquetas;
- campos personalizados;
- privacidad del directorio;
- búsqueda y filtros;
- importación CSV/Excel;
- deduplicación asistida;
- exportación administrativa;
- auditoría.

### Criterio de salida

La iglesia puede importar su base de personas, corregir duplicados, crear hogares e invitar cuentas sin perder historial.

---

## Fase 3 · Áreas, puestos, equipos y capacidades

**Resultado:** estructura de voluntariado configurable por tenant.

### Alcance

- áreas iniciales editables;
- áreas nuevas;
- puestos;
- miembros de área;
- líderes;
- equipos;
- capacidades/cualificaciones;
- credenciales;
- reglas de composición;
- criticidad;
- horarios de llegada por puesto;
- permisos scoped por área.

### Criterio de salida

Un líder administra solo sus áreas; una iglesia puede adaptar la estructura sin afectar a otra; las reglas sensibles están modeladas.

---

## Fase 4 · Actividades, plantillas, estructura de servicio y planificación

**Resultado:** programar servicios y otras actividades sin encerrar el producto en “cultos”, y dejar cada actividad preparada (áreas, puestos, requisitos y orden del servicio) para que la Fase 5 asigne personas.

### Nota de alcance — 16 de septiembre de 2026

El alcance de esta fase se ha dividido (ver [ADR 0017](adr/0017-actividades-planificacion-fase-4.md), aceptado el 17 de septiembre de 2026). Asignaciones, conflicto de persona, cálculo de huecos con personas y composición pasan a la Fase 5, porque dependen de disponibilidad y respuestas. **El alcance anterior de la Fase 4 no se completó como tal**: no se construyeron asignaciones, conflictos de persona ni composición. El detalle técnico está en [FASE-4-ACTIVIDADES.md](FASE-4-ACTIVIDADES.md).

### Alcance

- Activity como raíz (sin tabla de extensión);
- tipos y plantillas con copia de estructura;
- actividades puntuales con horario;
- tareas sin hora fija;
- series recurrentes DST-safe con edición de esta, siguientes o toda la serie;
- duplicar actividad;
- áreas, puestos (de catálogo o ad-hoc) y requisitos por actividad, con snapshots del catálogo y overrides;
- cobertura por puesto (mínimos/máximos, sin personas);
- incidencias de estructura (bloqueantes y avisos);
- compatibilidad de sede entre actividad, áreas y puestos;
- orden del servicio (planning);
- borrador/planificada/publicación/cancelación/completada/archivado;
- visibilidad por audiencias y notas administrativas separadas;
- permisos por capability y scope, RLS, escritura solo por RPC y auditoría;
- contrato para la Fase 5 (requisitos efectivos y actividades que admiten asignaciones).

### No incluye

- asignaciones de personas;
- conflicto de persona;
- cálculo de huecos con personas reales;
- composición de equipos;
- elegibilidad por fecha de actividad y con overrides por actividad;
- notificaciones;
- conflicto de recurso (Fase 10);
- formularios, inscripciones, aforo o entradas (Fase 6).

### Criterio de salida

El coordinador prepara y publica una actividad —puntual o recurrente, desde cero o desde plantilla— con varias áreas, puestos y orden del servicio; la publicación solo se permite con estructura válida; cada actividad muestra su cobertura por puesto sin personas; y un líder de área solo gestiona los puestos de su área.

### Estado — 17 de septiembre de 2026

**FASE 4: CERRADA** para el alcance descrito arriba.

- Validada por Carlos en la PR #2 (commit `93eb369`) e integrada en `main` (`b3f5add`).
- Migraciones `20260920000100`–`20260920000900` aplicadas en producción antes del código y verificadas en solo lectura.
- CI en verde (`supabase test db` incluido) y despliegue de producción en Vercel correcto.
- Smoke en producción: enrutado y protección de las rutas nuevas sin sesión, y flujo funcional completo en la base de producción dentro de una transacción con `ROLLBACK` sin dejar datos. Detalle en [FASE-4-ACTIVIDADES.md §9](FASE-4-ACTIVIDADES.md).

**Deuda explícita:** navegación autenticada en navegador no verificada en el cierre; contrastar `database.types.ts` con `supabase gen types`; fijar la versión del CLI de Supabase en el CI; acordar con Diogo el contrato F4/F5 (CO-01, [CONTRATO-F4-F5.md](CONTRATO-F4-F5.md)); elegibilidad por fecha de actividad en Fase 5.

---

## Fase 5 · Disponibilidad, respuestas, sustituciones y notificaciones

**Resultado:** cerrar el ciclo desde propuesta hasta confirmación.

### Nota de estado — 17 de septiembre de 2026

**Parte de Carlos (CA-04/CA-05): en desarrollo** en la rama `feature/carlos-fase-5-asignaciones`, sin nada aplicado en remoto, con las decisiones acordadas por Carlos (D20): estados, cobertura, conflictos, respuestas, cambios de F4, sustituciones, respuesta por representante, permisos y lectura mínima, tareas flexibles, publicación multiárea y enlaces solo autenticados. Lo compartido con Diogo (eventos, deduplicación, disponibilidad, frecuencia, recordatorios, destinatarios y transporte) sigue pendiente de acuerdo. La fase no está cerrada: requiere la parte de Diogo y el recorrido conjunto CO-03. Detalle en [FASE-5-ASIGNACIONES.md](FASE-5-ASIGNACIONES.md) y [CONTRATO-F4-F5.md](CONTRATO-F4-F5.md).

### Alcance

- asignaciones de personas a puestos de actividad (movido desde la Fase 4 el 16 de septiembre de 2026);
- conflicto de persona;
- cálculo de huecos con personas;
- composición de equipos;
- elegibilidad por fecha de actividad y con los requisitos efectivos por actividad (contrato de la Fase 4);
- mis turnos;
- aceptar/rechazar;
- notas privadas de respuesta;
- blockouts;
- frecuencia deseada;
- recordatorios;
- bandeja interna;
- push;
- email;
- preferencias por dispositivo/canal;
- horas de silencio;
- cambios de hora;
- cancelación;
- sustituciones;
- propuesta de reemplazo;
- escalado por criticidad;
- idempotencia y deduplicación de mensajes.

### Criterio de salida

El coordinador asigna personas a una actividad publicada con varias áreas y el sistema calcula correctamente huecos, conflictos de persona y composición, con elegibilidad evaluada en la fecha de la actividad. Una propuesta llega, se responde y actualiza cobertura sin duplicar avisos ni perder estado cuando falla un canal.

---

## Fase 6 · Calendario, eventos, formularios e inscripciones

**Resultado:** LEVITA deja de ser solo un scheduler y empieza a ser plataforma de iglesia.

### Alcance

- calendario unificado;
- eventos internos/públicos;
- formularios configurables;
- inscripciones;
- aforo;
- lista de espera;
- consentimiento;
- asistentes;
- exportación;
- comunicaciones del evento;
- ICS.

Nota (16 de septiembre de 2026): el calendario operativo de actividades de la Fase 4 no cubre formularios públicos, inscripciones, aforo ni entradas; la visibilidad `public_future` no concede acceso anónimo. Todo ello sigue en esta fase.

### Criterio de salida

La iglesia publica un evento, recibe inscripciones mediante formulario y gestiona asistentes dentro del mismo tenant.

---

## Fase 7 · Grupos y discipulado

**Resultado:** gestionar vida comunitaria y formación.

### Alcance

- grupos/células;
- tipos;
- líderes;
- participantes;
- sede/ubicación;
- solicitudes de ingreso;
- reuniones;
- asistencia;
- comunicación de grupo;
- cursos;
- cohortes;
- sesiones;
- itinerarios;
- progreso.

### Criterio de salida

Una persona puede pertenecer a grupos y recorridos sin duplicarse, y los líderes solo acceden a la información necesaria.

---

## Fase 8 · Kids y protección de menores

**Resultado:** check-in infantil seguro e integrado con People.

### Alcance

- perfiles infantiles;
- responsables;
- autorizaciones explícitas;
- clases/salas;
- ratios;
- check-in/out;
- recogida;
- incidencias;
- credenciales de voluntarios;
- controles LOPIVI;
- políticas de datos sensibles.

### Criterio de salida

Un menor entra y sale con trazabilidad y autorización correcta, sin exponer datos a usuarios no autorizados.

---

## Fase 9 · Comunicación segmentada

**Resultado:** comunicación institucional más allá de avisos operativos.

### Alcance

- segmentos por tags, grupos, áreas y criterios permitidos;
- comunicados;
- email;
- push;
- plantillas;
- programación;
- métricas de entrega;
- preferencias/opt-out según canal y finalidad;
- límites y prevención de abuso.

### Criterio de salida

Un administrador autorizado envía una comunicación a un segmento definido sin exportar manualmente listas.

---

## Fase 10 · Recursos, salas y mantenimiento

**Resultado:** coordinar recursos físicos de la iglesia.

### Alcance

- salas;
- equipos;
- vehículos;
- reservas;
- conflictos;
- responsables;
- mantenimiento;
- tareas recurrentes;
- relación con actividades.

### Criterio de salida

Una actividad reserva recursos sin dobles reservas y deja trazabilidad.

---

## Fase 11 · Integración final de Alabanza

**Resultado:** Calserv se incorpora a LEVITA sin perder funciones.

### Alcance

- usuarios/cuentas;
- equipo;
- programación;
- canciones;
- tonalidades;
- repertorios;
- atril;
- ensayos;
- archivos;
- coordinación con Sonido/Multimedia;
- migración/compatibilidad;
- validación con usuarios reales;
- rollback de corte.

### Criterio de salida

Alabanza funciona dentro de la misma iglesia y experiencia, sin doble programación ni pérdida de datos acordados.

---

## Fase 12 · Pastoral, Giving y módulos avanzados

**Resultado:** ampliar LEVITA a dominios de mayor sensibilidad una vez maduro el core.

### Pastoral

- casos;
- responsables;
- notas restringidas;
- tareas;
- peticiones;
- retención específica;
- auditoría.

### Giving

- fondos;
- aportaciones;
- campañas;
- recurrencia;
- integración de pago;
- exportación contable;
- permisos financieros.

### Analítica avanzada

- dashboards por módulo;
- métricas agregadas;
- tendencias;
- exportaciones.

Estas capacidades no bloquean el MVP.

---

## Fase 13 · Hardening, piloto ampliado y escala

**Resultado:** convertir el producto funcional en servicio SaaS operable profesionalmente.

### Alcance

- pruebas de aislamiento por todos los módulos;
- pentest/revisión de seguridad según madurez;
- observabilidad;
- alertas;
- rate limits;
- backup/restore probado;
- runbooks;
- procesos de soporte;
- impersonación auditada;
- pruebas de billing;
- cancelación/retención;
- performance;
- accesibilidad;
- pruebas multi-dispositivo;
- pruebas con varias sedes;
- importaciones grandes;
- resiliencia de proveedores;
- métricas de adopción;
- documentación operativa.

### Criterio de salida

No quedan fallos críticos de aislamiento, pérdida de datos, permisos, cobro o recuperación; la operación puede diagnosticar y asistir sin acceso indiscriminado.

---

# Prioridad comercial recomendada

## MVP vendible

Fases **0–5**.

Ofrece un producto sólido de iglesia + personas + voluntariado + programación.

## Plataforma eclesial inicial

Fases **6–9**, priorizadas con pilotos.

## Expansión

Fases **10–12**.

## Hardening

La Fase 13 no debe interpretarse como “seguridad al final”: sus prácticas aplicables se implementan desde la Fase 0. La fase agrupa la validación de escala y operación antes de crecimiento comercial fuerte.

# Dependencias críticas

- People antes de Groups/Kids/Pastoral/Giving.
- Activity antes de Events/Serving/Facilities.
- Communications core antes de campañas masivas.
- Entitlements antes de monetizar módulos.
- Auditoría antes de soporte con impersonación.
- Households antes de Kids.
- Permisos sensibles antes de Pastoral/Giving.
- API pública después de estabilizar contratos internos.

# Lo que NO debe hacerse

- construir cada módulo con su propia tabla de usuarios;
- usar `church_id` solo en frontend;
- convertir cada diferencia de iglesia en código específico;
- migrar Alabanza prematuramente;
- implementar Kids/Pastoral/Giving con permisos genéricos;
- usar plan de pago como rol;
- ocultar rutas como único control de acceso;
- lanzar comunicación masiva sin preferencias, límites y auditoría.
