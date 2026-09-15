# Decisiones tomadas

Registro corto de las decisiones estructurales, con su alternativa y su coste.
Si vas a cambiar una, lee primero por qué está así.

---

### 1 · Base de datos compartida con RLS, no schema por iglesia

**Alternativa:** un schema de Postgres por tenant.
**Por qué no:** más aislamiento, sí, pero migrar 800 schemas es una pesadilla
operativa y el coste por tenant se dispara. Para cientos de iglesias pequeñas,
`church_id` + RLS es lo correcto.
**Coste que asumimos:** disciplina absoluta en las políticas. De ahí la suite de
aislamiento y los controles negativos.

---

### 2 · `people` separada de `auth.users`, con `user_id` nullable

**Alternativa:** las asignaciones apuntan directamente al usuario autenticado.
**Por qué no:** bloquearía el alta de una iglesia hasta que los 40 servidores se
registraran uno a uno. Planning Center funciona así por la misma razón.
**Coste:** una tabla más y un paso de enlace al aceptar la invitación.

---

### 3 · `church_id` duplicado en todas las tablas hijas

**Alternativa:** derivarlo por join desde la tabla padre.
**Por qué no:** obligaría a cada política RLS a hacer un join, que es la causa
principal de RLS lento — la guía de Supabase documenta casos de 178 s que bajan
a 12 ms al evitarlo.
**Coste:** una columna redundante por tabla, con su riesgo de desincronización,
que se neutraliza con las claves foráneas compuestas.

---

### 4 · Funciones de contexto `security definer`

**Alternativa:** consultar `people` directamente dentro de la política.
**Por qué no:** recursión infinita. Una política sobre `people` que consulta
`people` se llama a sí misma. Es el error de RLS más común en Supabase.
**Coste:** funciones que se saltan RLS, y por tanto hay que auditarlas con
cuidado: `search_path` fijado y `execute` revocado a `public` y `anon`.

---

### 5 · Los avisos se encolan, no se envían

**Alternativa:** enviar el push en el momento de crear la asignación.
**Por qué no:** los recordatorios son diferidos por naturaleza, un fallo de red
perdería el aviso, y no habría forma de cancelar un recordatorio cuyo turno
cambió.
**Coste:** una tabla de cola y un worker. A cambio: reintentos, deduplicación,
cancelación y trazabilidad.

---

### 6 · `pg_cron` en lugar del cron del hosting

**Alternativa:** Vercel Cron.
**Por qué no:** granularidad y cupos limitados por plan, y *cold start*. Un
recordatorio del sábado a las 20:00 no puede depender de eso.
**Coste:** una sentencia `cron.schedule` que hay que ejecutar a mano tras el
despliegue, y que es fácil olvidar. Está documentada en tres sitios por eso.

---

### 7 · PWA en lugar de app nativa

**Alternativa:** React Native o dos apps nativas.
**Por qué no:** dos tiendas, dos procesos de revisión, y una fricción de
instalación mucho mayor para un usuario que solo va a pulsar «puedo servir».
**Coste:** el grande, y hay que asumirlo con los ojos abiertos — **en iOS no hay
push sin instalar en pantalla de inicio**. Si la tasa de instalación resulta ser
mala en el piloto, esta decisión se revisa.

---

### 8 · Dos aplicaciones Next.js, no una

**Alternativa:** una app con dos grupos de rutas.
**Por qué no:** una PWA solo puede tener un `manifest` y un service worker con
su ámbito. Mezclarlas complica las dos sin ganar nada.
**Coste:** dos proyectos en Vercel y dos despliegues.

---

### 9 · Enrutado por ruta, no por subdominio

**Alternativa:** `betel.tuiglesia.es`.
**Por qué no:** complica el ámbito del service worker y el almacenamiento de
sesión, y no aporta nada hasta que un cliente lo pida.
**Coste:** ninguno hoy. Se guarda como característica del plan superior.

---

### 10 · Español en el dominio, inglés en el esquema

**Alternativa:** todo en uno de los dos.
**Por qué así:** el dominio en español porque es el vocabulario de la iglesia y
el que aparece en la interfaz; el esquema en inglés porque es lo que esperan las
herramientas de Supabase y los tipos generados.
**Coste:** una traducción mental en la capa de datos. Se documenta en la tabla
de vocabulario de `01-modelo-dominio.md`.

---

## Revisión de producto · 15 de septiembre de 2026

Las decisiones 1–10 son arquitectura heredada, cuya implementación debe
vincularse al repositorio de origen según el [índice](README.md). La separación
en dos apps es una elección del proyecto; no es una imposibilidad técnica
universal de alojar varias experiencias PWA bajo otra organización.

### 11 · Cada iglesia es un tenant — confirmado por el promotor

LEVITA sirve a múltiples iglesias con datos, pertenencias, roles y suscripción
independientes. La misma cuenta puede pertenecer a más de una iglesia sin
compartir sus datos. Ver [Iglesias y tenants](12-iglesias-y-tenants.md).

