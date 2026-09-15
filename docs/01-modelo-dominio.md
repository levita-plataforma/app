# Modelo de dominio integral

Revisión: **15 de septiembre de 2026**.

LEVITA utiliza un modelo de dominio compartido por todos los módulos. Serving es el primer dominio profundo, pero no gobierna el resto de la plataforma.

## 1. Jerarquía principal

```text
Plataforma LEVITA
└── Iglesia / tenant
    ├── Sedes
    ├── Personas y familias
    ├── Roles y permisos
    ├── Módulos y entitlements
    ├── Áreas de servicio y equipos
    ├── Grupos y recorridos
    ├── Actividades / eventos
    ├── Formularios e inscripciones
    ├── Comunicaciones
    ├── Recursos
    └── Datos especializados por módulo
```

## 2. Vocabulario transversal

| Concepto UI | Entidad conceptual | Definición |
|---|---|---|
| Iglesia | `churches` | Tenant contractual y de seguridad |
| Sede | `campuses` | Localización/estructura dentro de una iglesia |
| Persona | `people` | Ser humano conocido por la iglesia, tenga o no cuenta |
| Cuenta | `auth.users` | Identidad digital global de acceso |
| Familia/Hogar | `households` | Agrupación de personas relacionadas |
| Módulo | `modules` | Capacidad funcional del producto |
| Módulo de iglesia | `church_modules` | Módulo habilitado para un tenant |
| Actividad | `activities` | Hecho con fecha/hora o tarea operativa común |
| Evento | especialización | Actividad de calendario con participantes/inscripciones |
| Grupo | `groups` | Comunidad recurrente con líderes y participantes |
| Área de servicio | `ministries` | Sonido, Multimedia, Bienvenida, Niños, etc. |
| Puesto | `positions` | Rol operativo dentro de un área |
| Equipo | `teams` | Conjunto habitual de personas para servir juntas |
| Turno | `event_positions` o equivalente | Necesidad de una posición en una actividad |
| Asignación | `assignments` | Persona propuesta para cubrir una plaza |
| Bloqueo | `blockouts` | Periodo en el que una persona no puede servir |
| Formulario | `forms` | Estructura configurable para recopilar información |
| Inscripción | `registrations` | Participación solicitada/confirmada en evento/curso |
| Recurso | `resources` | Sala, vehículo, equipo u otro activo reservable |

## 3. La persona no es el usuario

`people.user_id` o su relación equivalente es nullable. La iglesia debe poder registrar, programar, agrupar o acompañar a una persona sin exigir que cree una cuenta.

La cuenta sirve para autenticarse; la persona pertenece al dominio eclesial. Al aceptar una invitación se enlazan ambas identidades sin perder historial.

### Persona y pertenencia

No todas las personas registradas son miembros formales. La relación con la iglesia debe permitir estados como:

- visitante;
- conectado;
- miembro;
- servidor;
- líder;
- externo;
- inactivo/archivado.

Estos estados no sustituyen a roles de autorización.

## 4. Familias

Los hogares permiten relacionar adultos, menores, tutores y convivientes, pero las autorizaciones sensibles se modelan explícitamente. Compartir hogar no concede automáticamente permiso para recoger a un menor ni acceso a información restringida.

## 5. Actividad como raíz temporal

No toda actividad es un culto. El modelo debe cubrir:

- culto;
- ensayo;
- reunión de grupo;
- curso;
- conferencia;
- retiro;
- reunión de liderazgo;
- turno de limpieza;
- tarea de mantenimiento;
- reserva de sala;
- actividad infantil.

Una actividad puede ser puntual o recurrente, pública o interna, tenant-wide o de sede, y puede enlazar recursos, equipos, formularios y comunicaciones.

## 6. Serving: vocabulario específico

| Interfaz | Entidad | Qué es |
|---|---|---|
| Área de servicio | `ministries` | Unidad organizativa de voluntariado |
| Puesto | `positions` | Capacidad/rol dentro del área |
| Tipo de servicio | `service_types` | Plantilla recurrente de culto/servicio |
| Turno | `event_positions` | Necesidad concreta de un puesto |
| Asignación | `assignments` | Persona propuesta/asignada a una plaza |
| Bloqueo | `blockouts` | Indisponibilidad |

## 7. Turno y asignación son distintos

