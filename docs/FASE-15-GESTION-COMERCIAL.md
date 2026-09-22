# Fase 15 · Gestión comercial y operación de plataforma

Rama `feature/carlos-fase-15-gestion-comercial-operacion`, sobre `origin/main` = `3904383`.

```
FASE 15: PARCIAL
```

Hay un motivo concreto y no es deuda menor: **la integración de facturación está
bloqueada porque no hay proveedor de cobro elegido ni configurado**. Todo lo demás —planes,
suscripciones, excepciones, estados, consola y soporte— está construido y probado.

Se corresponde con las etapas **CA-4** y **CA-5** de la propuesta de consola del 22/09/2026.
Contrato en [CONTRATO-FASE-15.md](CONTRATO-FASE-15.md).

---

## 1. Qué se puede hacer ya

| Función | Dónde | Capacidad |
|---|---|---|
| Ver el catálogo de planes y sus versiones | `/operacion/planes` | `platform.commercial.read` |
| Ver derechos y excepciones de una iglesia | Ficha de iglesia | `platform.commercial.read` |
| Cambiar de plan, con vista previa del efecto | Ficha de iglesia | `platform.commercial.manage` |
| Conceder y revocar excepciones | Ficha de iglesia | `platform.commercial.manage` |
| Cancelar, ahora o al final del periodo | Ficha de iglesia | `platform.commercial.manage` |
| Bloquear o desbloquear por seguridad | RPC | `platform.support.manage` |
| Ver el estado de colas y trabajos | `/operacion/procesos` | `platform.operations.read` |
| Reintentar lo que se puede repetir | `/operacion/procesos` | `platform.operations.retry` |
| Abrir y revocar sesiones de soporte | `/operacion/soporte` | `platform.support.manage` |
| Consultar la auditoría | `/operacion/auditoria` | `platform.audit.read` |

## 2. Cuatro cosas que la inspección encontró

No se buscaban; salieron al mirar qué había antes de construir.

1. **Los estados de iglesia no se aplicaban en ningún sitio.** `app.church_ids_for_user()`
   alimenta todas las políticas RLS y no mira `churches.status`. Una iglesia `suspended` o
   `archived` era, y sigue siendo, plenamente accesible: suspender no suspendía nada. F15
   separa las dimensiones y las expone; **qué se impide con cada una es una decisión
   pendiente** (§4.5), y no la he inventado.
2. **`canUsePlatform()` no lo importaba ningún fichero.** La única función que decidía si
   una iglesia podía seguir usando la plataforma estaba muerta.
3. **`plan_entitlements` existía desde la Fase 0 y nunca tuvo una fila.** La sustituye el
   catálogo versionado.
4. **`support_sessions` era solo una tabla**: ninguna función, ninguna interfaz, nadie la
   usaba. Ahora tiene ciclo de vida.

## 3. Decisiones de diseño que conviene entender

### El catálogo está versionado, y por eso está vacío

Un plan se edita creando una versión nueva. Las suscripciones apuntan a la versión que
contrataron, así que **subir un precio no cambia lo que ya tiene firmado nadie**. Sin esto,
un formulario de edición sería capaz de modificar contratos vigentes sin querer.

El catálogo nace sin planes a propósito: los precios y la periodicidad son decisiones de
Carlos (§4). La pantalla lo dice —«el catálogo está vacío, no es un fallo de carga»— en
lugar de enseñar planes de ejemplo que alguien podría tomar por reales.

### La vista previa declara lo que no sabe

`preview_plan_change` devuelve `prorrateo: "sin_politica_acordada"` y
`cobro: "sin_proveedor_configurado"`, y la interfaz los enseña. Ocultarlos daría a entender
que el cambio cobra algo.

### Un proceso sin procesador no se pinta en verde

Los webhooks entrantes y los trabajos de importación y exportación tienen tabla desde la
Fase 0 y **ningún código los lee**. La consola los muestra como «estado desconocido», con
esa palabra. Un contador a cero sin nadie procesando no es una buena noticia.

### Solo se reintenta lo idempotente

Hoy eso es el borrado de ficheros y nada más. No hay botón de «reintentar todo» ni forma de
marcar un trabajo como completado a mano: el reintento reinicia los intentos, no finge el
resultado. Para cobros y envíos externos no existe reintento, y no es un olvido.

### Una sesión de soporte no abre ninguna puerta

Abrirla **no cambia ninguna política RLS**. Un operador con sesión activa sigue sin ver el
directorio, los menores, los casos pastorales ni las donaciones. Sirve para dejar constancia
de que se está atendiendo una incidencia.

Pedir un ámbito que implique datos devuelve un error que explica por qué: esa política de
autorización no está acordada (§4.8), y construir la puerta antes que la cerradura sería
peor que no tenerla.

## 4. Decisiones pendientes de Carlos

Cada una con una propuesta concreta. **Ninguna está aplicada en el código**: donde hace
falta, el hueco es explícito.

