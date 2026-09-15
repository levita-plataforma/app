# Matriz de cobertura funcional y arquitectónica

Revisión: **15 de septiembre de 2026**.

Esta matriz sirve como control de que la plataforma integral no dependa de supuestos implícitos.

| Dominio | Core preparado | Fase principal | Sensibilidad | Notas |
|---|---:|---:|---|---|
| Tenants / iglesias | Sí | 0–1 | Alta | aislamiento, provisioning, billing |
| Multi-campus | Sí | 0–1 | Media | sede dentro del tenant |
| Auth / sesiones | Sí | 0–1 | Alta | cuenta global |
| Personas | Sí | 2 | Personal | persona ≠ cuenta |
| Familias / hogares | Sí | 2 | Personal | base para Kids |
| Directorio | Sí | 2 | Personal | privacidad configurable |
| Tags / campos personalizados | Sí | 2 | Variable | no sustituye módulos sensibles |
| Importación / exportación | Sí | 2+ | Alta | jobs auditados |
| Áreas / voluntariado | Sí | 3 | Personal | Serving |
| Equipos | Sí | 3 | Personal | asignación en bloque |
| Cualificaciones | Sí | 3 | Personal | niveles y credenciales |
| Actividades | Sí | 4 | Variable | raíz temporal común |
| Cultos / servicios | Sí | 4 | Media | plantillas, puestos |
| Turnos sin culto | Sí | 4 | Media | tareas/franjas |
| Disponibilidad | Sí | 5 | Personal | blockouts y frecuencia |
| Notificaciones | Sí | 5 | Personal | persistencia + canales |
| Calendario | Sí | 6 | Variable | unificado |
| Formularios | Sí | 6 | Variable | clasificación por formulario |
| Inscripciones | Sí | 6 | Personal | aforo/lista espera |
| Grupos / células | Sí | 7 | Personal | líderes, miembros, asistencia |
| Discipulado / cursos | Sí | 7 | Personal | progreso |
| Kids / check-in | Sí | 8 | Restringida | autorizaciones y LOPIVI |
| Comunicación segmentada | Sí | 9 | Personal | opt-outs, límites |
| Recursos / salas | Sí | 10 | Interna | reservas/conflictos |
| Alabanza | Sí | 11 | Personal | integración Calserv |
| Pastoral | Sí | 12 | Restringida | ACL propia |
| Giving | Sí | 12 | Restringida | financiero, no contabilidad completa |
| Analytics | Sí | 12+ | Variable | agregación y permisos |
| API / webhooks | Sí | progresivo | Alta | contratos versionados |
| Auditoría | Sí | 0+ | Alta | transversal |
| Feature flags | Sí | 0+ | Interna | rollout, no auth |
| Entitlements | Sí | 0–1 | Comercial | separado de roles |
| Soporte / impersonación | Sí | 0/13 | Alta | temporal y auditado |
| Observabilidad | Sí | 0+ | Técnica | sin PII innecesaria |
| Backup / restore | Sí | 0/13 | Alta | restauración probada |
| RGPD / retención | Sí | 0+ | Alta | transversal |

## Cobertura de áreas de servicio

Referencias actuales:

1. Alabanza y música.
2. Sonido.
3. Multimedia y streaming.
4. Dirección y predicación.
5. Bienvenida y ujieres.
6. Niños y escuela dominical.
7. Adolescentes y jóvenes.
8. Intercesión y oración.
9. Diaconía, ofrenda y santa cena.
10. Hospitalidad y café.
11. Limpieza y mantenimiento.
12. Traducción y accesibilidad.
13. Seguridad y emergencias.
14. Parking, movilidad y logística.
15. Conexión y seguimiento de nuevos.
16. Eventos, protocolo y producción.

Estas áreas no son un catálogo contractual. Una iglesia puede crear otras como matrimonios, mayores, evangelismo, misiones, comunicación, administración, librería, cocina, danza o apoyo social sin que LEVITA necesite código específico siempre que sus necesidades encajen en módulos existentes.

## Casos que requieren módulo, no solo un área

- células/grupos → Groups;
- formación bíblica → Discipleship;
- check-in de menores → Kids;
- seguimiento pastoral → Pastoral;
- donaciones → Giving;
- reservas de edificio → Facilities;
- campañas → Communications;
- inscripciones → Events.

## Control antes de declarar “plataforma completa”

La promesa comercial debe reflejar módulos realmente disponibles. El hecho de que la arquitectura los contemple no permite anunciar como implementado Kids, Giving, Pastoral u otros módulos todavía no construidos.
