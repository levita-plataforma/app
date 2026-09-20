# Fase 14 · Panel de administración de plataforma

Rama `feature/carlos-fase-14-administracion-plataforma`, sobre `origin/main` = `d0e25e8`.
Estado: **pendiente de validación de Carlos**. No integrada ni aplicada en producción.

Este panel es la administración **del producto**, no la de una iglesia. La distinción no es
formal: ser administrador de una iglesia no da acceso aquí, y estar aquí no da acceso a los
datos de ninguna iglesia.

---

## 1. Lo que ya existía y se ha reutilizado

No se ha reconstruido nada de esto:

- `platform_operators` y `app.is_platform_operator()`, de la Fase 1.
- `app.assisted_provision_church()`, el alta asistida, con su invitación de un solo uso.
- La pantalla `/operacion/altas`, que se conserva tal cual.
- `invitations`, `church_modules`, `modules`, `subscriptions`, `church_onboarding`.

Lo que faltaba, y es lo que añade esta fase: **ser operador era binario**. Una fila en
`platform_operators` y listo. Eso bastaba para una pantalla de alta, pero no para un panel
que toca responsables y enciende módulos de iglesias ajenas.

---

## 2. Capacidades de plataforma

Cinco, separadas a propósito:

| Capacidad | Para qué |
|---|---|
| `platform.churches.read` | Ver el panel, el listado y la ficha |
| `platform.churches.create` | Dar de alta iglesias |
| `platform.owners.manage` | Responsables, invitaciones y contactos |
| `platform.modules.manage` | Encender y apagar módulos |
| `platform.operators.manage` | Dar de alta operadores y repartir capacidades |

Pertenecer al equipo y poder actuar son cosas distintas: quien está en `platform_operators`
sin ninguna capacidad entra al panel y no puede hacer nada.

**Nadie se concede capacidades a sí mismo**, ni siquiera quien gestiona operadores. Sin esa
regla bastaría con ser operador de cualquier tipo para acabar siéndolo de todos, y la
separación sería decorativa. Quitárselas sí se permite: reducir el propio acceso nunca es una
escalada. Lo que no se permite es dejar la plataforma sin nadie capaz de gestionar
operadores.

---

## 3. El primer operador

**No hay ninguna ruta en la aplicación para convertirse en operador.** Ni pública ni
autenticada: sería la puerta de atrás más obvia del sistema.

El primer operador se crea con acceso directo a la base:

```sql
select app.bootstrap_platform_operator(
  '<uuid de auth.users>',
  'Alta inicial del equipo de operación'
);
```

La función:

- Solo funciona **mientras no exista nadie** con `platform.operators.manage`. Después falla.
- Exige un motivo, que queda registrado.
- Da las cinco capacidades a esa cuenta.
- Escribe en `platform_audit_logs` con `via: sql_directo`.

No está concedida a nadie: ni a `authenticated` ni a `service_role`. Quien la ejecute tiene
que entrar a la base a propósito, y esa es exactamente la barrera que se busca. A partir de
ahí, los demás operadores se dan de alta desde el panel con
`app.grant_platform_capability`, que sí comprueba permiso y audita.

---

## 4. Privacidad

El encargo insiste en esto y es donde un panel así puede hacer daño, así que conviene ser
explícito sobre qué se ve y qué no.

**No se ve**: el directorio de personas, los menores, la información pastoral, las
donaciones, ni ningún dato de miembros. Nada de eso pasa por las funciones de este panel.

**Se ve**: nombre y estado de la iglesia, plan, situación del alta, sedes, módulos, nombres
y roles de sus responsables, y el historial de lo que el equipo ha hecho sobre ella.

**El recuento de personas es un número y nada más.** Aparece en el listado porque es un dato
administrativo útil —cuánto usa el producto esa iglesia— y no lleva a ninguna parte.

**Los correos van aparte.** `app.platform_church_contacts` exige `platform.owners.manage`,
devuelve solo los de propietarios y administradores, y **registra cada consulta**. Mirar el
contacto de alguien es un acto, no una lectura cualquiera.

Las lecturas son funciones explícitas en vez de abrir las políticas de `churches`,
`subscriptions` o `invitations` con un «o si eres operador». Esa alternativa habría
convertido cada política del sistema en un sitio donde colar un error; aquí la superficie es
una lista corta y cerrada.

---

## 5. Módulos

Se distinguen cuatro cosas que es fácil confundir:

- **Módulo disponible**: existe en el catálogo `modules`.
- **Módulo habilitado**: esa iglesia lo tiene encendido (`church_modules`).
- **Derecho del plan**: lo que la suscripción incluye. **Esta fase no lo toca.**
- **Permiso personal**: lo que una persona concreta puede hacer dentro. Lo decide la iglesia
  con sus roles, no el panel.

