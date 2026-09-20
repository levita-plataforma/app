# Fase 12 · Giving — implementación

Estado: **IMPLEMENTADA** en `feature/diogo-fase-12-giving`, sobre `main` (`d498adc`). Pendiente de
validación expresa de Carlos y de integración en `main`. No confundir con **PRODUCCIÓN**: migraciones
aplicadas y `Vercel Production = Ready` comprobados no han ocurrido todavía.

Implementado directamente sin contrato documental separado, por instrucción explícita del encargo.
Este documento describe lo construido realmente.

**F12 no está completa.** Solo cubre Giving (parte de Diogo, según `docs/REPARTO-CARLOS-DIOGO.md`).
Pastoral y Analítica avanzada no se han tocado — son entregas separadas.

## Alcance

Giving representa **donaciones/aportaciones que recibe la iglesia**. No es billing de LEVITA (cuota
SaaS, suscripción, facturación de plataforma) — ver `docs/06-facturacion.md` §9. Cubierto: fondos,
campañas, aportaciones manuales, donante opcional/anónimo, recurrencia modelada, refunds con tope
validado, conciliación simple, exportación CSV, resumen agregado separado del detalle, permisos
financieros específicos, RLS, auditoría.

## Fuera de alcance (confirmado, no tocado)

Contabilidad completa, ERP, doble entrada, nómina, impuestos, certificados fiscales automáticos,
integración bancaria genérica, PSD2/open banking, CRM financiero, scoring/ranking de donantes,
gamificación, exposición pública de valores personales, ningún proveedor de pago real (Stripe, Adyen,
Redsys...) elegido unilateralmente.

## Regla crítica: deny-by-default financiero

`church_owner`/`church_admin` **NO** reciben automáticamente acceso a donaciones individuales solo por
ser owner/admin (D10 en `docs/07-decisiones.md`). Verificado por inspección: la inserción de
capabilities de Fase 0 en `role_capabilities` (`select 'church_owner', key from capabilities`) fue un
seed de una sola vez contra las capabilities que existían entonces — cada fase posterior (Comunicación,
Alabanza, ahora Giving) concede explícitamente lo suyo. Aquí se aplicó ese mismo criterio de forma
deliberadamente más estricta: ni siquiera `church_owner` recibe las capabilities de detalle financiero
por defecto (`giving.read_contributions`, `giving.refund`, `giving.reconcile`, `giving.export`).

El rol **`finance_manager`** ya existía en el catálogo desde la Fase 0
(`20260916000700_rbac_capabilities_scopes.sql`), sin ninguna capability concedida hasta ahora — es el
rol que este encargo pide reutilizar en vez de crear uno nuevo. Recibe **todas** las capabilities de
Giving.

## Modelo

```text
giving_funds
  id, church_id, name, description, status, is_default, created_at, updated_at, archived_at
  índice único parcial: un solo is_default=true por church_id entre los activos

giving_campaigns
  id, church_id, fund_id, name, description, starts_at, ends_at,
  target_amount_minor (opcional, nunca autorización/límite), currency, status (draft/active/closed/archived)

giving_contributions
  id, church_id, fund_id, campaign_id, person_id (nullable), anonymous,
  amount_minor bigint (NUNCA float), currency, method, status, reconciliation_status,
  contributed_at, reference, notes (restringido), provider/provider_payment_ref/provider_customer_ref
  check: anonymous=true ⇒ person_id IS NULL
  índice único parcial de idempotencia: (provider, provider_payment_ref) cuando no son nulos

giving_refunds
  id, church_id, contribution_id, amount_minor, reason, provider_ref, status, created_by_person_id

giving_recurring_plans
  id, church_id, person_id (nullable), fund_id, campaign_id, amount_minor, currency, frequency,
  status (active/paused/ended), provider/provider_subscription_ref, starts_at, next_due_at, ended_at

giving_reconciliations
  id, church_id, contribution_id, external_reference, status, notes, reconciled_by_person_id, reconciled_at
```

Todas con `church_id not null`, `enable+force row level security`, FK compuestas tenant-safe
`(hijo_id, church_id) references padre (id, church_id)`, sin política de escritura directa.

Migraciones: `20261003000100` a `20261003001200`.

## Dinero