### 12 · Alta asistida y registro con cuota — confirmado por el promotor

Operación puede dar de alta la iglesia o la iglesia puede registrarse pagando.
La suscripción y la activación entran en el lanzamiento. Sustituye el aplazamiento
de facturación a fase 4 que todavía aparece como contexto en el backlog histórico.
El importe y condiciones concretas no se han elegido.

### 13 · Base de áreas editable por iglesia — confirmado por el promotor

Cada tenant recibe una base propia. Puede crear más áreas, editarlas y cambiarles
el nombre. Un renombrado conserva identidad, vínculos e historial. No se aplican
cambios globales a las áreas ya personalizadas por las iglesias.

## Decisiones abiertas y supuestos para avanzar en diseño

| ID | Cuestión | Criterio para la maqueta | Antes de implementar |
|---|---|---|---|
| D1 | Alcance de módulos más allá del servicio | Multiiglesia, alta/pago y núcleo de turnos; bloque R para integrar Alabanza | Confirmar nuevas funciones antes de añadir membresía, donaciones u otros módulos |
| D2 | Quién publica un evento con varias áreas | Diseñar la publicación completa con propietario/admin; líder prepara su área | Resolver si hay publicación global delegada o por área; un único estado de evento no expresa «publicar solo mis turnos» |
| D3 | Oferta, impago y cancelación | Cuota sin importe inventado; recuperación del pago; alta asistida con enlace de pago | Definir importe, periodicidad, gracia, acceso al cancelar, condiciones y cualquier excepción comercial |
| D4 | Nuevas asignaciones en un evento publicado | Previsualizar destinatarios antes de enviar nuevas propuestas | Conciliar el momento de envío con los triggers; no asumir a la vez envío inmediato y envío al republicar |
| D5 | Respuestas y cambios del servicio | Respuesta reversible en turno vigente; cancelado/retirado sin acciones; error sin perder datos | Definir límites temporales, reconfirmación al cambiar hora y contrato de respuesta; verificar capacidades de notificación en dispositivos reales |
| D6 | Soporte de plataforma y conflictos entre iglesias | Operación ve altas y pagos; cada iglesia ve solo sus conflictos internos | Definir acceso de soporte y si habrá disponibilidad privada entre tenants, sin filtrar datos de otra iglesia |
| D7 | Versión de referencia y marca de plataforma/iglesia | Heredar UI/UX de Calserv; Negro + Escenario como arranque observado | Confirmar versión usada por el equipo, dominios y encaje de LEVITA sin imponer identidad LFY a todas las iglesias |
| D8 | Integración con Alabanza | Conservar UI/UX y funcionamiento común: acceso actual, perfil, push y campana; módulo de Alabanza al final | Resolver conexión de cuentas, roles, datos y bandeja/cola por tenant, conservando el comportamiento actual y evitando cuentas o envíos duplicados |

Ninguna fila abierta revoca los requisitos confirmados 11–16. Los supuestos
permiten evaluar pantallas y se anotan en el material de diseño, no en la
interfaz final de la iglesia.

### 14 · La UI y UX son las de la app de Alabanza — confirmado por el promotor

La app existente se integrará con LEVITA. Toda pantalla nueva amplía esa misma
experiencia. Sustituye la propuesta de tomar colores, tipografías y navegación
de la landing para el producto. La referencia localizada es Calserv / LFY
Worship: [inventario y evidencia](14-referencia-uiux-alabanza.md).

La integración visual y de interacción comienza en fase 0; el traspaso o
integración de datos se realiza cuando estén validados los contratos técnicos.
No se presupone una reescritura ni que la interfaz de Alabanza deba sustituirse.

### 15 · Alabanza es la última en incorporarse — confirmado por el promotor

Se construye y valida primero la plataforma general y sus demás áreas.
Alabanza continúa en la app actual y se incorpora al final dentro de LEVITA,
con usuarios, funciones y datos según el contrato de integración. Se hereda su
UI/UX desde fase 0; su integración funcional ocurre en fase 6. El plan anterior
que la trataba como un módulo a añadir antes de consolidar la general queda
sustituido por [este orden](13-plan-por-fases.md).

### 16 · Se hereda también el funcionamiento común — confirmado por el promotor

La continuidad incluye push, bandeja de avisos, perfil, acceso, preferencias y
los demás comportamientos comunes de la app existente. Se reutiliza y adapta
esa base para las áreas generales durante las primeras fases. Se conserva el
acceso actual; la propuesta antigua de cambiarlo por enlaces mágicos no es la
instrucción vigente.

La incorporación final sigue reservada al equipo de Alabanza, sus funciones
específicas y sus datos. No se posponen hasta entonces el perfil ni los avisos
de la general. El [inventario funcional](14-referencia-uiux-alabanza.md) y los
recorridos de paridad determinan qué se conserva y qué requiere adaptación.