**Encender un módulo no concede roles a nadie.** **Apagarlo no borra datos**: la fila se
conserva con su historial y todo vuelve a verse si se reactiva. La interfaz lo dice antes de
pulsar, no después.

---

## 6. Transferencia de propiedad — propuesta, no implementada

El encargo pide una regla aprobada antes de implementar esta operación. **No existe, así que
no se ha implementado.** Mientras tanto, cambiar de propietario se hace con dos operaciones
que sí existen y dejan rastro: invitar al nuevo y retirar al anterior.

Esta es la propuesta, para decidir:

1. **El nuevo propietario tiene que aceptar.** La transferencia no se consuma al pulsarla:
   crea una invitación de propiedad que la otra persona acepta. Nadie se convierte en
   responsable legal de una iglesia sin enterarse.
2. **La iglesia nunca se queda sin propietario.** El anterior conserva el rol hasta que el
   nuevo acepta. Si la invitación caduca, nada ha cambiado.
3. **El anterior propietario pasa a administrador**, no desaparece. Quitarle todo acceso de
   golpe deja a la iglesia sin quien conozca su configuración.
4. **Caducidad de siete días** y una sola transferencia viva por iglesia.
5. **Queda registrado** quién la inició, quién la aceptó y cuándo, en la auditoría de
   plataforma y en la de la iglesia.
6. **Quién puede iniciarla**: `platform.owners.manage`. Y el propietario actual desde su
   propia iglesia, que es el caso normal; el panel es para cuando esa persona ya no está
   disponible.

El punto 3 es el que conviene discutir: hay quien preferirá que el propietario saliente
pierda todo acceso. La propuesta es lo contrario por prudencia operativa, pero es una
decisión de producto.

---

## 7. Migraciones

| Fichero | Qué trae |
|---|---|
| `20261004001000_plataforma_capacidades.sql` | Catálogo de capacidades, capacidades por operador, comprobación, concesión y retirada, auditoría de plataforma y el procedimiento de arranque |
| `20261004001001_plataforma_lecturas.sql` | Portada, listado con filtros y paginación, ficha administrativa y contactos |
| `20261004001002_plataforma_acciones.sql` | Módulos, invitaciones, retirada de responsables y alta idempotente |

La auditoría de plataforma va en `platform_audit_logs` y no en `audit_logs`, que exige
`church_id` porque todo lo suyo ocurre dentro de un tenant. Las acciones del panel no siempre
tienen iglesia —dar de alta a un operador— y su actor no es una persona de ninguna.

---

## 8. Pruebas

`fase14_plataforma_test.sql`, 28 aserciones. Están centradas en **quién no entra**, que es lo
que hay que demostrar en un panel así:

- Sin sesión: no ve nada.
- Propietario de una iglesia: no entra al panel, ni siquiera para su propia iglesia, ni por
  RPC directa.
- Operador con solo lectura: ve la portada, no enciende módulos, no invita, no ve correos.
- Operador con solo módulos: enciende, pero no ve la portada.
- Nadie se concede capacidades a sí mismo, ni siquiera quien gestiona operadores.
- No se puede dejar la plataforma sin quien gestione operadores.
- El arranque no se repite y exige motivo.
- Alta repetida con la misma dirección: no crea una segunda iglesia.
- Apagar un módulo conserva la fila.
- La ficha no contiene correos.

Batería completa: **1541 aserciones, sin fallos**. `tsc`, `lint` y `build` limpios.

---

## 9. Lo que no está en esta fase

- **Transferencia de propiedad**: propuesta en §6, sin implementar.
- **Nada comercial**: ni precios, ni cobros, ni suspensiones. La suscripción se consulta.
- **Impersonación**: no se añade. Si la Fase 13 trae soporte temporal, se enlazará entonces.
- **Reanudación guiada de un alta a medias**: el panel enseña cuáles están sin terminar y
  permite invitar de nuevo, pero no reproduce el asistente paso a paso.

---

## 10. Sobre la coordinación con la Fase 13

El encargo pide reutilizar los contratos de F13 en permisos internos, soporte, auditoría y
observabilidad. **Al escribir esto no existe ninguna rama de F13 en el repositorio**: las
ramas vivas de Diogo son `feature/diogo-fase-11-alabanza-contenido` y
`feature/diogo-fase-12-analitica`, ninguna integrada.

Así que no hay contratos que reutilizar todavía y esta fase se ha construido sobre lo que sí
existe, que es la identidad de operador de la Fase 1. Si F13 trae su propio sistema de
permisos internos, lo de aquí encaja por capacidades y debería poder apoyarse en él sin
rehacerse; pero conviene mirarlo cuando exista, no darlo por hecho.

Tampoco se ha confirmado que F11 y F12 estén cerradas: de la Fase 12 está integrada la parte
de donaciones, y analítica sigue en su rama.
