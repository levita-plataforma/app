# Visión, alcance y estrategia de producto

Revisión: **15 de septiembre de 2026 — ampliación a plataforma integral para iglesias.** Nota del 22
de septiembre de 2026: este documento describe la estrategia y el orden previsto de construcción, no
el estado real de cada módulo — para eso, ver [13-plan-por-fases.md](13-plan-por-fases.md), que la
auditoría de esa fecha actualizó fase por fase (Personas, Servicio, Actividades, Asignaciones,
Eventos, Grupos, Discipulado, Kids, Comunicación, Recursos, Alabanza, Giving, Analítica,
Administración de plataforma y parte de Operación/Escala ya están implementadas e integradas; Pastoral
e Integraciones siguen sin construir).

LEVITA se define como una **plataforma SaaS multiiglesia, modular y multi-tenant para la gestión integral de una iglesia evangélica moderna**. El primer gran módulo funcional será la organización de servicios, voluntarios y programación, pero la arquitectura base debe permitir incorporar progresivamente personas, familias, grupos, discipulado, eventos, niños, comunicación, acompañamiento pastoral, recursos, donaciones, analítica e integraciones sin reconstruir el núcleo.

## 1. Qué es LEVITA

Cada iglesia es un tenant independiente con sus propias personas, sedes, áreas, equipos, grupos, actividades, configuración, permisos, módulos contratados y suscripción. Una misma cuenta puede pertenecer a varias iglesias, pero los datos, roles y decisiones de cada iglesia permanecen aislados.

LEVITA debe servir tanto a una iglesia local pequeña como a una organización con varias sedes, cientos o miles de personas y equipos de servicio complejos. La arquitectura no debe asumir una única sede, una única estructura ministerial ni una única forma de organizar los cultos.

### Principios de producto

1. **Personas primero.** Una persona existe independientemente de que tenga cuenta de usuario.
2. **Tenant explícito.** Todo dato funcional pertenece a una iglesia y, cuando aplique, a una sede.
3. **Modularidad real.** Las iglesias activan solo los módulos que necesiten.
4. **Permisos por contexto.** El acceso no se resuelve únicamente por un rol global; puede depender de iglesia, sede, área, grupo, módulo o caso sensible.
5. **Configuración antes que forks.** Las diferencias entre iglesias se resuelven con configuración, no con ramas de código específicas por cliente.
6. **Privacidad por diseño.** RLS, minimización, auditoría, segregación y cumplimiento son parte de la arquitectura.
7. **Operación recuperable.** Altas, pagos, invitaciones, importaciones, webhooks y procesos críticos deben ser idempotentes y reanudables.
8. **Mobile first, escritorio cuando aporta valor.** La experiencia de servidor y miembro debe funcionar especialmente bien desde móvil; la coordinación puede aprovechar escritorio.
9. **Una sola identidad de producto.** La UI/UX común procede de la app de Alabanza existente y se reutiliza en todos los módulos.
10. **MVP acotado, arquitectura amplia.** No se implementa todo al mismo tiempo, pero no se diseña un núcleo que impida evolucionar.

## 2. Usuarios y perfiles de uso

LEVITA contempla al menos estos perfiles:

- propietario o administrador principal de la iglesia;
- pastorado y liderazgo ejecutivo;
- administrador operativo;
- líder de área o ministerio;
- coordinador de servicios;
- líder de grupo o discipulado;
- voluntario o servidor;
- miembro de la iglesia;
- visitante registrado;
- padre, madre o tutor;
- responsable de niños;
- responsable financiero;
- equipo pastoral con acceso restringido;
- operador de soporte de LEVITA;
- usuario que pertenece a varias iglesias.

Una misma persona puede ocupar varios roles. El modelo no debe convertir esos roles en columnas fijas dentro de `people`.

## 3. Dominios funcionales

LEVITA se estructura alrededor de un núcleo común y módulos activables.

### Núcleo obligatorio

- Iglesias y tenants.
- Sedes/campus.
- Personas y cuentas.
- Familias/hogares.
- Roles, permisos y pertenencias.
- Módulos y entitlements.
- Actividades/eventos genéricos.
- Etiquetas y campos personalizados.
- Archivos y documentos.
- Notificaciones y preferencias.
- Auditoría.
- Importación y exportación.
- Suscripción y facturación.
- Configuración, branding y preferencias del tenant.

### Módulos funcionales

- **Serving / Servicios:** áreas, puestos, equipos, programación, disponibilidad, confirmaciones y sustituciones.
- **Worship / Alabanza:** repertorio, canciones, atril, ensayos y programación musical.
- **People / Personas:** directorio, perfiles, familias, segmentación e historial permitido.
- **Groups / Grupos:** células, grupos pequeños, líderes, reuniones y asistencia.
- **Discipleship / Formación:** cursos, itinerarios, etapas y progreso.
- **Events / Eventos:** calendario, inscripciones, aforo, formularios y listas.
- **Kids / Niños:** responsables, check-in/out, autorizaciones y seguridad.
- **Communications / Comunicación:** comunicados, segmentos, email, push y futuras integraciones.
- **Pastoral / Acompañamiento:** seguimientos, tareas y peticiones con acceso especialmente restringido.
- **Giving / Donaciones:** fondos, aportaciones y conciliación (implementado; sin proveedor de pago real todavía).
- **Facilities / Recursos:** salas, vehículos, equipos y reservas.
- **Analytics / Informes:** métricas operativas y agregadas por tenant.

