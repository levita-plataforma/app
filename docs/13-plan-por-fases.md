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
- Reutilizar sistema visual, navegación, perfil, tema, campana y comportamiento común de Calserv.

### No incluye todavía

CRUD completo de todos los módulos ni migración de Alabanza.

### Criterio de salida

Existe esquema/ADR aprobado para todas las entidades core, pruebas de aislamiento base y una shell de aplicación reconocible como continuación de Calserv.

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

## Fase 4 · Actividades, cultos, plantillas y programación

**Resultado:** programar servicios y otras actividades sin encerrar el producto en “cultos”.

### Alcance

- Activity;
- tipos/plantillas;
- cultos recurrentes;
- actividades puntuales;
- tareas/turnos sin culto;
- puestos necesarios;
- asignaciones;
- duplicar programación;
- recurrencia DST-safe;
- conflicto de persona;
- conflicto de recurso cuando aplique;
- cobertura;
- borrador/publicación/cancelación;
- resumen previo a publicación.

### Criterio de salida

El coordinador prepara y publica una actividad con varias áreas y el sistema calcula correctamente huecos, conflictos y composición.

---

## Fase 5 · Disponibilidad, respuestas, sustituciones y notificaciones

**Resultado:** cerrar el ciclo desde propuesta hasta confirmación.

### Alcance

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

Una propuesta llega, se responde y actualiza cobertura sin duplicar avisos ni perder estado cuando falla un canal.

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
