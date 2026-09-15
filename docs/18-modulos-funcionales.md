# Catálogo de módulos funcionales

Revisión: **15 de septiembre de 2026**.

LEVITA es modular. Este catálogo define la frontera de cada módulo para impedir solapamientos y permitir una evolución comercial ordenada.

## 1. People — Personas y familias

Objetivo: fuente central de identidad humana dentro de la iglesia.

Incluye:

- perfiles;
- estado de relación con la iglesia;
- hogares/familias;
- datos de contacto;
- etiquetas;
- campos personalizados;
- directorio con privacidad;
- importación/exportación;
- historial de pertenencias permitido;
- vinculación con cuenta.

No incluye notas pastorales sensibles ni transacciones financieras.

## 2. Serving — Voluntarios y servicios

Incluye:

- áreas/ministerios;
- puestos;
- equipos;
- cualificaciones;
- disponibilidad;
- bloqueos;
- frecuencia deseada;
- plantillas de servicio;
- necesidades;
- asignaciones;
- confirmaciones;
- sustituciones;
- cobertura;
- recordatorios.

Las fichas específicas siguen en [Áreas](areas/00-indice.md).

## 3. Worship — Alabanza

Incluye:

- músicos y voces;
- canciones;
- tonalidades;
- repertorios;
- sets;
- atril;
- ensayos;
- archivos musicales permitidos;
- programación;
- coordinación con Sonido y Multimedia.

Debe preservar los flujos válidos de Calserv.

## 4. Groups — Grupos y células

Incluye:

- grupos;
- tipo de grupo;
- sede/ubicación;
- líderes;
- participantes;
- capacidad;
- reuniones;
- asistencia;
- solicitudes para unirse;
- visibilidad pública/interna;
- comunicación segmentada.

## 5. Discipleship — Formación y recorridos

Incluye:

- cursos;
- cohortes;
- sesiones;
- materiales;
- asistencia;
- etapas;
- requisitos;
- progreso;
- finalización;
- responsables.

Ejemplos: nuevos creyentes, bautismo, membresía, liderazgo, formación bíblica.

## 6. Events — Eventos, calendario y formularios

Incluye:

- eventos públicos/internos;
- calendario;
- recurrencia;
- inscripciones;
- aforo;
- lista de espera;
- tickets gratuitos o de pago si se aprueba;
- formularios;
- consentimientos;
- campos personalizados;
- check-in de eventos no infantiles;
- comunicaciones del evento.

## 7. Kids — Niños y seguridad

Incluye:

- perfiles infantiles;
- responsables autorizados;
- relación familiar;
- salas/clases;
- edades;
- check-in/out;
- código o mecanismo de recogida;
- ratios;
- alergias/datos relevantes con minimización;
- voluntarios autorizados;
- cumplimiento LOPIVI;
- registro de incidencias con permisos restrictivos.

No almacenar información médica innecesaria.

## 8. Communications — Comunicación

Incluye:

- comunicados;
- segmentación;
- plantillas;
- email;
- push;
- bandeja interna;
- preferencias;
- programación de envíos;
- métricas de entrega;
- futuras integraciones SMS/WhatsApp cuando sean comercial y legalmente viables.

Las notificaciones operativas de Serving usan el mismo motor, pero sus reglas pertenecen a Serving.

## 9. Pastoral — Acompañamiento

Módulo de acceso restringido.

Incluye:

- solicitudes;
- casos;
- responsables;
- tareas de seguimiento;
- estado;
- recordatorios;
- notas con acceso granular;
- derivación;
- cierre;
- retención específica.

No debe ser visible por administradores generales por defecto. El acceso depende de una capacidad pastoral explícita.

## 10. Giving — Donaciones y fondos

Fuera del MVP inicial, pero previsto arquitecturalmente.

Incluye potencialmente:

- donantes;
- fondos;
- aportaciones;
- campañas;
- recurrencia;
- conciliación con proveedor;
- recibos;
- exportación contable;
- privacidad financiera.

No convertir LEVITA en sistema contable completo sin una decisión específica.

## 11. Facilities — Instalaciones y recursos

Incluye:

- sedes;
- salas;
- equipamiento;
- vehículos;
- disponibilidad;
- reservas;
- responsables;
- mantenimiento;
- conflictos de reserva;
- tareas recurrentes.

## 12. Analytics — Informes

Incluye métricas agregadas y operativas:

- participación;
- asistencia;
- cobertura de turnos;
- tasa de respuesta;
- carga de voluntariado;
- actividad de grupos;
- inscripciones;
- adopción de módulos;
- crecimiento de base de personas;
- métricas de comunicación.

Los informes respetan permisos y no deben inferir datos sensibles innecesarios.

## 13. Admin / Platform

Funciones exclusivas de operación LEVITA:

- provisioning;
- catálogo de planes;
- entitlements;
- soporte;
- health de tenants;
- incidencias;
- billing;
- feature flags;
- auditoría de plataforma.

No equivale a tener acceso directo e ilimitado al contenido de cada iglesia.

## 14. Dependencias entre módulos

```text
Core
├── People
├── Events
├── Communications
├── Serving ──> People + Events + Communications
├── Worship ──> Serving + People + Events
├── Groups ──> People + Events + Communications
├── Discipleship ──> People + Events
├── Kids ──> People + Events + Communications
├── Pastoral ──> People + Communications
├── Giving ──> People
├── Facilities ──> Events
└── Analytics ──> lecturas agregadas de módulos habilitados
```

## 15. Regla comercial

Un módulo desactivado:

- no aparece en navegación;
- no permite crear nuevos datos;
- conserva datos existentes según política de cancelación;
- puede permitir exportación administrativa;
- no borra información automáticamente por cambio de plan.
