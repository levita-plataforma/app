# Integraciones, API, importación y portabilidad

Revisión: **15 de septiembre de 2026**.

## 1. Estrategia

LEVITA debe ser extensible sin acoplar el núcleo a proveedores concretos. Toda integración externa se encapsula detrás de contratos internos.

Categorías previstas:

- email;
- push;
- pagos;
- almacenamiento;
- calendarios;
- mensajería;
- contabilidad;
- videoconferencia/streaming;
- autenticación empresarial futura;
- analítica;
- webhooks/API.

## 2. Webhooks entrantes

Requisitos:

- firma/verificación del proveedor;
- timestamp y protección de replay;
- idempotency key;
- persistencia del evento recibido;
- procesamiento asíncrono;
- retry;
- dead-letter o estado fallido;
- correlación con tenant.

Nunca confiar en `church_id` enviado libremente por un proveedor si no está vinculado a una configuración interna.

## 3. Webhooks salientes

Futuro módulo/API para clientes avanzados:

- endpoints por tenant;
- secreto rotatorio;
- eventos seleccionables;
- retries;
- firma;
- logs de entrega;
- desactivación automática ante fallo sostenido;
- límites.

## 4. API

Primera etapa: API interna del producto.

Futuro: API pública versionada con:

- OAuth o tokens tenant-scoped;
- scopes;
- rate limits;
- auditoría;
- paginación;
- versionado;
- deprecación documentada.

No exponer directamente tablas Supabase como contrato público estable.

## 5. Importación

Soportar inicialmente CSV/Excel para People y, después, otros módulos.

Flujo profesional:

1. subir archivo;
2. detectar columnas;
3. mapear campos;
4. validar;
5. previsualizar;
6. detectar duplicados;
7. elegir estrategia;
8. ejecutar job;
9. mostrar resultado;
10. permitir descargar errores;
11. auditar lote.

## 6. Estrategias de deduplicación

No fusionar automáticamente solo por nombre. Usar señales configurables:

- email normalizado;
- teléfono normalizado;
- identificadores externos;
- coincidencia manual.

Las fusiones de personas deben ser operaciones explícitas, auditadas y reversibles en lo posible.

## 7. Exportación y portabilidad

Cada módulo debe definir su exportación administrativa. Como mínimo:

- personas;
- familias;
- grupos;
- eventos;
- programación;
- datos propios del tenant.

Separar exportación operativa de una solicitud formal de derechos RGPD.

## 8. IDs externos

Usar tabla de mapeo o campos claramente separados:

```text
external_source
external_id
church_id
entity_type
entity_id
```

No utilizar IDs externos como PK internos.

## 9. Calendarios

Futuro soporte:

- ICS para suscripción;
- exportar actividad personal;
- Google/Microsoft mediante OAuth si se prioriza;
- actualización/cancelación coherente.

## 10. Proveedores

Todo proveedor externo necesita:

- finalidad;
- datos enviados;
- región de procesamiento;
- contrato/DPA cuando corresponda;
- estrategia de fallo;
- coste;
- límites;
- posibilidad de sustitución.
