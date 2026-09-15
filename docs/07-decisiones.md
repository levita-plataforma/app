# Decisiones y cuestiones abiertas

Revisión: **15 de septiembre de 2026**.

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

### A8 · Publicación multiárea
Definir quién puede publicar una actividad con varias áreas y si el líder puede publicar solo su parte.

### A9 · Ventana de respuesta
Hasta qué momento se puede aceptar/rechazar/cambiar respuesta.

### A10 · Conflictos
Cuáles bloquean y cuáles solo advierten. Por defecto, conflictos humanos informan; credenciales/reglas de seguridad pueden bloquear.

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

## Cuestiones abiertas antes de Fase 11

### A15 · Migración Calserv
Definir estrategia exacta de migración/vinculación, ventana de corte, rollback y conservación de IDs/historial.

## Cuestiones abiertas antes de Fase 12

### A16 · Pastoral
Modelo de retención, visibilidad y requisitos legales/organizativos.

### A17 · Giving
Proveedor, recibos, tratamiento fiscal, conciliación y exportación contable.

## Regla

Una cuestión abierta no debe resolverse “por comodidad del código” si afecta a producto, legal, billing o permisos. Documentar la decisión y actualizar su documento responsable.