| # | Decisión | Propuesta |
|---|---|---|
| 4.1 | **Planes y precios** | Tres planes con precio mensual en euros. Sin catálogo no hay gestión comercial real, solo estructura. |
| 4.2 | **Periodo de prueba** | 30 días desde el alta, sin tarjeta. Ya existe `trial_ends_at` sin política que lo rija. |
| 4.3 | **Impuestos y facturas** | Los emite el proveedor cuando lo haya. No construir facturación propia. |
| 4.4 | **Cambio de plan y prorrateo** | Subir de plan: efecto inmediato. Bajar: al final del periodo. El prorrateo lo calcula el proveedor. |
| 4.5 | **Qué impide cada estado** | La más urgente, porque hoy no impide nada. Propuesta: impago y suspensión dejan **lectura y exportación**, quitan escritura; el bloqueo de seguridad corta todo; archivada, nada. Aplicado en `church_ids_for_user` o en una comprobación equivalente, no solo en la interfaz. |
| 4.6 | **Periodo de gracia tras impago** | 15 días antes de suspender, con avisos. |
| 4.7 | **Acceso a datos durante la suspensión** | Poder exportar siempre, incluso suspendida: negar la salida de sus propios datos a quien no ha pagado es un problema legal, no una palanca comercial. |
| 4.8 | **Autorización de soporte con acceso a datos** | Petición del operador, aprobación de un segundo operador, caducidad corta y aviso a la iglesia. Hasta que se decida, solo diagnóstico. |
| 4.9 | **Proveedor de cobro** | Sin recomendación: depende de facturación, IVA y de dónde se factura. Es lo que bloquea §5. |

## 5. Bloqueado: la integración de facturación

No hay proveedor elegido ni credenciales. Sin eso no hay webhooks reales que firmar, ni
conciliación, ni facturas que enlazar.

**Lo que no he hecho, y es deliberado:** simularlo. Un mock que responda «cobrado» no
acredita una integración y convierte una pantalla en una mentira convincente. Los campos
`billing_provider` y `billing_customer_external_id` existen desde la Fase 1 y **se quedan
vacíos**, que es la representación honesta de «sin proveedor».

Cuando se elija, lo que habrá que construir está en el encargo §7 y no cambia: firma de
webhooks, persistencia, idempotencia, tolerancia a eventos fuera de orden, conciliación y
estados desconocidos explícitos.

## 6. Qué se reutiliza de F13 y F14

**De F14**: capacidades de plataforma y su regla de no autoconcesión, `platform_audit_logs`
con `app.write_platform_audit`, la guarda del panel, `platform-service` y el diseño.

**De F13**: `correlation_id` e idempotencia en los trabajos, la cola tolerante de
comunicaciones con `failed_to_process`, `storage_deletion_queue`, el runbook y las suites
ejecutables. **No se ha construido observabilidad paralela**: la consola lee lo que esas
fases ya registran.

## 7. Migraciones

| Migración | Qué hace |
|---|---|
| `20261004001004` | Siete capacidades nuevas; estados separados en cuatro dimensiones; bloqueo de seguridad |
| `20261004001005` | Catálogo versionado, suscripción ampliada, historial, excepciones con inicio |
| `20261004001006` | Cambio de plan con vista previa, excepciones, cancelación |
| `20261004001007` | Consola de procesos, reintento seguro, sesiones de soporte, auditoría consultable |

Ninguna reescribe una migración aplicada. Todas se aplican sobre el esquema integrado.

## 8. Pruebas

**Hechas** (batería completa: 1688 ok, 0 problemas):

- `fase15_comercial_test.sql` (32): derechos desde la versión contratada; editar el catálogo
  no toca lo contratado; soporte no cambia precios; comercial no bloquea por seguridad;
  vista previa que no muta nada y declara lo que no sabe; cambio de plan con historial y
  auditoría; cambio programado que no altera el plan vigente; excepción caducada que deja de
  aplicar sola; cancelar sin borrar.
- `fase15_operacion_soporte_test.sql` (23): colas sin procesador declaradas como
  desconocidas; sin capacidad no se ve nada; errores recortados; reintento que reinicia
  intentos sin marcar como hecho; ámbito de datos rechazado; sesión sin motivo rechazada;
  revocación efectiva de inmediato; auditoría que deja dicho que la sesión no dio acceso.
- Las cuatro suites Node de F13 pasan sobre el esquema de F15.
- `typecheck`, `lint` y `build` limpios.

**Pendientes, y por qué:**

- **Webhook duplicado, inválido y fuera de orden**: no hay proveedor ni procesador. Probarlo
  exigiría inventar el formato de eventos de un proveedor que no está elegido.
- **Resultado incierto del proveedor y conciliación**: lo mismo.
- **Consumo por encima de un límite reducido**: los límites se calculan y se enseñan, pero
  **no se aplican** en ninguna parte, porque qué hacer al superarlos es la decisión §4.5.
- **Suspensión y reactivación sin pérdida de datos**: comprobado que cancelar no borra; la
  suspensión con efecto real no existe hasta §4.5.
- **Interfaz en móvil y escritorio**: no se ha abierto en un navegador. El build pasa, y eso
  no demuestra que se vea bien.

## 9. Estado exacto

- **`main`**: `3904383`, con F13 y F14 integradas.
- **Producción**: al día con `main`, 123 tablas, sin migraciones pendientes.
- **Esta rama**: cuatro migraciones **sin aplicar** en producción. Van antes del despliegue.
- **Sin integrar**: esperando validación de Carlos del commit concreto.

## 10. Para validar

1. Revisar §4 y decidir. Sin §4.1 no hay planes que asignar; sin §4.5 los estados siguen sin
   impedir nada.
2. Comprobar en la Preview: `/operacion/planes` (vacío y explicado), `/operacion/procesos`
   (colas sin procesador en «desconocido»), `/operacion/soporte` (lo que una sesión no
   permite) y la ficha de una iglesia.
3. Si se aprueba: aplicar las cuatro migraciones **antes** de integrar, y después el PR.
