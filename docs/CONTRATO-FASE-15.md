# Contrato de la Fase 15 · Gestión comercial y operación de plataforma

Rama `feature/carlos-fase-15-gestion-comercial-operacion`, sobre `origin/main` = `3904383`.

F15 amplía el panel de F14. No crea otro catálogo de iglesias, otra autenticación ni otro
sistema de permisos. Se corresponde con las etapas **CA-4 (comercial)** y **CA-5 (soporte y
operación)** de la propuesta de consola del 22/09/2026.

---

## 1. Lo que ya existía, comprobado

| Pieza | Estado real | Qué hago con ella |
|---|---|---|
| `/operacion`, guarda y `platform-service` | Integrado (PR #24) | Amplío, no rehago |
| Capacidades `platform.*` (5) | Integradas, con regla de no autoconcesión | Extiendo el catálogo |
| `platform_audit_logs` + `app.write_platform_audit` | Integrados | Toda operación nueva audita por ahí |
| `subscriptions` | Tabla con `plan_key` suelto, sin catálogo | Le añado versión de plan, periodo y cambios programados |
| `plan_entitlements` | **Existe y está vacía** | La sustituye el catálogo versionado |
| `church_entitlement_overrides` | Existe, sin autor real ni inicio | Le añado `starts_at`, autor y auditoría |
| `support_sessions` | **Solo la tabla**: ninguna función, ninguna UI | Construyo su ciclo de vida encima |
| `webhook_events_inbound`, `import_jobs`, `export_jobs` | Con `correlation_id`, intentos e idempotencia | Los leo para la consola; no los rehago |
| Cola de comunicaciones, `storage_deletion_queue` (F13) | Integradas | Las muestro en la consola |

## 2. Cuatro cosas que no estaban, y hay que decir

1. **Los estados de iglesia no se aplican en ningún sitio.** `app.church_ids_for_user()`
   alimenta todas las políticas RLS y no mira `churches.status`. Una iglesia `suspended` o
   `archived` es hoy plenamente accesible. Suspender no suspende nada.
2. **`canUsePlatform()` no lo importa ningún fichero.** La única función que decide si una
   iglesia puede seguir usando la plataforma está muerta.
3. **`church_status` mezcla tres cosas** en un enum: situación comercial (`trial`,
   `past_due`, `cancelling`), ciclo de vida (`provisioning`, `archived`) y algo que parece
   castigo (`suspended`) sin decir de qué tipo. No hay bloqueo de seguridad ni mantenimiento.
4. **No hay proveedor de cobro**, ni configurado ni decidido (D14, y `07-decisiones.md`
   deja Stripe/Adyen/Redsys como decisión futura no tomada).

## 3. Entidades

### Catálogo de planes, versionado

```
plans                 clave, nombre, visible para contratar
  └── plan_versions   versión, precio, moneda, periodicidad, prueba, vigencia
        └── plan_version_entitlements   capacidad → límite
```

Un plan se edita creando una versión nueva. **Las suscripciones vigentes siguen apuntando a
la versión que contrataron**: editar un plan no cambia lo que alguien ya firmó. Cambiar de
versión es una operación explícita y auditada.

`plan_entitlements` queda obsoleta. No se borra en esta fase: está vacía y borrarla es un
cambio de esquema sin beneficio.

### Suscripción

Una por iglesia (ya lo garantiza `unique (church_id)`). Se le añade:

- `plan_version_id`: qué versión concreta rige.
- `current_period_start` / `current_period_end`: el periodo en curso.
- `scheduled_plan_version_id` / `scheduled_change_at`: cambio de plan programado.
- `cancel_at_period_end`: cancelar al final frente a cancelar ya.

La suscripción pertenece al tenant. Transferir el propietario de la iglesia **no** la toca.

### Excepciones comerciales

`church_entitlement_overrides` gana `starts_at`, `granted_by` real y auditoría. Motivo
obligatorio ya lo era. Caducidad ya existía y ahora se consulta: una excepción vencida deja
de aplicar sola, sin que nadie la borre.

### Estados, separados

| Dimensión | Dónde vive | Quién la cambia |
|---|---|---|
| Situación comercial | `subscriptions.status` | Gestión comercial, o el proveedor vía webhook |
| Ciclo de vida | `churches.status` (`provisioning`, `active`, `archived`) | Alta y baja |
| Bloqueo de seguridad | `churches.security_block_reason` + fecha | Seguridad, con motivo obligatorio |
| Mantenimiento | `churches.maintenance_until` | Operación |

No se fusionan en un booleano. Una iglesia puede estar al corriente de pago y bloqueada por
seguridad, y son cosas distintas con responsables distintos.

## 4. Permisos

Capacidades nuevas, por función, siguiendo el modelo de F14:

| Capacidad | Para qué | Lo que NO da |
|---|---|---|
| `platform.commercial.read` | Ver planes, suscripciones y excepciones | Cambiar nada |
| `platform.commercial.manage` | Cambiar plan, excepciones, cancelar | Acceso al contenido de las iglesias |
| `platform.operations.read` | Ver procesos, webhooks, trabajos y sus errores | Reintentar |
| `platform.operations.retry` | Reintentar operaciones idempotentes | Reejecutar cobros ni envíos externos |
| `platform.support.manage` | Abrir y revocar sesiones de soporte | Leer datos de la iglesia por sí sola |
| `platform.audit.read` | Consultar la auditoría de plataforma | Modificarla |
| `platform.config.manage` | Disponibilidad de planes y módulos | Tocar secretos |

Un operador de soporte no cambia precios. Un operador comercial no ve el contenido privado
de una iglesia. La capacidad se comprueba **en la base**, no en la interfaz.

## 5. Fuentes de verdad

| Pregunta | Fuente | Nunca |
|---|---|---|
| ¿Qué plan tiene? | `subscriptions.plan_version_id` | El `plan_key` suelto |
| ¿Qué límites? | Versión del plan + excepciones vigentes | El plan actual del catálogo |
| ¿Puede entrar? | Estado comercial + bloqueo + ciclo de vida | Un solo campo |
| ¿Qué pasó? | `platform_audit_logs` | Los registros de la aplicación |
| ¿Se cobró? | El proveedor, conciliado | Una redirección del navegador |

## 6. Dependencias de F13 y F14

De F14: capacidades, auditoría, guarda, servicios y diseño del panel.
De F13: trabajos con `correlation_id`, la cola tolerante de comunicaciones, la cola de
borrado y el runbook. **No construyo un sistema de observabilidad paralelo**: la consola
lee lo que esas fases ya registran.

## 7. Qué queda bloqueado, y por qué

**La integración de facturación.** No hay proveedor elegido ni credenciales. Sin eso:

- no hay webhooks reales que firmar ni conciliar,
- no hay facturas que enlazar,
- y una simulación no acredita una integración.

Lo que sí se construye sin proveedor, porque no depende de él: el catálogo, la suscripción,
las excepciones, los estados y la consola. Los campos `billing_provider` y
`billing_customer_external_id` ya existen y se quedan vacíos, representando explícitamente
«sin proveedor», que es la verdad.

## 8. Decisiones que necesito de Carlos

Están en `docs/FASE-15-GESTION-COMERCIAL.md` §Decisiones, con una propuesta concreta para
cada una. Mientras no se resuelvan, **no se inventan**: el código deja el hueco explícito en
vez de rellenarlo con un valor cómodo.