`amount_minor bigint` en todas las tablas monetarias (céntimos: `1000 = 10,00 EUR`) — nunca
float/double/JS floating point. `check (amount_minor > 0)` en contribuciones, refunds y planes
recurrentes; validado en el RPC además del `check` de esquema, para un error de dominio legible. En
frontend, siempre `Intl.NumberFormat` (`formatMoney`/`formatMoneyClient`), nunca cálculo float
autoritativo.

## Currency

`churches.currency` (ya existía, `text not null default 'EUR'`) es el valor por defecto cuando no se
especifica moneda en una campaña/contribución/plan — nunca `'EUR'` hardcodeado en el RPC. Una
contribución conserva su moneda histórica en su propia columna, no una referencia a `churches.currency`
que pudiera cambiar después.

## Donante opcional y anónimo

`person_id` nullable en `giving_contributions`/`giving_recurring_plans`: una iglesia puede recibir una
donación sin persona registrada. `anonymous=true` implica `person_id IS NULL` (constraint de esquema,
no solo validación de aplicación) — no existe un perfil "Anónimo" falso; simplemente no hay persona
asociada. Cuando hay persona, se valida contra `church_people` del mismo tenant (nunca se acepta un
`person_id` de otra iglesia).

## Métodos y estados

`giving_contribution_method`: `cash`, `bank_transfer`, `card`, `direct_debit`, `other`. Una aportación
manual (`cash`/`bank_transfer`) puede registrarse directamente como `succeeded` por quien tiene
`giving.create_contribution` — nunca se finge un procesamiento bancario que no existe.

`giving_contribution_status`: `pending`, `succeeded`, `failed`, `refunded`, `cancelled`. No hard
delete: una aportación mal registrada se cancela (`cancel_giving_contribution`), preservando el
histórico; nunca se elimina físicamente.

## Provider

**Auditado explícitamente: no existe ningún proveedor de pago real en el proyecto.** No se eligió
Stripe/Adyen/Redsys unilateralmente. Se prepararon únicamente:

- Columnas de referencia externa (`provider`, `provider_payment_ref`, `provider_customer_ref` en
  contribuciones; `provider`, `provider_subscription_ref` en planes recurrentes), nunca el ID del
  proveedor como PK interna, ningún secreto en base de datos.
- Índice único parcial de idempotencia por `(provider, provider_payment_ref)`: un mismo evento de
  proveedor no puede crear dos contribuciones si en el futuro existe integración real.

**No se implementa** ningún endpoint de webhook — no hay proveedor real que lo dispare, y un endpoint
que valide firma de un proveedor inexistente sería simulación o superficie de ataque sin propósito
(mismo criterio que A14 en Fase 9). La UI nunca dice "pago online disponible" ni simula checkout: solo
muestra los métodos realmente disponibles (efectivo, transferencia, tarjeta como registro manual,
domiciliación, otro — todos como registro, nunca como cobro real automatizado).

## Recurrencia

`giving_recurring_plans` modela un **compromiso/planificación**, nunca débito bancario automático.
Crear un plan **no genera ninguna contribution** — verificado por test. Cada aportación real (manual o,
en el futuro, de proveedor) es una fila propia en `giving_contributions`, opcionalmente enlazada al
plan vía `recurring_plan_id` para trazabilidad. `next_due_at` es informativo; sin proveedor, nunca
dispara nada.

## Refunds

Modelo separado (`giving_refunds`), nunca se pone el importe original a cero. Refund parcial soportado:
la suma de refunds `succeeded` de una contribución **nunca supera** su `amount_minor` original —
validado server-side con `for update` (evita condición de carrera), no solo en frontend. Sin proveedor
real: refund manual exige `giving.refund` explícita y queda auditado.

## Conciliación

Modelo simple (`giving_reconciliations` + `giving_contributions.reconciliation_status`), nunca
contabilidad de doble entrada. Estados: `unreconciled`, `reconciled`, `exception`. Marcar
conciliada/excepción exige `giving.reconcile`.

## Exportación CSV

