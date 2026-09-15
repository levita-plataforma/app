# Módulo Analytics — Informes y métricas

## Objetivo

Dar visibilidad operacional sin crear un data warehouse prematuramente ni exponer datos sensibles.

## Métricas iniciales

### Serving
- cobertura;
- pendientes;
- rechazos;
- frecuencia;
- carga por voluntario;
- huecos críticos.

### People
- altas;
- personas activas;
- perfiles incompletos;
- invitaciones.

### Groups
- grupos activos;
- asistencia;
- capacidad.

### Events
- inscripciones;
- asistencia;
- no-show;
- aforo.

### Communications
- enviados;
- entregados;
- rebotes;
- interacción si proveedor lo permite.

## Reglas

- tenant isolation;
- filtros por campus cuando aplique;
- agregación para datos sensibles;
- no inferir atributos religiosos o pastorales innecesarios;
- exportación con permisos;
- documentar definición de cada KPI.
