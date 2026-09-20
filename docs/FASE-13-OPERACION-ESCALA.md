# Fase 13 · Endurecimiento, operación y escala

Rama `feature/diogo-fase-13-operacion-escala`, sobre `origin/main` = `612160c`.

```
FASE 13: PARCIAL
```

No está cerrada, y el motivo no es deuda menor: tres criterios de cierre exigen un entorno
al que no tengo acceso. Están en §6, con lo que haría falta para levantarlos.

Lo que sí se ha hecho está comprobado contra el esquema y el código reales, no contra la
documentación, y cada comprobación es repetible.

---

## 1. Matriz de cierre

| Requisito | Qué había | Evidencia | Estado |
|---|---|---|---|
| RLS en tablas tenant | Habilitada y forzada en todas | `invariantes_aislamiento_test.sql` §1 | **Cumple** |
| `search_path` en funciones definer | Fijado en todas | Invariantes §2 | **Cumple** |
| Superficie anónima acotada | 5 funciones públicas declaradas | Invariantes §3 | **Cumple** |
| Alta de personas | Admitía identidades ajenas | Corregido en `20261004000410`; invariantes §6 | **Corregido** |
| Escritura anónima en tablas | 43 tablas con grants heredados | Corregido en `20261004000411`; invariantes §9 | **Corregido** |
| Claves foráneas tenant-safe | Dos cruzaban tenants | Corregido en `20261004000411`; invariantes §7 | **Corregido** |
| Aislamiento entre iglesias | Correcto | Prueba manual con miembro raso: no ve otra iglesia, no vincula personas, no crea eventos, no borra actividades | **Cumple** |
| Tokens: un solo uso | Correcto | `npm run test:tokens` | **Cumple** |
| Tokens: caducidad y revocación | Correctas | `npm run test:tokens` | **Cumple** |
| Tokens: almacenamiento | Solo huella, 256 bits | `npm run test:tokens` | **Cumple** |
| Avisos: idempotencia | Correcta | `npm run test:jobs` §1 | **Cumple** |
| Avisos: concurrencia | `for update skip locked` | `npm run test:jobs` §2 | **Cumple** |
| Avisos: proceso caído | Se recupera sin dejar nada a medias | `npm run test:jobs` §3 | **Cumple** |
| Cola de comunicaciones | Una fila corrupta la atascaba **para siempre** | Corregido en `20261004000412`; `npm run test:jobs` §4 | **Corregido** |
| Rate limits públicos | Solo en inscripción y contacto | §5, deuda registrada | **Deuda** |
| Backups y restauración | Sin verificar | §6 | **Bloqueado** |
| Alertas | Sin proveedor | §6 | **Bloqueado** |
| Piloto con dos iglesias | Sin autorización | §6 | **Bloqueado** |
| Rendimiento con volumen | Sin objetivos acordados | §6 | **Bloqueado** |

---

## 2. Hallazgos corregidos

### 2.1 El alta de personas admitía identidades ajenas

`people_insert` estaba declarada `with check (true)`: cualquier cuenta autenticada podía
insertar filas en `people`, **incluidas filas con el `user_id` de otra cuenta**. La víctima
acabaría con dos identidades, una creada por un tercero, y `app.current_person_ids()`
resuelve por `user_id`.

**Lo que no permitía**, y conviene decirlo para no exagerar el hallazgo: vincular esa fila a
una iglesia falla con `42501`, porque `church_people` exige `people.manage`. La premisa con
la que se escribió la política en la Fase 2 —«la fila es inerte hasta vincularse»— se
sostenía. Lo comprobé, y de hecho mi primera prueba dijo lo contrario por un error de método:
un `insert ... select` cuyo origen RLS oculta inserta cero filas sin fallar, y leí eso como
éxito. La segunda versión verifica que la fila exista después.

Corregido: una persona nace sin cuenta o con la de quien la crea.

### 2.2 Escritura anónima heredada en 43 tablas

Supabase concede privilegios por defecto sobre `public` a `anon` y `authenticated`; cada
migración debe revocarlos y en 43 tablas no se hizo, incluidas `roles`, `role_capabilities`,
`subscriptions` y `platform_operators`.

**No era explotable**: todas tienen RLS habilitada y forzada, comprobado tabla por tabla. Pero
dejaba la protección en una sola capa. Revocado, y cambiados los privilegios por defecto para
que las tablas nuevas no lo hereden.

### 2.3 Dos claves foráneas cruzaban tenants

`activity_position_requirements.source_requirement_id` y `audit_logs.support_session_id`
podían apuntar a filas de otra iglesia (ADR 0014). Ahora son compuestas con `church_id`.

### 2.4 Una comunicación corrupta atascaba la cola

