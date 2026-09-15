# Arquitectura SaaS multi-tenant profesional

Revisión: **15 de septiembre de 2026**.

## 1. Modelo de tenancy

LEVITA utiliza una plataforma compartida con aislamiento lógico fuerte. El patrón recomendado para la etapa inicial es **base de datos compartida + `church_id` + Row Level Security**, complementado por constraints, grants y pruebas automáticas de aislamiento.

No se propone un schema o base por iglesia salvo que aparezca una necesidad regulatoria o contractual específica que justifique ese coste operativo.

## 2. Capas de aislamiento

El aislamiento no depende de una sola barrera.

### Capa 1 — Contexto de tenant

Toda solicitud autenticada debe resolver:

- cuenta;
- membresías disponibles;
- iglesia activa;
- sede activa cuando proceda;
- módulos habilitados;
- capacidades del usuario.

El `church_id` enviado por el cliente nunca es una credencial.

### Capa 2 — RLS

Toda tabla tenant-aware debe habilitar y forzar RLS salvo justificación documentada.

### Capa 3 — Grants mínimos

Limitar columnas y operaciones. RLS resuelve filas; los grants y funciones seguras resuelven qué puede cambiarse.

### Capa 4 — Integridad referencial compuesta

Usar claves que impidan conectar una entidad del tenant A con una entidad del tenant B.

### Capa 5 — Servicio/aplicación

El backend valida contexto, entitlements, permisos y reglas de negocio antes de mutar datos.

### Capa 6 — Tests de aislamiento

Debe existir una suite automática que pruebe accesos cruzados para cada nueva tabla y mutación sensible.

## 3. Identidad global y pertenencia local

`auth.users` representa la cuenta global. Una cuenta puede acceder a varias iglesias.

La autorización se deriva de relaciones tenant-aware, nunca de metadatos editables por el usuario.

Flujo:

```text
Cuenta global
  -> pertenencias a iglesias
      -> persona local del tenant
      -> roles/capacidades
      -> sedes
      -> módulos habilitados
```

## 4. Tenant activo

La UI debe mostrar de forma permanente qué iglesia está activa cuando exista posibilidad de confusión. Cambiar de iglesia debe:

1. validar pertenencia;
2. descartar cachés tenant-scoped;
3. actualizar rutas/contexto;
4. recargar entitlements y permisos;
5. impedir que formularios abiertos sigan mutando el tenant anterior.

## 5. Multi-campus

`campus_id` es opcional en entidades que pueden ser globales. No duplicar datos de toda la iglesia por sede.

Ejemplos:

- persona: tenant-wide, campus principal opcional;
- canción: tenant-wide;
- grupo: puede asociarse a sede;
- actividad: puede asociarse a sede;
- sala: pertenece a una sede;
- configuración financiera: normalmente tenant-wide.

## 6. Entitlements

La autorización final es la intersección de:

```text
tenant activo
+ módulo habilitado
+ pertenencia activa
+ capacidad/rol
+ alcance de sede/área/grupo/caso
+ estado del recurso
```

No usar únicamente flags en frontend.

## 7. Operación LEVITA

La operación de la plataforma no recibe acceso silencioso a todos los datos.

### Soporte con impersonación

Si se necesita asistencia dentro de un tenant:

- crear `support_session`;
- registrar motivo;
- limitar duración;
- limitar capacidades;
- vincular operador;
- mostrar banner visible durante la sesión;
- auditar acciones;
- permitir revocación.

Para datos especialmente sensibles, puede requerirse aprobación del tenant antes de abrir una sesión.

## 8. Provisioning idempotente

El alta de una iglesia debe ser una saga recuperable. Pasos típicos:

1. crear cuenta/propietario;
2. crear `church` en estado `provisioning`;
3. crear sede principal;
4. copiar plantilla inicial de áreas;
5. activar módulos base;
6. crear rol propietario;
7. crear customer/subscription en proveedor de pago;
8. confirmar pago o periodo aprobado;
9. activar tenant.

Cada paso debe poder repetirse sin duplicar registros. Guardar claves idempotentes y estado de provisioning.

## 9. Límites y cuotas

Los planes pueden introducir límites como:

- personas activas;
- sedes;
- almacenamiento;
- comunicaciones mensuales;
- módulos;
- usuarios administrativos;
- automatizaciones.

Los límites deben modelarse como entitlements, no como condicionales dispersos en código.

## 10. Rate limiting y protección de abuso

Definir límites por:

- IP para endpoints públicos;
- cuenta;
- tenant;
- tipo de acción;
- proveedor externo.

Acciones sensibles como login, invitaciones, exportaciones y envíos masivos requieren límites específicos.

## 11. Jobs y colas

Procesos asíncronos recomendados:

- notificaciones;
- emails;
- importaciones;
- exportaciones;
- generación de informes;
- webhooks;
- limpieza/retención;
- recordatorios;
- reconciliación de pagos.

Cada job debe incluir `church_id`, correlation id, intentos, backoff y estado final. Los workers no deben procesar datos sin contexto de tenant explícito.

## 12. Caché

Toda caché que contenga datos tenant-aware necesita clave con tenant y, cuando corresponda, usuario/rol. Al cambiar permisos o iglesia activa, invalidar cachés relevantes.

## 13. Observabilidad

Métricas y logs deben poder filtrar por tenant de manera segura sin incluir PII innecesaria.

Requisitos:

- correlation id;
- request id;
- tenant id interno;
- usuario interno cuando sea útil;
- trazas de jobs;
- errores por módulo;
- métricas de latencia;
- métricas de colas;
- fallos de webhooks;
- auditoría separada de logs técnicos.

Nunca usar el contenido de notas pastorales o mensajes privados como datos de log.

## 14. Backup y recuperación

Definir y probar:

- RPO y RTO por entorno;
- backups automáticos;
- point-in-time recovery si el proveedor lo permite;
- restauración en entorno aislado;
- recuperación de objetos/archivos;
- procedimiento ante borrado accidental;
- simulacro periódico.

Un backup no está validado hasta que se haya probado una restauración.

## 15. Entornos

Separar al menos:

- local/dev;
- preview/test;
- staging;
- producción.

No reutilizar secretos ni datos personales reales entre entornos. Datos de prueba deben ser sintéticos o anonimizados.

## 16. Migraciones

Las migraciones de base deben:

- ser versionadas;
- incluir rollback lógico cuando sea viable;
- evitar bloqueos prolongados;
- introducir columnas no nulas de forma segura;
- ejecutar pruebas RLS después del cambio;
- actualizar documentación de dominio.

## 17. Seguridad de secretos

Secretos solo en gestores de entorno/secret manager. Prohibido:

- `.env` comprometido en Git;
- claves service-role en cliente;
- tokens en logs;
- credenciales compartidas por tenant.

## 18. Contrato de disponibilidad

Antes de comercializar SLA formal, medir disponibilidad real. A nivel técnico, preparar:

- health checks;
- monitorización;
- alertas;
- página de estado futura;
- estrategia de degradación;
- reintentos de proveedores externos;
- colas persistentes para no perder eventos.
