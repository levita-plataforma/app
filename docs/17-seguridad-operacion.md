# Seguridad, privacidad y operación de plataforma

Revisión: **16 de septiembre de 2026**.

Este documento complementa [Datos y RLS](02-datos-y-rls.md), [RGPD y LOPIVI](08-rgpd-y-lopivi.md) y [Arquitectura multi-tenant](16-arquitectura-multitenant.md).

**Estado de implementación (Fase 0):** auditoría (§5) y sesiones de soporte con expiración obligatoria (§10) están implementadas a nivel de esquema y función (`app.write_audit_log`, `support_sessions`), sin consola de UI. Secure SDLC (§12) se cubre parcialmente con el CI mínimo (`.github/workflows/ci.yml`: lint, typecheck, build, tests RLS). El resto de este documento (exportaciones cifradas, incidentes, SBOM, runbooks de continuidad) es especificación para fases posteriores.

## 1. Modelo de amenazas mínimo

LEVITA debe proteger frente a:

- acceso entre tenants;
- escalada de privilegios;
- IDOR;
- secuestro de invitaciones;
- abuso de enlaces mágicos;
- filtración de datos por logs;
- exportaciones indebidas;
- archivos maliciosos;
- webhooks falsificados;
- CSRF/XSS según arquitectura;
- automatización abusiva;
- errores de soporte/impersonación;
- exposición accidental de menores;
- acceso indebido a información pastoral o financiera.

## 2. Seguridad por clasificación de datos

Definir al menos cuatro niveles:

1. **Público:** nombre público de evento, contenido explícitamente publicado.
2. **Interno:** programación operativa, datos de equipo visibles a miembros autorizados.
3. **Personal:** contacto, disponibilidad, perfiles.
4. **Restringido:** menores, casos pastorales, datos financieros, documentos de cumplimiento.

Los permisos, retención, logs y exportación dependen de la clasificación.

## 3. Autenticación

- sesiones seguras;
- MFA opcional inicialmente y obligatorio para roles de alto riesgo cuando se implemente;
- revocación de sesiones;
- gestión de dispositivos;
- recuperación de cuenta;
- protección de enlaces mágicos;
- caducidad clara;
- bloqueo/rate limit ante abuso.

## 4. Autorización

Aplicar deny-by-default. Toda mutación sensible se valida en servidor y base.

Casos que requieren controles reforzados:

- administración de roles;
- exportación masiva;
- billing;
- Kids;
- Pastoral;
- Giving;
- impersonación de soporte.

## 5. Auditoría

Auditar como mínimo:

- login administrativo anómalo;
- cambios de roles;
- cambios de módulos/entitlements;
- acceso o modificación de casos sensibles cuando sea jurídicamente y técnicamente adecuado;
- exportaciones;
- importaciones;
- borrados/archivados;
- cambios de billing;
- sesiones de soporte;
- configuración de integraciones;
- cambios de políticas de privacidad.

## 6. Exportaciones

Las exportaciones pueden contener gran cantidad de PII. Requisitos:

- permiso explícito;
- job asíncrono;
- fichero cifrado o enlace firmado de corta duración;
- caducidad;
- auditoría;
- límites;
- notificación al solicitante;
- eliminación posterior.

## 7. Importaciones

- previsualización antes de aplicar;
- validación por fila;
- deduplicación asistida;
- idempotencia;
- límites de tamaño;
- no ejecutar fórmulas de Excel;
- reporte de errores;
- rollback lógico por lote cuando sea viable;
- auditoría del lote.

## 8. Archivos subidos

Validar:

- tamaño;
- MIME real;
- extensión;
- nombre seguro;
- metadatos EXIF cuando proceda;
- análisis malware si se incorporan documentos de riesgo;
- almacenamiento privado por defecto;
- URLs firmadas.

## 9. Incidentes

Crear un procedimiento operativo para:

1. detección;
2. contención;
3. preservación de evidencias;
4. evaluación de impacto por tenant;
5. restauración;
6. comunicación;
7. obligaciones de notificación RGPD;
8. postmortem;
9. acciones correctivas.

## 10. Soporte

El equipo de soporte trabaja primero con metadatos y diagnósticos. Acceder al tenant debe ser excepcional y auditado.

Nunca pedir al cliente contraseña, token o clave privada.

## 11. Gestión de dependencias

- lockfiles;
- actualización periódica;
- escaneo de vulnerabilidades;
- revisión de advisories;
- SBOM si el crecimiento lo justifica;
- evitar paquetes abandonados en funciones críticas.

## 12. Secure SDLC

Cada cambio relevante incluye:

- revisión de permisos;
- tests unitarios;
- tests de integración;
- test de aislamiento tenant;
- revisión de migraciones;
- lint/typecheck;
- validación de errores;
- revisión de logging;
- validación de accesibilidad para UI.

## 13. Feature flags

Los flags se usan para despliegue progresivo, no para autorización. Deben tener:

- nombre estable;
- descripción;
- propietario;
- estado por entorno;
- opcionalmente por tenant;
- fecha de retirada prevista.

## 14. Continuidad

Definir runbooks para:

- proveedor de auth caído;
- proveedor de email caído;
- push caído;
- proveedor de pago caído;
- base degradada;
- cola atascada;
- pérdida de acceso administrativo;
- restauración de backup.