El fallo operativo más serio de los encontrados. El runner recorría las comunicaciones
vencidas y **lanzaba al primer error**: con una fila cuyo snapshot de segmentación fuera
inválido, ninguna de las siguientes se procesaba, en ninguna ejecución, para siempre. El cron
devolvía error y al día siguiente repetía lo mismo.

Reproducido con dos comunicaciones en cola: se procesaban **cero**.

Corregido con tres piezas: un estado `failed_to_process` con su motivo, una función que
distingue lo reintentable —bloqueos, interbloqueos— de lo que no se va a arreglar solo, y una
forma de devolver la comunicación a borrador para corregirla. No se descarta nada en
silencio.

---

## 3. Lo que se comprobó y estaba bien

Merece el mismo espacio que lo que falló, porque saber que algo aguanta también es resultado:

- **Aislamiento entre iglesias**: un miembro con el rol más bajo no ve otra iglesia, no
  vincula personas, no crea eventos y no borra actividades. Comprobado con intentos reales,
  verificando que la fila no existiera después.
- **Tokens de invitación**: 256 bits, guardados solo como huella, un solo uso, caducidad y
  revocación respetadas.
- **Motor de avisos**: repetir una pasada no duplica; dos ejecuciones simultáneas no se pisan
  gracias a `for update skip locked`; un proceso que muere a media pasada deja los eventos
  pendientes, sin avisos a medias, y la siguiente los recupera.

---

## 4. Lo que queda ejecutable

| Comando | Qué comprueba |
|---|---|
| `supabase test db` | Toda la batería, con `invariantes_aislamiento_test.sql` dentro |
| `npm run test:jobs` | Idempotencia, concurrencia, caída del proceso y cola atascada |
| `npm run test:tokens` | Ciclo de vida de las invitaciones |
| `npm run test:concurrencia` | Doble reserva de recursos (Fase 10) |

`invariantes_aislamiento_test.sql` es lo que convierte esta auditoría en algo que no caduca:
si alguien añade una tabla sin RLS, una función definer sin `search_path` o una política
`with check (true)`, falla en CI en vez de esperar a la siguiente revisión.

---

## 5. Deuda registrada, no crítica

**Sin límite de tasa en las superficies públicas de token** (`unsubscribe_by_token`,
`cancel_registration_by_token`, `accept_invitation`) ni en `public_event_by_slug`.

No es un riesgo de acceso: los tokens son de 256 bits y la fuerza bruta es inviable. Es un
riesgo de **coste**: nada impide lanzar muchas peticiones y hacer trabajar a la base. No se
ha construido un limitador porque haría falta una identidad de cliente que la base no tiene
—la IP no llega hasta ahí— y un límite global sería, él mismo, una forma de denegación de
servicio: bastaría con saturarlo para impedir que nadie acepte una invitación.

Lo razonable cuando se aborde: limitar en el borde (Vercel o el proxy), no en la base.

**Una cuenta puede crear filas sueltas ilimitadas en `people`.** Inertes y no vinculables,
pero ruido en la tabla central. RLS no es el sitio para un límite de frecuencia.

---

## 6. Bloqueado: qué falta y qué haría falta

### Restauración de backup

**No verificado.** Un backup configurado sin restauración probada no acredita recuperabilidad,
y no tengo acceso al panel de Supabase para ejecutar una.

Para levantarlo hace falta: acceso al proyecto, un entorno aislado donde restaurar y
autorización para hacerlo. Con eso, el ensayo consistiría en restaurar una copia, comprobar
integridad referencial, que los ficheros sigan accesibles y que la aplicación arranque contra
ella.

### Alertas

**No verificadas.** No hay proveedor de observabilidad configurado. Se puede instrumentar y
definir condiciones, pero no puedo probar que una alerta llegue a nadie, y una alerta que no
se ha visto llegar no es una alerta.

### Piloto con dos iglesias

**No realizado.** Exige usuarios reales y autorización expresa. El encargo prohíbe contactar
a terceros automáticamente, y no se ha hecho.

### Rendimiento con volumen

**Sin objetivos.** Medir sin un número que cumplir no dice nada. Propuesta para acordar: que
el directorio y el calendario respondan por debajo de un segundo con 1.000 personas y 200
actividades. Una vez fijado, se mide con datos sintéticos y se revisan planes de ejecución.

---

## 7. Decisiones pendientes de Carlos

1. **MFA para operadores de plataforma**: el encargo pide acordarlo si no está definido. Hoy
   el panel protege con sesión más capacidad.
2. **Objetivos de rendimiento**, §6.
3. **Política de retención y borrado** tras una baja: sin ella no se puede validar el
   comportamiento de conservación y eliminación de datos.

---

## 8. Qué NO se ha tocado

- Billing: sin credenciales de sandbox no se prueba, y no se hacen cargos reales.
- Impersonación y soporte: existe `support_sessions` en el esquema; no se ha ampliado.
- Email y push: siguen desactivados. Nada aquí sugiere lo contrario.
