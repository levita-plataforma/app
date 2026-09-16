# ADR 0002 · People separado de Auth

## Estado

Aceptado — 16 de septiembre de 2026.

## Contexto

Un coordinador necesita poder registrar y programar a una persona (por ejemplo, un voluntario nuevo) antes de que esa persona haya creado una cuenta digital. Si el modelo obligara a que cada asignación apunte directamente a `auth.users`, el alta de una iglesia con 40 voluntarios quedaría bloqueada hasta que las 40 personas se registraran una a una, lo que destruye la adopción inicial.

Además, una persona puede no tener nunca cuenta digital: un menor, un predicador invitado externo, alguien sin acceso a smartphone.

## Decisión

`people` es una tabla independiente de `auth.users`. `people.user_id` es **nullable**. La cuenta de acceso (`auth.users`) se vincula a la persona cuando esta acepta una invitación, sin perder el historial ya generado (asignaciones, turnos, notas) sobre esa persona.

La pertenencia de una persona a una iglesia se modela en una relación explícita `church_people`, tenant-aware, independiente de si existe cuenta.

## Alternativas consideradas

1. **Asignaciones apuntando directamente a `auth.users`.** Descartado: bloquea la operación real de la iglesia y no permite representar personas sin cuenta (menores, invitados externos).
2. **Crear automáticamente un `auth.user` fantasma al dar de alta una persona.** Descartado: genera cuentas sin dueño real, complica la seguridad de invitaciones y ensucia el sistema de autenticación con identidades que nunca se autentican.

## Consecuencias

- Toda función de negocio que involucre personas debe tolerar `user_id IS NULL`.
- El flujo de invitación (Fase 1/2) debe resolver el enlace `people ↔ auth.users` sin duplicar personas si la cuenta ya existía.
- Una misma cuenta (`auth.users`) puede estar vinculada a personas distintas en iglesias distintas mediante `church_people`, permitiendo que una persona pertenezca a varias iglesias sin mezclar sus datos.
- La autorización nunca se resuelve preguntando "¿qué `auth.user` es este?" sino "¿qué persona y qué pertenencias tiene este `auth.user` en el tenant activo?".

## Riesgos

- Riesgo de duplicar personas si la vinculación cuenta↔persona no detecta coincidencias. Mitigación: la vinculación en la aceptación de invitación es explícita (la invitación ya referencia una `person_id` concreta), no una búsqueda heurística.