El hueco existe aunque no tenga persona. Un turno con tres plazas sigue existiendo con cero, una o tres asignaciones. Esto permite medir cobertura y gestionar rechazos sin perder la necesidad original.

## 8. Estados de actividad

Estados base recomendados:

- `draft`;
- `published`;
- `cancelled`;
- `completed`;
- `archived` cuando aplique.

Los módulos pueden extender estados, pero deben mapearse a una semántica transversal.

## 9. Estados de asignación

- `proposed` mientras no se notifica;
- `pending` tras notificación;
- `accepted`;
- `declined`;
- `withdrawn` por gestión;
- `replaced` cuando quede historial de sustitución.

No borrar rechazos para “limpiar” la programación. Son historial operativo.

## 10. Cobertura

Para un turno:

```text
vacías = max(0, necesarias - aceptadas - pendientes)
faltan_confirmaciones = max(0, necesarias - aceptadas)
```

Las rechazadas y retiradas no cubren. La sobreasignación debe mostrarse, no esconderse.

## 11. Reglas de composición

Las áreas pueden definir reglas como:

- mínimo de personas;
- necesidad de una persona autónoma;
- credencial vigente;
- mezcla de perfiles;
- incompatibilidades;
- ratio adulto/niño;
- mínimo por idioma;
- límite de frecuencia.

Las reglas se evalúan para la fecha de la actividad y deben explicar por qué bloquean una publicación.

## 12. Equipos

`teams` es entidad de primera clase, no una lista guardada en una nota. Puede representar:

- banda de Alabanza;
- equipo A/B de Limpieza;
- equipo de bienvenida;
- pareja de traducción;
- equipo técnico.

Un equipo puede tener miembros, roles internos, vigencia, sede y áreas asociadas. Asignar un equipo genera o propone asignaciones individuales para conservar trazabilidad.

## 13. Grupos no son áreas

Un grupo/célula tiene líderes, participantes, reuniones y asistencia. No comparte automáticamente el modelo de puestos de Serving.

## 14. Formularios

Los formularios deben ser reutilizables y tipados. Ejemplos:

- inscripción a evento;
- alta de visitante;
- solicitud de bautismo;
- interés en grupo;
- voluntariado;
- petición de oración.

Una respuesta pertenece al tenant y hereda la clasificación de privacidad del formulario.

## 15. Directorio

El directorio es una vista de People condicionada por privacidad. Cada persona puede tener campos visibles, ocultos o restringidos según política del tenant y consentimiento aplicable.

## 16. Datos pastorales

Los casos pastorales no son “notas de persona”. Deben existir en un módulo separado con ACL/capacidades específicas, auditoría y retención propia.

## 17. Datos financieros

Giving mantiene aportaciones y fondos fuera de la tabla de People. El acceso financiero se concede explícitamente y no se deriva de ser administrador general.

## 18. Recursos

Salas, equipos y vehículos pueden reservarse. Las reservas se relacionan con actividades o existen independientemente. Los conflictos deben detectarse igual que los conflictos humanos.

## 19. Etiquetas y campos personalizados

Las etiquetas son tenant-scoped y sirven para segmentación. Los campos personalizados amplían entidades sin modificar el esquema para cada iglesia.

No usar custom fields para datos cuya seguridad necesita semántica fuerte, por ejemplo historial financiero o notas pastorales.

## 20. Archivado

Las entidades con historial se archivan. El borrado físico queda reservado a flujos definidos de limpieza, privacidad o administración.

## 21. Invariantes

1. Ningún dato tenant-aware referencia otro tenant.
2. Una cuenta no obtiene acceso por conocer un ID.
3. Una persona puede existir sin cuenta.
4. Un módulo desactivado no elimina datos automáticamente.
5. Una sede no es un tenant.
6. Un rol no sustituye al entitlement.
7. Una notificación no es la fuente de verdad del estado; el estado vive en dominio.
8. Los módulos sensibles usan permisos más estrictos que los generales.
9. Toda fecha se almacena de forma segura y se interpreta en zona horaria de contexto.
10. Los cambios administrativos relevantes son auditables.

## 22. Áreas de servicio

Las necesidades específicas de Alabanza, Sonido, Multimedia, Dirección/Predicación, Bienvenida, Niños, Jóvenes, Intercesión, Diaconía, Hospitalidad, Limpieza/Mantenimiento y Traducción/Accesibilidad continúan en `docs/areas/`.
