# RGPD, privacidad, LOPIVI y datos sensibles

Revisión: **15 de septiembre de 2026**.

Este documento es una especificación de producto y arquitectura, no asesoramiento jurídico definitivo. Antes del lanzamiento comercial se requiere revisión legal aplicable en España/UE.

## 1. Roles de privacidad

Modelo esperado:

- la iglesia decide finalidades sobre sus personas y actúa normalmente como responsable del tratamiento;
- LEVITA procesa datos para prestar el servicio y actúa normalmente como encargado respecto de esos datos;
- LEVITA es responsable de sus propios datos de cuenta, facturación, seguridad y operación en los ámbitos que correspondan.

Debe existir contrato/DPA y registro de subencargados/proveedores.

## 2. Privacy by design

- minimización;
- finalidad explícita;
- acceso mínimo;
- aislamiento tenant;
- cifrado en tránsito y en reposo proporcionado por infraestructura adecuada;
- retención;
- exportación;
- eliminación/anonimización;
- auditoría;
- gestión de incidentes.

## 3. Categorías

### Datos ordinarios
Nombre, contacto, pertenencia, disponibilidad, asistencia operativa.

### Datos de mayor sensibilidad
- información pastoral;
- peticiones de oración con contenido personal;
- menores;
- alergias/necesidades de Kids;
- donaciones;
- documentos de cumplimiento;
- información que pueda revelar categorías especiales.

No almacenar categorías sensibles por conveniencia si no existe finalidad clara.

## 4. Derechos

Preparar procesos para:

- acceso;
- rectificación;
- supresión;
- limitación;
- portabilidad cuando aplique;
- oposición cuando aplique.

La iglesia debe poder atender solicitudes sobre sus datos; LEVITA debe aportar herramientas y soporte conforme al contrato.

## 5. Retención

Cada módulo define retención. Ejemplos:

- programación histórica: puede conservarse para trazabilidad legítima;
- invitaciones: caducar y limpiar tokens;
- exportaciones: borrar tras ventana corta;
- archivos temporales: TTL;
- Kids/Pastoral/Giving: política específica;
- tenant cancelado: ventana contractual antes de eliminación/anonimización.

## 6. Exportación y baja

Antes de eliminar un tenant, ofrecer exportación según política. La eliminación se ejecuta como proceso controlado y auditable, no como cascada accidental desde UI.

## 7. Menores y LOPIVI

Para personal que trabaja con menores:

- registrar estado de requisito/credencial;
- vigencia y fecha;
- avisos de caducidad;
- acceso limitado;
- evitar almacenar copia completa del certificado cuando basta con verificar estado y referencia;
- definir procedimiento organizativo de validación.

Kids requiere además autorizaciones de tutores y seguridad de recogida.

## 8. Directorio

La visibilidad de datos de contacto debe ser configurable y coherente con finalidad/expectativas. No hacer público el directorio por defecto.

## 9. Comunicación

Distinguir mensajes necesarios para prestar el servicio de comunicaciones opcionales. Guardar preferencias y suppression list según canal/finalidad.

## 10. Pastoral

No incluir notas pastorales en búsquedas globales, exportaciones generales ni logs. Aplicar permisos explícitos, retención y auditoría de acceso/cambios.

## 11. Giving

El importe y patrón de donaciones es información financiera privada. Acceso solo a roles autorizados; no mostrar a líderes generales por defecto.

**Implementado (Fase 12, Diogo).** `giving_contributions.notes` es texto restringido: nunca aparece en
listados generales, nunca se incluye en notificaciones (push/email siguen el motor común y, si en el
futuro Giving genera alguna, el texto es genérico, nunca importe ni donante) y nunca se audita
completo (el payload de auditoría de `giving.contribution.created` no incluye `notes`, verificado por
test). No se guardan datos financieros dentro de `people` — `person_id` en `giving_contributions` es
solo una referencia opcional a la persona ya existente en el núcleo, nunca una copia de sus datos.
Exportación CSV exige capability propia (`giving.export`), separada de poder ver el detalle
(`giving.read_contributions`), y queda auditada (`giving.export.created`).

## 12. Proveedores

Mantener inventario de subprocesadores:

- hosting;
- base de datos;
- auth;
- email;
- push;
- pagos;
- observabilidad;
- almacenamiento.

Para cada uno: datos, finalidad, región, contrato y mecanismo de transferencia si aplica.

## 13. Logs

No incluir:

- contraseñas/tokens;
- contenido pastoral;
- datos completos de menores;
- información financiera detallada;
- cuerpos completos de formularios sensibles.

## 14. Brechas

Runbook con detección, evaluación, contención, tenants afectados, evidencias, comunicación y obligaciones regulatorias.

## 15. Fotografías

Definir finalidad y permisos. Para menores, política específica y no asumir que consentimiento para check-in implica consentimiento de publicación.

## 16. Datos de prueba

No usar producción en desarrollo/preview salvo proceso de anonimización aprobado.
