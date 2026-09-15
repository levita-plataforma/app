# Aplicaciones, navegación y superficies

Revisión: **15 de septiembre de 2026**.

## 1. Estrategia

LEVITA debe sentirse como una sola plataforma aunque internamente sea modular. La UI/UX común procede de Calserv / LFY Worship. Evitar aplicaciones visualmente independientes por módulo.

## 2. Superficies

### App principal responsive/PWA

Para miembros, servidores, líderes y administración cotidiana.

### Panel de administración

Puede compartir el mismo frontend/router con layouts y permisos distintos. Separarlo físicamente solo si existe una razón técnica/operativa clara.

### Operación LEVITA

Superficie separada para soporte, billing, health y feature flags. No reutilizar permisos de church admin.

## 3. Navegación modular

Elementos aparecen por entitlement + permiso.

Ejemplo:

```text
Inicio
Personas
Calendario
Servicios
Grupos
Formación
Eventos
Niños
Alabanza
Comunicaciones
Recursos
Informes
Administración
```

No mostrar módulos deshabilitados como errores 403 ordinarios; comunicar que no están habilitados cuando corresponda.

## 4. Contexto

Cabecera o navegación debe hacer visible:

- iglesia activa;
- sede cuando sea relevante;
- perfil;
- campana;
- selector de iglesia.

## 5. Perfil común

- avatar;
- datos personales permitidos;
- tema;
- avisos;
- dispositivos;
- contraseña/método de acceso;
- sesiones cuando se implemente;
- cerrar sesión.

## 6. Mobile

Priorizar recorridos de 30 segundos:

- ver próximo turno;
- responder;
- abrir detalle de actividad;
- hacer check-in permitido;
- ver mensaje;
- confirmar inscripción.

## 7. Escritorio

Optimizar:

- programación;
- tablas y filtros;
- importación;
- administración de personas;
- campañas;
- informes;
- configuración.

## 8. Accesibilidad

Objetivo WCAG AA razonable: teclado, foco, contraste, labels, feedback, estados no dependientes solo de color y componentes accesibles.

## 9. Deep links

Cada entidad relevante debe tener rutas estables y seguras. Un deep link nunca salta autorización.

## 10. Error y recuperación

Estados consistentes:

- loading;
- empty;
- partial;
- retry;
- offline cuando sea viable;
- forbidden;
- module disabled;
- archived.
