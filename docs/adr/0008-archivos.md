# ADR 0008 · Capa común de archivos

## Estado

Aceptado — 16 de septiembre de 2026.

## Contexto

Múltiples módulos futuros (Personas/avatares, Alabanza/partituras, Kids/documentos, Facilities/fotos de salas, exportaciones) necesitarán almacenar archivos. Sin una capa común, cada módulo reinventará su propia gestión de privacidad, cuotas y limpieza.

## Decisión

Se define una tabla de metadatos `files` (o equivalente), tenant-aware, con: bucket/objeto de almacenamiento, `church_id`, propietario lógico, entidad asociada (tipo + id), clasificación de privacidad (`public`/`internal`/`personal`/`restricted`, alineada con `docs/17-seguridad-operacion.md`), checksum, MIME type, tamaño, retención, y estado.

Los buckets son **privados por defecto**. El acceso a un archivo privado se realiza mediante URL firmada de corta duración generada por el backend, nunca exponiendo `service_role` al cliente ni rutas de archivo adivinables.

## Alternativas consideradas

1. **Buckets públicos con URLs no firmadas para simplificar el MVP.** Descartado: viola el principio de privacidad por diseño para datos personales/restringidos (avatares con nombre real, futuros documentos de Kids).
2. **Cada módulo gestiona sus propios archivos sin tabla de metadatos común.** Descartado: impide aplicar una política de clasificación y retención uniforme, y duplica lógica de firma de URLs en cada módulo.

## Consecuencias

- La Fase 0 crea la tabla de metadatos y las políticas de storage base; no implementa todavía subida de archivos de ningún módulo funcional concreto (eso llega con cada módulo, ej. avatar en Fase 1/2).
- Cualquier función que genere una URL firmada debe validar tenant y clasificación antes de firmar.

## Riesgos

- Acumular archivos huérfanos si una entidad se borra sin limpiar sus archivos asociados. Mitigación: definir en cada módulo consumidor si sus archivos se archivan junto con la entidad o requieren job de limpieza (ver ADR 0009 y 0010).
