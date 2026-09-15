# Módulos Groups y Discipleship

## Objetivo

Gestionar comunidad, células, pequeños grupos y procesos de formación sin reutilizar incorrectamente las áreas de servicio.

## Entidades de Groups

- `groups`
- `group_types`
- `group_members`
- `group_leaders`
- `group_meetings`
- `group_attendance`
- `group_join_requests`

## Datos de grupo

- tenant;
- campus;
- nombre;
- descripción;
- tipo;
- visibilidad;
- capacidad;
- edad/segmento opcional;
- ubicación;
- periodicidad;
- líderes;
- estado.

## Flujos

- crear grupo;
- invitar/agregar miembros;
- solicitud para unirse;
- aceptar/rechazar solicitud;
- programar reunión;
- registrar asistencia;
- comunicar al grupo;
- archivar grupo preservando historial.

## Discipleship

Entidades:

- `courses`
- `course_cohorts`
- `course_sessions`
- `course_enrollments`
- `learning_paths`
- `path_steps`
- `person_path_progress`

Casos: nuevos creyentes, bautismo, membresía, liderazgo, formación bíblica.

## Permisos

Un líder de grupo ve datos necesarios de participantes de su grupo, no el directorio completo. Datos sensibles requieren permisos adicionales.

## Métricas

- grupos activos;
- capacidad;
- asistencia;
- solicitudes pendientes;
- finalización de cursos;
- progreso por itinerario.
