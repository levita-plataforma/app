# Decisiones y cuestiones abiertas

Revisión: **17 de septiembre de 2026**.

Este documento distingue decisiones confirmadas de asuntos que deben cerrarse antes de la fase correspondiente. Las decisiones más recientes prevalecen sobre propuestas históricas del backlog.

## Decisiones confirmadas

### D1 · LEVITA es SaaS multiiglesia
Cada iglesia es un tenant aislado.

### D2 · Arquitectura modular
LEVITA se diseña como plataforma integral con módulos activables. Serving es el primer gran módulo, no el límite del producto.

### D3 · People es transversal
Una persona puede existir sin cuenta y participa en múltiples módulos.

### D4 · Sede no es tenant
Multi-campus forma parte del core. Una sede vive dentro de una iglesia.

### D5 · Activity es concepto común
Cultos, reuniones, cursos, eventos, ensayos, tareas y turnos pueden compartir una raíz temporal/operativa sin obligarse a usar exactamente la misma tabla física.

### D6 · Permisos y entitlements son distintos
El plan determina capacidades disponibles para el tenant; los roles determinan quién puede usarlas.

### D7 · RLS obligatorio para datos tenant-aware
Acompañado de grants mínimos, constraints tenant-safe y tests de aislamiento.

### D8 · UI/UX común heredada de Calserv
No crear una segunda identidad visual para los módulos generales.

### D9 · Alabanza se integra funcionalmente al final
Sus patrones comunes se reutilizan desde el principio; sus datos y funciones específicas se incorporan tras estabilizar el core.

### D10 · Kids, Pastoral y Giving son dominios sensibles
No usan permisos genéricos de administrador como acceso automático a todos sus datos.

### D11 · Soporte no tiene acceso silencioso universal
La impersonación, cuando se implemente, es temporal y auditada.

### D12 · Datos históricos se archivan
Evitar borrado destructivo ordinario cuando existen relaciones históricas.

### D13 · Importación/exportación forman parte del producto
No son scripts internos improvisados.

### D14 · Facturación pertenece al tenant
El alta comercial forma parte del lanzamiento; precio y periodicidad aún no están definidos.

### D15 · Las áreas iniciales son copias editables por tenant
No existe un catálogo global mutable que renombre áreas ya creadas en clientes.

### D16 · Notificación persistente antes de canal externo
Push/email son transportes, no fuente de verdad.

### D17 · Núcleo SaaS implementado en el mismo repositorio de la landing — confirmado el 16 de septiembre de 2026
La Fase 0 se construye dentro de `levita-app` (route group `(app)`), no en una reconstrucción de la separación histórica `apps/dashboard` + `apps/pwa` + `packages/`. Ver [ADR 0015](adr/0015-repositorio-unico-monorepo.md).

### D18 · Referencia visual: `imagenes/layout*.png` sustituye a Calserv — confirmado el 16 de septiembre de 2026
Toda la shell de aplicación (paleta, tipografía, estructura, iconografía por módulo) sigue las imágenes de referencia aportadas, no los tokens documentados de Calserv / LFY Worship. Se conservan de Calserv únicamente los patrones de comportamiento común no visuales (acceso con contraseña, bandeja de avisos, perfil con pestañas). Ver [ADR 0016](adr/0016-referencia-visual-layout.md) y actualización de [10-brief-diseno.md](10-brief-diseno.md) y [14-referencia-uiux-alabanza.md](14-referencia-uiux-alabanza.md).

### D19 · Fase 4 = actividades, plantillas, estructura de servicio y planificación; asignaciones pasan a Fase 5 — aceptado el 17 de septiembre de 2026 (validación de Carlos del commit `93eb369`)
`activities` sigue siendo la raíz sin tabla de extensión; se añaden el estado `planned`, visibilidad por audiencias, horario `timed`/`flexible`, series recurrentes acotadas, plantillas que copian estructura, áreas/puestos/requisitos por actividad con snapshots y overrides, y orden del servicio. La escritura pasa solo por RPC y se sustituyen las políticas RLS de `activities`. Asignaciones, conflicto de persona, huecos con personas y composición se construyen en Fase 5. Ver [ADR 0017](adr/0017-actividades-planificacion-fase-4.md), [FASE-4-ACTIVIDADES.md](FASE-4-ACTIVIDADES.md) y [13-plan-por-fases.md](13-plan-por-fases.md).

