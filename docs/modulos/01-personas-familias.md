# Módulo People — Personas, familias y directorio

## Objetivo

Mantener una fuente de verdad de personas de la iglesia sin exigir cuenta digital y sin convertir el directorio en un contenedor de datos sensibles.

## Entidades

- `people`
- `church_people`
- `households`
- `household_members`
- `person_contacts`
- `tags`
- `person_tags`
- `custom_field_definitions`
- `custom_field_values`
- `invitations`
- `person_merges` o historial equivalente

## Capacidades

- crear, editar, archivar y restaurar personas;
- importar CSV/Excel;
- detectar duplicados;
- fusionar con auditoría;
- crear hogares;
- gestionar relaciones;
- invitar a una cuenta;
- directorio interno con privacidad configurable;
- búsqueda por nombre, email, teléfono, tags y campos autorizados;
- segmentación para otros módulos.

## Reglas

1. Una persona puede existir sin `auth.user`.
2. Una cuenta puede pertenecer a varias iglesias.
3. No fusionar automáticamente solo por nombre.
4. Archivar no borra historial de servicio, grupos o eventos.
5. Datos de Kids, Pastoral y Giving permanecen en sus módulos.
6. El directorio nunca expone por defecto email/teléfono sin política definida.

## Estados recomendados

- visitor
- connected
- member
- inactive
- archived

No son roles de autorización.

## Familias

Una familia/hogar agrupa personas, pero las relaciones deben ser explícitas. Tipos sugeridos: padre/madre/tutor/hijo/cónyuge/otro responsable. No asumir que un household equivale a autorización legal.

## Importación

Flujo obligatorio: carga → mapeo → validación → preview → duplicados → ejecución → informe.

## Permisos

Separar como mínimo:

- `people.read_basic`
- `people.read_contact`
- `people.manage`
- `people.import`
- `people.export`
- `people.manage_privacy`

## Métricas

- personas activas;
- nuevos registros;
- invitaciones pendientes;
- duplicados detectados;
- hogares;
- perfiles incompletos.