La descripción completa está en [Módulos funcionales](18-modulos-funcionales.md).

## 4. Qué se implementa primero

LEVITA no intenta lanzar todos los módulos simultáneamente. El orden vigente es:

1. fundación de producto y arquitectura SaaS;
2. alta de iglesia, tenant, suscripción y configuración;
3. personas, familias e importación base;
4. áreas, equipos y voluntariado;
5. actividades, cultos y programación;
6. disponibilidad, respuestas y notificaciones;
7. calendario, formularios e inscripciones;
8. grupos y discipulado;
9. Kids, comunicación y demás módulos según validación;
10. integración final de Alabanza.

El detalle y criterios de salida están en [Plan por fases](13-plan-por-fases.md).

## 5. Experiencia inicial de valor

La primera experiencia comercial debe permitir que una iglesia:

1. se registre o complete un alta asistida;
2. active su tenant y suscripción;
3. configure nombre, zona horaria, sedes y módulos;
4. importe o cree personas;
5. adapte sus áreas de servicio;
6. prepare un culto o actividad;
7. asigne personas y detecte conflictos;
8. publique y notifique;
9. reciba confirmaciones o rechazos;
10. detecte huecos y gestione sustituciones.

Esto constituye un producto útil por sí mismo, sin impedir que posteriormente la misma base gestione toda la vida operativa de la iglesia.

## 6. Alcance por etapas

| Etapa | Alcance |
|---|---|
| Fundación SaaS | Tenant, sede, personas, auth, módulos, permisos, auditoría, privacidad, suscripción y operación |
| MVP operacional | Serving, actividades, programación, disponibilidad, respuestas, notificaciones y calendario básico |
| Plataforma eclesial | Eventos, formularios, grupos, discipulado, comunicación, Kids y recursos |
| Integración de Alabanza | Canciones, repertorio, atril, ensayos y continuidad de Calserv |
| Expansión | Pastoral, Giving, analítica avanzada, API pública e integraciones especializadas |

## 7. Qué no debe confundirse

- **Persona** no es lo mismo que usuario autenticado.
- **Miembro de una iglesia** no es lo mismo que servidor de un área.
- **Área de servicio** no es lo mismo que grupo/célula.
- **Actividad** no siempre es un culto.
- **Turno** no siempre necesita un evento religioso; puede ser una franja o tarea operativa.
- **Permiso** no es lo mismo que módulo contratado.
- **Tenant** no es lo mismo que sede.
- **Notificación operativa** no equivale a comunicación masiva.
- **Datos pastorales sensibles** no deben heredar automáticamente los permisos del directorio general.

## 8. Multi-sede

Aunque el primer piloto pueda ser de iglesias con una sola localización, `campus` o `site` forma parte del modelo desde la fundación. Una sede puede tener:

- dirección y zona horaria si fuera necesario;
- servicios y actividades propios;
- áreas y líderes locales;
- salas y recursos;
- grupos vinculados;
- configuración operacional.

Los datos siguen perteneciendo al tenant de la iglesia. La sede es una partición funcional, no un nuevo tenant.

## 9. Éxito del producto

LEVITA será válido cuando una iglesia pueda operar sin depender de hojas de cálculo y grupos dispersos de mensajería, manteniendo al mismo tiempo claridad, control y privacidad.

Indicadores de producto a validar —no asumir como resultados—:

- tiempo de alta y primera configuración;
- porcentaje de invitaciones aceptadas;
- tiempo para preparar un servicio;
- cobertura de puestos antes del evento;
- tasa de respuesta;
- adopción móvil;
- número de tareas manuales eliminadas;
- incidencias de permisos o aislamiento;
- abandono en alta/pago;
- uso por módulo.

## 10. Marca y experiencia visual

La landing sigue siendo una referencia comercial. La experiencia de producto debe continuar la UI/UX de Calserv / LFY Worship para mantener consistencia entre acceso, perfil, tema, avisos, navegación, móvil, feedback y componentes comunes.

La incorporación funcional de Alabanza se realiza al final del roadmap inicial, pero sus patrones visuales y de interacción se reutilizan desde la primera fase.

## 11. Regla de evolución

Toda nueva función debe responder estas preguntas antes de desarrollarse:

1. ¿A qué tenant pertenece?
2. ¿Puede estar acotada a una sede?
3. ¿Qué persona o cuenta la origina?
4. ¿Qué roles pueden verla, crearla, modificarla y borrarla?
5. ¿Contiene datos sensibles?
6. ¿Debe quedar auditada?
7. ¿Qué ocurre si el módulo está desactivado?
8. ¿Cómo se importa/exporta?
9. ¿Qué ocurre al archivar una persona o una iglesia?
10. ¿Puede procesarse de forma idempotente?
11. ¿Qué sucede en una cuenta que pertenece a varias iglesias?
12. ¿Qué métricas operativas genera?

Si una función no tiene respuesta clara, todavía no está lista para implementación.
