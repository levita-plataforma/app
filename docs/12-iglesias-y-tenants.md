# Iglesias, tenants, sedes y configuración

Revisión: **15 de septiembre de 2026**.

## 1. Principio

Una iglesia es el tenant de LEVITA. Tiene identidad, configuración, suscripción, módulos, personas, sedes y datos propios. Ningún cambio funcional en una iglesia afecta a otra salvo cambios de producto administrados por LEVITA.

## 2. Formas de alta

### Autoservicio

1. crear cuenta propietaria;
2. verificar acceso;
3. indicar datos básicos de iglesia;
4. elegir plan/módulos cuando exista catálogo comercial;
5. configurar pago;
6. crear tenant idempotentemente;
7. crear sede principal;
8. copiar base inicial de áreas;
9. activar módulos base;
10. mostrar onboarding.

### Alta asistida

Operación LEVITA crea una invitación/provisioning mínimo. El responsable de la iglesia completa datos, acepta términos y finaliza el pago. Soporte no debe inventar contraseña ni asumir permanentemente la identidad del cliente.

## 3. Iglesia

Datos base:

- nombre legal/comercial según necesidad;
- nombre visible;
- slug;
- país;
- idioma;
- zona horaria;
- moneda;
- email administrativo;
- estado;
- branding;
- configuración regional;
- suscripción;
- tenant owner(s).

## 4. Sedes

Toda iglesia recibe una sede principal al crearse, aunque la UI simplifique el concepto para iglesias pequeñas.

La iglesia puede posteriormente:

- crear sedes;
- renombrarlas;
- archivarlas;
- asignar responsables;
- configurar dirección;
- asociar actividades, grupos y recursos.

Archivar una sede no elimina actividades históricas.

## 5. Áreas iniciales

Plantilla sugerida inicial:

- Sonido;
- Multimedia;
- Bienvenida;
- Niños;
- Dirección del culto.

Alabanza se incorpora funcionalmente después porque debe preservar Calserv.

La plantilla es una copia por tenant. La iglesia puede:

- crear;
- renombrar;
- ordenar;
- cambiar icono/color;
- archivar;
- configurar reglas.

Nunca actualizar todas las iglesias porque cambió la plantilla global.

## 6. Módulos

Cada iglesia tiene `church_modules`. Estados conceptuales:

- enabled;
- disabled;
- trial si se aprueba;
- suspended por condición comercial;
- grandfathered/override interno si fuera necesario.

El estado comercial no se debe mezclar con roles.

## 7. Propietarios y administradores

`church_owner` controla:

- suscripción;
- administradores;
- configuración de alto nivel;
- exportación/baja según política.

Puede haber más de un propietario si se decide. Debe existir protección para no dejar una iglesia activa sin ninguna persona capaz de administrarla.

## 8. Branding

Configuración por tenant:

- logo;
- nombre corto;
- color/acento permitido por sistema de diseño;
- datos de contacto;
- enlaces públicos.

La personalización no debe romper accesibilidad ni producir una aplicación completamente diferente por cliente.

## 9. Configuración regional

- locale;
- zona horaria;
- primer día de semana;
- formatos de fecha/hora;
- idioma;
- moneda;
- política de horas de silencio;
- preferencias de calendario.

## 10. Onboarding

Checklist recomendado:

1. completar iglesia;
2. revisar sede;
3. importar personas;
4. invitar administradores;
5. revisar áreas;
6. crear primer tipo de servicio;
7. configurar avisos;
8. preparar primer evento;
9. publicar;
10. revisar estado de suscripción.

Debe poder interrumpirse y retomarse.

## 11. Cuenta en varias iglesias

Al entrar, si la cuenta tiene varias pertenencias:

- recordar última iglesia válida por dispositivo;
- mostrar selector claro;
- permitir cambiar;
- revalidar acceso;
- limpiar estado tenant-scoped;
- indicar contexto en navegación.

## 12. Suspensión e impago

La política comercial está pendiente. Técnicamente distinguir:

- acceso normal;
- periodo de gracia;
- solo lectura;
- suspensión;
- exportación/baja.

No borrar datos por un pago fallido.

## 13. Cancelación y baja

Flujo profesional:

1. confirmar autoridad del solicitante;
2. mostrar fecha efectiva;
3. ofrecer exportación;
4. cancelar renovación;
5. limitar acceso según política;
6. iniciar retención;
7. anonimizar/eliminar al finalizar si corresponde;
8. conservar únicamente lo requerido.

## 14. Soporte

La operación LEVITA puede ver estado técnico/comercial sin abrir contenido. Para entrar al tenant se utiliza una sesión temporal de soporte auditada.

## 15. Configuración sensible

Solo roles específicos pueden modificar:

- billing;
- integraciones;
- propietarios;
- políticas de seguridad;
- módulos;
- exportaciones;
- retención.

## 16. Plantillas de iglesia

Futuro: plantillas por tamaño/tradición/estructura. Deben copiar configuración inicial, no mantener dependencia mutable con un catálogo central.

## 17. Criterio de aislamiento

Dos iglesias pueden usar el mismo email de contacto, nombres de áreas idénticos y horarios iguales sin compartir IDs, datos, permisos ni configuración.