Ruta `/app/ofrendas/informes/export` (Route Handler, mismo patrón que
`src/app/(app)/app/eventos/[id]/exportar/route.ts`), exige `giving.export` explícita (separada de
`giving.read_contributions` — poder exportar no implica automáticamente poder ver detalle, y viceversa;
la RPC de exportación exige la primera). Campos: fecha, fondo, campaña, importe, moneda, método,
estado, conciliación, referencia — nunca notas.

**Mitigación de CSV injection real, no solo escapado de comillas/comas**: cualquier campo que empiece
por `=`, `+`, `-`, `@` (o tab/CR) se antepone con un apóstrofo antes de escapar comillas, forzando que
la hoja de cálculo lo lea como texto literal. El `csvEscape` ya existente en
`src/server/events/registrations-service.ts` (Fase 6) **no** tiene esta mitigación — se implementó
deliberadamente distinto en `src/server/giving/giving-export.ts`, no se reutilizó tal cual. Exportación
auditada (`giving.export.created`, con recuento de filas, nunca los datos exportados).

## Resumen vs. detalle (separación crítica)

Dos capabilities distintas, cada una con su propia superficie:

- `giving.read_summary`: agregados únicamente, vía `app.giving_summary`/`app.giving_summary_by_fund`/
  `app.giving_summary_by_method` (RPC, nunca una fila individual).
- `giving.read_contributions`: única capability con política de `SELECT` sobre `giving_contributions` —
  quien solo tiene `giving.read_summary` obtiene 0 filas si intenta leer la tabla directamente, no un
  error que revele que hay datos ocultos.

Un `church_owner` sin `giving.read_contributions` ve el dashboard con totales (`Total del mes: 12.400 €`)
pero no puede abrir el listado de aportaciones individuales — verificado por test.

## Permisos

```text
giving.read_summary        giving.manage_funds
giving.read_contributions  giving.manage_campaigns
giving.create_contribution giving.manage_settings (declarada, sin UI de settings en esta fase)
giving.update_contribution
giving.refund
giving.reconcile
giving.export
```

Reparto: `finance_manager` recibe todas. `church_owner`/`church_admin` reciben solo
`read_summary`/`manage_funds`/`manage_campaigns`/`manage_settings` — nunca detalle, refund,
conciliación ni export. No se creó ningún rol nuevo (`giving.admin` como capability única quedó
explícitamente descartada por el propio encargo).

## Módulo

`giving` ya existía en el catálogo desde la Fase 0 (`('giving', 'Ofrendas', 10)`), con nav ya apuntando
a `/app/ofrendas`. `app.require_giving_module` sigue el mismo patrón que `require_serving_module`/
`require_groups_module`/`require_worship_module` de fases anteriores.

## RLS y RPC

Mismo patrón de dos capas consolidado desde Fase 9/11: `app.*` (`security definer`, capability + módulo
+ validación de entrada + escritura + auditoría) + wrapper `public.*` (`security invoker`), `revoke all
... from public, anon` + `grant execute ... to authenticated` en **ambas** capas — corrección aplicada
desde el primer commit, sin ventana insegura en el historial (hallazgo real de Fase 11: `revoke ...
from public` solo no bastaba para quitarle acceso a `anon`).

## UI

Rutas: `/app/ofrendas` (dashboard, con separación resumen/detalle visible), `/app/ofrendas/fondos`,
`/app/ofrendas/campanas`, `/app/ofrendas/aportaciones` (+ `/nueva`, `/[id]`), `/app/ofrendas/recurrencia`,
`/app/ofrendas/conciliacion`, `/app/ofrendas/informes` (+ `/export`). Mismo patrón que Comunicación/
Alabanza: Server Components con `requireTenantContext`, Server Actions con `requireCapability` antes de
cada escritura.

## Auditoría

`giving.fund.created/updated/archived`, `giving.campaign.created/updated/closed`,
`giving.contribution.created/updated/refunded`, `giving.reconciliation.completed`,
`giving.export.created`, `giving.recurring_plan.created/updated` (aditivo, no listado en el encargo
original pero mismo criterio). Metadata nunca incluye `notes` ni el importe con contexto personal
innecesario — verificado por test.

## Tests