### D20 · Fase 5, parte de Carlos: asignaciones, respuestas y sustituciones — acordada por Carlos el 17 de septiembre de 2026; integrada y aplicada en producción ese mismo día (commit validado `f9cb5b4`, merge `a9fd3c8`)
- **Estados:** `proposed` (borrador no comunicado, invisible para la persona) → enviar → `pending` → `accepted`/`declined`; `cancelled` (retirada, con causa) y `substituted`.
- **Cobertura:** confirmados = `accepted` (estado de cobertura y `assigned_count`); pendientes = `pending`; previstos = `proposed` + `pending` + `accepted`; `public.activity_position_coverage` añade `pending_count`, `proposed_count` y `expected_count`, visibles solo para quien gestiona el puesto (la audiencia ve confirmados y estado de cobertura).
- **Conflictos:** bloquean pertenencia, requisitos obligatorios en la fecha de la actividad, persona autónoma, estado de la actividad y máximo del puesto; avisan, con confirmación registrada, solapes, no disponibilidad, frecuencia (pendiente de contrato con Diogo), requisitos recomendados y sede distinta. Rangos semiabiertos.
- **Respuestas:** hasta el inicio (flexibles: fin de ventana o sin límite); tras aceptar, la baja es mediante sustitución; desde el inicio, solo el coordinador.
- **Cambios de F4:** cambio de hora → reconfirmación; cancelar, archivar (salvo completadas) o eliminar ocurrencia → `cancelled`; despublicar conserva; duplicar o aplicar estructura no copia personas; eliminar un puesto con personas se bloquea.
- **Sustitución:** solicitud (persona o gestor) → candidato elegido por el gestor, revalidado y único → la original pasa a `substituted` cuando el candidato acepta.
- **Personas sin cuenta:** respuesta por representante auditada (`response_source = representative`).
- **Permisos:** `assignment.manage` (scopes `church`/`campus`/`activity`/`service_area`; roles `church_owner`, `church_admin`, `campus_admin` y `ministry_leader` en su área); responder las propias no requiere capability; la persona asignada (`pending`/`accepted`) lee la actividad, su estructura y el orden del servicio, sin notas administrativas ni el resto del equipo.
- **Flexibles:** ventana si existe, sin hora inventada. **Publicación multiárea:** se mantiene A8; gestionar asignaciones no da `activity.publish`. **Enlaces de respuesta:** solo autenticados en la primera versión.

