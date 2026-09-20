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

**Parte de Carlos (CA-04/CA-05): integrada y aplicada en producción** el 17 de septiembre de 2026 (validación del commit `f9cb5b4`, PR #4, merge `a9fd3c8`), con las decisiones acordadas por Carlos (D20): estados, cobertura, conflictos, respuestas, cambios de F4, sustituciones, respuesta por representante, permisos y lectura mínima, tareas flexibles, publicación multiárea y enlaces solo autenticados. Detalle en [FASE-5-ASIGNACIONES.md](FASE-5-ASIGNACIONES.md).

**Disponibilidad, frecuencia y avisos (DI-01 y DI-02): integrados y aplicados en producción** el 18 de septiembre de 2026 (PR #5, merge `8894c88`), con el envío externo desactivado y la tarea programada una vez al día. Los asumió Carlos (D21) y Diogo aprobó sus reglas de producto. **CO-03 recorrido y validado por Carlos el 20 de septiembre de 2026, sin fallos: FASE 5 CERRADA.**

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

Nota (20 de septiembre de 2026): los límites de la inscripción pública suben a **200 altas por evento cada 10 minutos** y **10 por correo y hora** (`20260930000400`). Los anteriores —50 y 5— rechazaban a gente real en una apertura de inscripciones anunciada a la vez, que es justo cuando todo el mundo entra de golpe, y no añadían protección: la defensa la sostiene el límite por correo, porque agotar el de evento exige 200 buzones válidos en diez minutos.

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

Nota sobre «grupos»: la segmentación por grupo queda reservada en el modelo —el campo `group` está en la lista de reglas permitidas— pero **rechazada explícitamente en tiempo de ejecución**, no fingida.

Cuando se escribió esta fase la Fase 7 no existía. Ya existe, y aun así sigue rechazada a propósito: no es cuestión de esquema, que no habría que tocar, sino de permisos. Escribir a los participantes de un grupo privado exige permiso **sobre ese grupo**, como quedó resuelto en la Fase 7 con `app.notify_group_members`; habilitarlo desde comunicaciones con solo la capacidad de comunicación abriría por detrás lo que aquella cerró por delante. La pregunta —qué permiso manda al escribir a un grupo, el del grupo o el de comunicaciones— la respondió Carlos el 20 de septiembre de 2026: manda el del grupo, y por eso la segmentación por grupo se queda rechazada.

### Criterio de salida

Un administrador autorizado envía una comunicación a un segmento definido sin exportar manualmente listas.

### Estado — 20 de septiembre de 2026

**FASE 9: PRODUCCIÓN.** Integrada en main (merge `37945fa`), migraciones
aplicadas el 19 de septiembre y pantallas comprobadas por Carlos en producción
el 20 de septiembre de 2026. El envío externo sigue desactivado: las
comunicaciones por correo se quedan en cola y no sale nada hacia nadie.

Construida por Diogo en `feature/diogo-fase-9-comunicacion`, reconciliada por él
con la Fase 7 y con Kids, e iterada después con categorías opcionales,
segmentación con OR, preferencias por categoría y baja por enlace. Revisada en
`hotfix/fase-9-comunicacion`, que corrige seis cosas:

- Crear o archivar una plantilla o un segmento **fallaba siempre**: la escritura
  directa estaba revocada y las RPC que el código daba por hechas no existían.
- Una comunicación solo por correo se marcaba **«Enviada»** aunque no saliera
  nada. Se añade el estado `queued`, que la interfaz muestra como «En cola, sin
  enviar»: el transporte externo sigue desactivado (D20 y D21) y decir lo
  contrario engaña a quien la manda.
- El canal de la aplicación **ignoraba las preferencias** de la persona, que sí
  se respetaban para el correo.
- `app.resolve_segment_recipients`, que es interna, estaba concedida a
  `authenticated`.
- El **enlace de baja no funcionaba con sesión abierta**: la función estaba
  concedida solo a `anon`, pero la página pública usa el cliente del usuario, así
  que un enlace válido respondía que no lo era.
- Diez wrappers de `public` **no tenían el `revoke` explícito**, así que `anon`
  los alcanzaba. No era explotable —son security invoker y la función de `app`
  que llaman sí está cerrada, de modo que una sesión anónima recibe 42501 al
  llegar abajo—, pero el proyecto revoca siempre en las dos capas.

Los arreglos van en `20261001001200`, aparte de las once migraciones de la fase
(`20261001000100`–`20261001001100`), para no pisar el trabajo en curso.
Batería completa con las cinco fases conviviendo: 1360 aserciones en 26 suites,
sin fallos.

**Decidido el 20 de septiembre de 2026 (Carlos):** la segmentación por grupo
**se queda rechazada**. No es una limitación técnica pendiente de resolver, es
la respuesta: habilitarla con solo la capacidad de comunicación permitiría
escribir a los miembros de un grupo privado a quien no tiene acceso a ese grupo,
abriendo por detrás lo que la Fase 7 cerró por delante. Si algún día se pide de
verdad, el camino es exigir permiso sobre el grupo concreto cruzando
`app.group_cap`, como hace `app.notify_group_members`; mientras nadie lo pida,
no se construye.

**Comprobado en pantalla** por Carlos el 20 de septiembre de 2026, que es lo
que permite decir «producción» y no solo «integrada».

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

### Estado — 20 de septiembre de 2026

**Giving (parte de Diogo): IMPLEMENTADA** en `feature/diogo-fase-12-giving`, pendiente de validación
de Carlos e integración en `main`. Cubre fondos, campañas, aportaciones (dinero en `amount_minor`
bigint, nunca float), donante opcional/anónimo, recurrencia modelada sin cobro automático, refunds con
tope validado server-side, conciliación simple, exportación CSV con mitigación de inyección de fórmula,
resumen agregado separado del detalle (`giving.read_summary` ≠ `giving.read_contributions`), y
`church_owner`/`church_admin` **sin** acceso automático al detalle financiero (deny-by-default, D10).
Implementado directamente sin contrato documental separado (instrucción explícita del encargo). Ver
[FASE-12-GIVING.md](FASE-12-GIVING.md). Migraciones `20261003000100` a `20261003001200`. Batería
completa del repositorio: 1423 aserciones en verde, sin drift de esquema.

Sin proveedor de pago real conectado: cobro online, webhooks y reconciliación bancaria automática
quedan preparados arquitectónicamente (contrato `GivingPaymentProvider`, columnas
`provider`/`provider_payment_ref`) pero no implementados — no hay proveedor que los dispare (mismo
criterio que A14 en Fase 9). Registro manual (efectivo/transferencia), fondos, campañas, recurrencia
modelada, conciliación y reporting son completamente operativos.

**Pastoral y Analítica avanzada no iniciadas.** F12 no se declara completa: son entregas separadas
según `docs/REPARTO-CARLOS-DIOGO.md` §4.

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