`supabase/tests/fase12_giving_test.sql`: 57 aserciones — fondos (default único, archivado bloqueado si
es default), campañas (transición de estados, moneda heredada), dinero (0/negativo rechazados),
deny-by-default (owner sin capability no puede crear/reembolsar), aportaciones (con/sin persona,
anónima, persona cross-tenant rechazada), resumen vs. detalle (owner ve agregado, no filas; finance ve
detalle), refunds (parcial, tope exacto, exceso rechazado, cross-tenant), conciliación, aislamiento
cross-tenant (fondos, campañas, contribuciones, FK), recurrencia (plan no genera contribution), RLS
forzada en las seis tablas, superficie pública/anon revocada, module gating, auditoría sin notas en el
payload.

**1423/1423 tests del repositorio completo en verde** (`supabase db reset --local` +
`supabase test db`). `supabase db diff --local` sin cambios pendientes. `npm run lint`, `npm run
typecheck`, `npm run build` limpios.

## Bugs reales encontrados y corregidos durante la implementación

1. **`church_people` insert directo bajo rol `authenticated`**: en el fixture del test, un `insert`
   directo se ejecutaba sin `reset role` tras una llamada previa a `test_set_auth_uid`, violando RLS.
   Corregido añadiendo `reset role;` antes de cada bloque de fixture con escritura directa (mismo
   patrón ya usado en el resto del archivo).
2. **Tres aserciones de test con actor/expectativa incorrectos**, no bugs de la RPC: (a) el test de
   `amount_minor = 0/negativo` se ejecutaba como `church_owner`, que ya carece de
   `giving.create_contribution` — devolvía `42501` correctamente, no `22023`; se movió a ejecutarse
   como `finance_manager` para probar de verdad la validación de importe. (b) el test de refund
   cross-tenant esperaba `P0002` pero el actor (financiero de A, sin rol en B) correctamente recibe
   `42501` antes de llegar a buscar la contribución — deny-by-default por capability, más estricto que
   lo que el test esperaba; corregida la expectativa. (c) el test de edición cross-tenant de un fondo
   esperaba `42501` pero el actor (owner de B, con `giving.manage_funds` general) sí tiene la
   capability y correctamente recibe `P0002` al no encontrar el fondo bajo su propio `church_id` — más
   preciso que 42501; corregida la expectativa. (d) conteo de aportaciones sin conciliar mal calculado
   en el propio test (esperaba 1, el resultado real correcto era 2).
3. **Cliente componente importando runtime de módulo `"server-only"`**: `AportacionAcciones.tsx` y
   otros cuatro componentes cliente importaban `formatMoney`/`GIVING_METHOD_LABELS` (funciones/const
   reales) desde `giving-service.ts`. Mismo patrón de bug ya encontrado y corregido en Fase 9/11 —
   corregido duplicando esas dos utilidades de presentación en `ui.ts` (client-safe) y dejando solo
   imports `type`-only del módulo de servidor.

## Deuda técnica real

- Proveedor de pago real (cobro online): no implementado, no elegido. Contrato de abstracción
  preparado (`GivingPaymentProvider` — createPayment/getPayment/refundPayment/verifyWebhook/
  normalizeEvent), sin ninguna implementación concreta todavía.
- Webhooks de proveedor: no implementados, sin proveedor que los dispare.
- Recibos/certificados fiscales automáticos: fuera de alcance de esta fase (A17 parcialmente
  resuelta).
- `giving.manage_settings` declarada como capability pero sin pantalla de configuración propia en esta
  fase (moneda/fondo por defecto ya se gestionan desde Fondos).
- Selector de persona en el formulario de nueva aportación es un campo de texto libre (ID), no un
  buscador de personas con autocompletado — se prefirió no acoplar a un componente de otro módulo
  fuera de alcance de esta implementación.

## Contratos pendientes con Carlos

Ninguno crítico identificado: Giving no depende de Activity, Serving ni de ningún otro módulo de
Carlos. Reutiliza únicamente núcleo (People, capabilities, auditoría, `churches.currency`).

## Estado real de la fase

**FASE 12 — GIVING: IMPLEMENTADA.** Registro manual, fondos, campañas, recurrencia modelada,
conciliación y reporting son operativos end-to-end. Cobro online pendiente de selección/configuración
de proveedor — no es una carencia de esta implementación, es una decisión de producto todavía sin
tomar (A17). F12 global (Pastoral + Analítica) no está completa: son entregas separadas.
