# Módulo Facilities — Instalaciones, recursos y mantenimiento

## Entidades

- `resources`
- `resource_types`
- `rooms`
- `resource_reservations`
- `maintenance_tasks`
- `maintenance_schedules`

## Recursos

- salas;
- auditorios;
- vehículos;
- cámaras;
- proyectores;
- material infantil;
- equipos de sonido;
- llaves/activos cuando tenga sentido.

## Reglas

- pertenencia a tenant;
- campus opcional/obligatorio según recurso;
- disponibilidad;
- conflictos de reserva;
- responsables;
- estado fuera de servicio;
- mantenimiento preventivo;
- historial.

## Integración

Una Activity puede reservar recursos. Cancelar la actividad libera o cancela reservas según política explícita.
