# Módulo Giving — Donaciones, fondos y aportaciones

## Estado

**Arquitectura prevista; fuera del MVP inicial.**

## Objetivo

Gestionar aportaciones sin convertir LEVITA automáticamente en sistema contable completo.

## Entidades potenciales

- `funds`
- `donations`
- `donation_allocations`
- `giving_campaigns`
- `payment_methods` tokenizados por proveedor, nunca tarjetas en LEVITA
- `provider_transactions`
- `payout_reconciliations`

## Reglas

- acceso financiero separado;
- minimizar visibilidad de quién dona y cuánto;
- no almacenar PAN/CVV;
- integrar proveedor compatible con requisitos legales/comerciales;
- reconciliación idempotente;
- webhooks firmados;
- exportación contable;
- política de recibos/documentación antes del lanzamiento.

## Separación contable

LEVITA puede registrar donaciones y fondos, pero contabilidad general, impuestos, nóminas y libros contables se integrarán con herramientas externas salvo decisión posterior.
