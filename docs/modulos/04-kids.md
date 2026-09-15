# Módulo Kids — Niños, check-in y protección

## Objetivo

Gestionar actividades infantiles con controles reforzados de seguridad, privacidad y trazabilidad.

## Entidades

- perfiles de menor sobre People;
- `guardian_relationships`
- `pickup_authorizations`
- `kids_classes`
- `kids_sessions`
- `kids_checkins`
- `kids_incidents`
- credenciales/requisitos de voluntarios.

## Reglas críticas

1. Un household no concede por sí solo autorización de recogida.
2. La persona que entrega y la que recoge pueden ser distintas.
3. Debe quedar trazabilidad de check-in/out.
4. Solo personal autorizado accede a información infantil.
5. Aplicar principio de minimización a alergias/necesidades relevantes.
6. No exponer listas de menores en pantallas públicas.
7. Las incidencias requieren permisos y retención específica.
8. Los voluntarios deben cumplir requisitos vigentes para la fecha.

## Check-in

Flujo:

- localizar familia;
- seleccionar menor/actividad;
- validar clase/aforo;
- registrar responsable de entrada;
- generar código/etiqueta si se implementa;
- registrar salida contra autorización;
- registrar excepción con motivo y responsable.

## LOPIVI

Mantener evidencias de requisitos de voluntarios sin almacenar documentos completos cuando no sea necesario. Ver documento de privacidad.

## Permisos

- coordinador Kids;
- check-in operator;
- líder de clase;
- administrador de cumplimiento;
- acceso de tutor a sus menores.

## Métricas

Solo agregadas donde sea posible: niños por sesión, ratios, ocupación, incidencias operativas.
