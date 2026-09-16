# Núcleo de plataforma

Revisión: **16 de septiembre de 2026**.

Este documento define las entidades transversales que deben existir antes de ampliar LEVITA a módulos de negocio. El objetivo es evitar que Serving, Alabanza, Grupos, Kids o Pastoral creen conceptos incompatibles entre sí.

**Estado de implementación (Fase 0):** implementado en `supabase/migrations/` del repositorio `levita-app`. Ver el detalle de decisión en `docs/adr/0001` a `docs/adr/0014` y el resumen de estado en [13-plan-por-fases.md](13-plan-por-fases.md#estado--16-de-septiembre-de-2026). Los archivos (§10) tienen tabla de metadatos y políticas base, sin ningún flujo de subida de módulo concreto todavía.

## 1. Tenant e iglesia

`churches` representa el tenant contractual y de seguridad. Contiene identidad estable, slug, estado, zona horaria principal, locale, moneda, configuración y referencia de suscripción.

Estados sugeridos:

- `provisioning`;
- `trial` si se aprueba comercialmente;
- `active`;
- `past_due`;
- `suspended`;
- `cancelling`;
- `archived`.

No borrar físicamente un tenant por una acción ordinaria de UI. La eliminación definitiva requiere flujo específico y políticas de retención.

## 2. Sedes

`campuses` pertenece a `churches` y permite representar una o varias localizaciones.

Campos conceptuales:

- `id`;
- `church_id`;
- `name`;
- `slug` interno;
- dirección;
- zona horaria opcional;
- teléfono/correo público;
- `is_primary`;
- `status`;
- orden.

Una entidad funcional puede ser de toda la iglesia o estar vinculada a una sede. No obligar a una sede si no aporta valor.

## 3. Personas

`people` es el registro humano central. No equivale a `auth.users`.

Debe poder representar:

- miembro;
- visitante;
- voluntario;
- líder;
- niño;
- tutor;
- persona externa invitada a predicar;
- persona sin cuenta digital;
- persona archivada.

`people.user_id` continúa siendo nullable. La asociación de una cuenta no debe crear otra persona si ya existe una coincidencia validada.

### Datos recomendados

Separar identidad básica, contacto y datos opcionales. No acumular todo en una tabla monolítica si se vuelve sensible o escaso.

- nombre y apellidos;
- nombre preferido;
- foto/avatar;
- fecha de nacimiento cuando exista finalidad legítima;
- email y teléfonos;
- dirección opcional;
- idioma;
- estado;
- notas generales no sensibles;
- consentimiento/visibilidad del directorio;
- fechas de alta/archivo.

Los datos pastorales, financieros y de menores no se guardan en campos genéricos de `people`.

## 4. Pertenencia a la iglesia

Una persona puede estar registrada dentro de una iglesia sin ser miembro formal. La relación debe modelarse explícitamente, por ejemplo `church_people` o equivalente, con:

- `church_id`;
- `person_id`;
- tipo/estado de relación;
- fecha de incorporación;
- campus principal opcional;
- visibilidad en directorio;
- estado activo/archivado.

La cuenta global puede vincular a personas distintas en tenants diferentes si fuera necesario por calidad de datos, aunque debe favorecerse una identidad coherente cuando esté validada.

## 5. Familias y hogares

Incorporar desde el núcleo:

- `households`;
- `household_members`;
- tipo de relación;
- contactos principales;
- dirección compartida opcional.

No asumir matrimonio heterosexual, padre/madre únicos ni una sola dirección. Las relaciones deben ser configurables y suficientemente neutrales para representar tutores, responsables y convivencia.

Para Kids, la autorización de recogida será una relación específica, no una inferencia automática por compartir household.

## 6. Etiquetas y campos personalizados

Cada iglesia necesita adaptar su información sin cambios de esquema.

### Etiquetas

`tags` y `person_tags` para segmentación manual o automática:

- nuevos;
- líderes;
- jóvenes;
- matrimonios;
- voluntarios;
- seguimiento;
- etc.

Las etiquetas pertenecen al tenant.

### Campos personalizados

`custom_field_definitions` + valores tipados. Deben definir:

- entidad objetivo;
- nombre;
- tipo (`text`, `number`, `date`, `boolean`, `select`, etc.);
- opciones;
- si es sensible;
- visibilidad mínima;
- orden;
- activo/archivado.

Nunca usar campos personalizados para saltarse requisitos de seguridad de módulos sensibles.

## 7. Actividad genérica

LEVITA necesita un concepto común por encima de `events` para evitar que todo sea tratado como culto.

Modelo conceptual:

```text
Activity
├── Service / culto
├── Meeting / reunión
├── Event / evento
├── CourseSession / sesión de curso
├── GroupMeeting / reunión de grupo
├── Rehearsal / ensayo
├── Task / tarea
└── Shift / turno operativo
```

La implementación puede usar una tabla `activities` con tipo y extensiones especializadas o mantener tablas especializadas conectadas a una raíz común. La decisión física se toma al diseñar el esquema, pero las reglas conceptuales son:

- identidad única;
- tenant obligatorio;
- campus opcional;
- fecha/hora y zona horaria;
- estado;
- organizadores;
- visibilidad;
- recurrencia opcional;
- enlaces a recursos y formularios;
- auditoría.

Esto resuelve los turnos por franja horaria sin obligarlos a pertenecer a un culto.

## 8. Módulos y entitlements

Separar tres conceptos:

1. **módulo disponible en el producto**;
2. **módulo habilitado/contratado por la iglesia**;
3. **permiso del usuario dentro de ese módulo**.

Entidades conceptuales:

- `modules`;
- `church_modules`;
- `plan_entitlements`;
- `church_entitlement_overrides` cuando la operación lo necesite.

Ejemplos de módulos:

- `people`;
- `serving`;
- `worship`;
- `groups`;
- `discipleship`;
- `events`;
- `kids`;
- `communications`;
- `pastoral`;
- `giving`;
- `facilities`;
- `analytics`.

Una ruta no debe considerarse autorizada solo porque el usuario tenga un rol. Debe comprobar también el entitlement del tenant cuando aplique.

## 9. Roles y permisos

Evitar roles codificados como única fuente de autorización. Los roles son paquetes de capacidades.

Ámbitos posibles:

- plataforma;
- iglesia;
- sede;
- módulo;
- área de servicio;
- grupo;
- actividad;
- recurso;
- caso pastoral.

Roles de referencia:

- `church_owner`;
- `church_admin`;
- `campus_admin`;
- `ministry_leader`;
- `group_leader`;
- `kids_coordinator`;
- `finance_manager`;
- `pastoral_worker`;
- `member`.

Las capacidades reales deben ser acciones como `people.read`, `people.manage`, `schedule.publish`, `pastoral.case.read`, etc.

## 10. Archivos

Definir una capa común para archivos:

- bucket/objeto;
- tenant;
- propietario lógico;
- entidad asociada;
- clasificación de privacidad;
- checksum;
- tipo MIME;
- tamaño;
- retención;
- estado antivirus si se incorpora análisis;
- metadatos mínimos.

Los buckets públicos no se usarán para documentos privados. Las URLs firmadas deben tener duración limitada.

## 11. Auditoría

Toda operación administrativa relevante debe poder generar un registro de auditoría con:

- tenant;
- actor;
- acción;
- entidad;
- identificador;
- valores relevantes anterior/posterior o diff sanitizado;
- request/correlation id;
- origen;
- fecha;
- sesión de soporte si aplica.

No registrar secretos, tokens, contraseñas ni contenido pastoral sensible indiscriminadamente.

## 12. Archivado y borrado

Preferir archivo/soft delete cuando existe historial relacionado. Definir para cada entidad:

- si puede borrarse físicamente;
- qué dependencias bloquean borrado;
- qué se anonimiza;
- qué se conserva por obligación;
- quién puede restaurar;
- periodo de retención.

## 13. Convenciones transversales

Todas las entidades relevantes deben considerar:

- UUID u otro identificador no predecible;
- `church_id` cuando pertenezcan al tenant;
- timestamps UTC;
- zona horaria resuelta en el borde de presentación/regla;
- `created_by`/`updated_by` cuando aporte trazabilidad;
- estados explícitos;
- índices por tenant y claves de acceso;
- constraints que impidan referencias cruzadas entre tenants;
- idempotency keys en operaciones repetibles;
- versionado o control de concurrencia en cambios sensibles.