Lo que quedaba pendiente con Diogo (emisión y deduplicación de eventos, disponibilidad, frecuencia, silencio y recordatorios, destinatarios, escalado, transporte y prefijo de migraciones) lo decidió Carlos como propietario, lo aprobó Diogo el 18 de septiembre de 2026 y quedó integrado y aplicado en producción ese mismo día (PR #5). Ver [CONTRATO-F4-F5.md §9](CONTRATO-F4-F5.md) y [FASE-5-ASIGNACIONES.md](FASE-5-ASIGNACIONES.md).

### D21 · Fase 5, disponibilidad y avisos (DI-01 y DI-02): los asume Carlos — decidido el 17 de septiembre de 2026
Diogo no había subido trabajo y las nueve decisiones compartidas seguían abiertas, así que Carlos, como propietario, las decidió y encargó la implementación en la rama `feature/fase-5-avisos-disponibilidad` (migraciones `20260923000100`–`20260923000500`), encima de la de asignaciones.

- **Disponibilidad:** periodos concretos **y** pauta semanal; el motivo es opcional y solo lo ve la propia persona. La función que ya consumía F5-Carlos devuelve el aviso, nunca el motivo.
- **Frecuencia:** máximo de actividades al mes, global y afinable por área; dos puestos de la misma actividad cuentan como una; solo avisa (`frequency_exceeded`), nunca bloquea.
- **Avisos:** outbox escrita por triggers en la misma transacción, bandeja persistente por persona, preferencias por canal y cola de entrega. Deduplicación por `<evento>:<entidad>:<versión>`.
- **Destinatarios:** quien creó la asignación y los líderes del área; sin líder, la administración. Escalado a la administración si un puesto crítico sigue bajo mínimos a menos de 3 días.
- **Recordatorios:** 7 y 2 días antes sin respuesta, y la víspera si ya se aceptó. Silencio 22:00–08:00 en la zona de la actividad, salvo la cancelación de una actividad del mismo día.
- **Transporte:** sin proveedor. El envío externo queda **desactivado** y las entregas de email y push se quedan en cola; la bandeja de la aplicación sí funciona.
- **Pendiente:** reconciliar con Diogo si tiene trabajo local. Nada aplicado en remoto. Ver [FASE-5-AVISOS-DISPONIBILIDAD.md](FASE-5-AVISOS-DISPONIBILIDAD.md).

### D22 · Fase 7, Grupos y discipulado — decidido por Carlos el 18 de septiembre de 2026; implementación pendiente de validar
Ocho decisiones de producto, recogidas como P-1 a P-8 en [CONTRATO-FASE-7.md](CONTRATO-FASE-7.md):

- **Visibilidad:** directorio interno para quien tiene sesión y pertenencia, y grupos privados solo para responsables y participantes. **Nada público sin sesión**: la Fase 7 no abre ninguna superficie para `anon`.
- **Liderazgo y aforo:** el responsable no ocupa plaza; el aforo cuenta participantes. Se puede retirar al último responsable: el grupo queda **marcado como «sin responsable»** y no se bloquea nada.
- **Formación:** dos vías de entrada, solicitud de plaza que resuelve el responsable y alta directa por el responsable.
- **Finalizar un curso** es un acto explícito del responsable, con autor y fecha. La aplicación **sugiere** al alcanzar el umbral de asistencia de la cohorte; nunca lo decide sola.
- **Datos personales:** el nombre se ve siempre; el teléfono y el correo, solo si la persona los ha hecho visibles o si quien mira tiene permiso expreso. El lugar de un grupo privado solo lo ven responsables y participantes.
- **Avisos internos:** solo lo imprescindible (solicitud recibida, solicitud resuelta, incorporación, cambio o cancelación de reunión o sesión, curso o paso terminado). Transporte externo **desactivado**, como en D20 y D21.
- **Solicitudes:** una sola pendiente por persona y grupo; el ingreso siempre requiere aprobación manual.
- **Itinerarios:** los pasos se archivan, nunca se borran, y el progreso conseguido se conserva y se sigue leyendo.

El scope `group` de `church_people_roles`, previsto desde la Fase 0 y sin usar hasta ahora, se activa aquí; el rol `group_leader`, que no tenía ninguna capacidad, recibe las suyas y **no** recibe la de ver contacto. Las reuniones de grupo y las sesiones de cohorte se apoyan en `activities` pero no recorren su máquina de estados, para no dar a quien lleva un grupo permisos sobre el calendario de toda la iglesia: ver [ADR 0019](adr/0019-grupos-y-formacion-sobre-activities.md) y [FASE-7-GRUPOS-DISCIPULADO.md](FASE-7-GRUPOS-DISCIPULADO.md).

**Resuelto el 20 de septiembre de 2026 (R-01).** La política `people_select` dejaba ver correo y teléfono de cualquier persona a cualquier miembro de la misma iglesia, porque RLS filtra filas y no columnas. Se resuelve con privilegios por columna —`authenticated` pierde el `select` sobre `email`, `phone`, sus versiones normalizadas, `birth_date` y `notes`— y dos RPC que aplican `app.can_read_person_contact`, la regla que ya se había decidido en la Fase 7: uno mismo, quien tenga `people.read`, o quien lidere un grupo del que esa persona es miembro. Las notas van solo con `people.read`, nunca por liderar un grupo. Migración `20261002000100`, suite `r01_datos_de_contacto_test.sql`.

## Cuestiones abiertas antes de Fase 1

### A1 · Pricing
- importe;
- periodicidad;
- trial;
- impuestos;
- cupones/descuentos;
- política de reembolso.

### A2 · Impago
- duración del grace period;
- solo lectura o suspensión;
- módulos afectados;
- exportación durante suspensión.

### A3 · Propietarios
Definir si una iglesia puede tener varios owners y procedimiento de transferencia.

## Cuestiones abiertas antes de Fase 2

### A4 · Estado de membresía
Definir vocabulario final para visitante/conectado/miembro/inactivo sin imponer una eclesiología concreta a todos los tenants.

### A5 · Directorio
Qué campos son visibles por defecto y qué controles de privacidad ofrece la iglesia/persona.

### A6 · Merge de personas
Nivel de reversibilidad y criterio de detección de duplicados.

## Cuestiones abiertas antes de Fase 4

### A7 · Implementación física de Activity
Una tabla base con extensiones vs entidades especializadas conectadas. Debe resolverse con el esquema real y consultas esperadas.
Resuelto (D19, aceptado): tabla base `activities` sin extensión 1:1; datos no transversales en tablas 1:N propias.

### A8 · Publicación multiárea
Definir quién puede publicar una actividad con varias áreas y si el líder puede publicar solo su parte.
Resuelto (D19, aceptado): solo quien tiene `activity.publish` en el ámbito de la actividad publica la actividad completa; el líder de área gestiona los puestos de su área pero no publica una parte.

### A9 · Ventana de respuesta
Hasta qué momento se puede aceptar/rechazar/cambiar respuesta.
Resuelto (D20, acordado por Carlos): hasta el inicio de la actividad (flexibles: fin de ventana o sin límite); tras aceptar, baja mediante sustitución; desde el inicio, solo el coordinador.

### A10 · Conflictos
Cuáles bloquean y cuáles solo advierten. Por defecto, conflictos humanos informan; credenciales/reglas de seguridad pueden bloquear.
Resuelto salvo frecuencia (D20, acordado por Carlos). El tratamiento de la frecuencia queda pendiente del contrato con Diogo.

## Cuestiones abiertas antes de Fase 6

### A11 · Formularios sensibles
Qué tipos de campos requieren permisos especiales o se prohíben en formularios genéricos.

### A12 · Eventos de pago
No implementar hasta decidir proveedor, fiscalidad y política de cancelación.

## Cuestiones abiertas antes de Fase 8

### A13 · Kids
- mecanismo de identificación de recogida;
- impresión/etiquetas;
- datos médicos mínimos;
- política de fotografía;
- retención de incidencias.

## Cuestiones abiertas antes de Fase 9

### A14 · Comunicaciones comerciales/masivas
Finalidades, consentimiento, opt-out y proveedores.
Resuelto (Fase 9, acordado con Diogo): finalidad limitada a `institutional`/`operational`/`system`/`services`/`groups`/`events`/`discipleship`/`kids`/`pastoral` — no se implementa `marketing` funcional en esta fase. Opt-out en dos capas: por canal vía `notification_preferences` ya existente de Fase 5 (sin tocar), y por categoría opcional vía `communication_category_preferences`, tabla nueva y acotada solo a las 6 categorías opcionales (iteración posterior, ver `docs/adr/0021-comunicaciones-categorias-or-unsubscribe.md`). Baja sin sesión mediante token opaco (`unsubscribe_token`, mismo patrón que `cancel_token` de Fase 6). Sin proveedor real de email/push: el envío externo queda `queued`, igual que el motor de avisos, gobernado por `NOTIFICATIONS_TRANSPORT=disabled`; por el mismo motivo no se implementa webhook de proveedor, bounce real ni reintentos reales (columna `failure_kind` preparada, sin lógica activa). Ver `docs/adr/0020-comunicaciones-vs-avisos.md` y `docs/adr/0021-comunicaciones-categorias-or-unsubscribe.md`.

### A15 · Migración Calserv
**Resuelto (20 de septiembre de 2026): no hay migración desde Calserv.** Calserv no forma parte del
repositorio LEVITA, no existe un repositorio disponible ni debe esperarse uno, y no se diseña ninguna
migración desde él. La parte de contenido de la Fase 11 (canciones, tonalidades, repertorios, atril,
archivos) se implementa como módulo **nativo** de LEVITA, diseñado desde sus propias necesidades — ver
`docs/CONTRATO-FASE-11-DIOGO.md` y `docs/FASE-11-ALABANZA-DIOGO.md`. Cualquier referencia a Calserv en
documentación anterior (`docs/14-referencia-uiux-alabanza.md`) se trata como referencia histórica de
comportamiento/UX a conservar, nunca como fuente de datos, schema o repositorio a migrar.

## Cuestiones abiertas antes de Fase 12

### A16 · Pastoral
Modelo de retención, visibilidad y requisitos legales/organizativos.

### A17 · Giving
**Parcialmente resuelto (20 de septiembre de 2026).** Conciliación y exportación contable: resueltas —
modelo simple (`giving_reconciliations`, estados `unreconciled`/`reconciled`/`exception`) y exportación
CSV con capability propia (`giving.export`) y mitigación de inyección de fórmula. **Proveedor de pago,
recibos y tratamiento fiscal: siguen sin resolver**, deliberadamente — no hay proveedor real
seleccionado, así que no se implementa cobro online, webhooks ni recibos/certificados fiscales
automáticos (Stripe/Adyen/Redsys u otro es una decisión de producto futura, no tomada
unilateralmente). Se preparó únicamente el contrato de abstracción (`GivingPaymentProvider`: crear/
consultar/reembolsar pago, verificar webhook, normalizar evento) y las columnas de referencia externa
(`provider`, `provider_payment_ref`, `provider_customer_ref`) en `giving_contributions`/
`giving_recurring_plans`, sin ningún secreto ni integración real. Ver
[FASE-12-GIVING.md](FASE-12-GIVING.md).

## Regla

Una cuestión abierta no debe resolverse “por comodidad del código” si afecta a producto, legal, billing o permisos. Documentar la decisión y actualizar su documento responsable.
