# Áreas de servicio — análisis transversal

> Investigación de referencia. Los nombres de estas doce áreas no son un catálogo cerrado: cada iglesia recibe una base propia y puede crear áreas, editarlas y renombrarlas. Ver [Iglesias y tenants](../12-iglesias-y-tenants.md). Las propuestas de fase de estas fichas se priorizan ahora con el [plan vigente](../13-plan-por-fases.md); el estado de implementación del bloque A0 se conserva en el backlog histórico.

Doce fichas, una por área, en esta misma carpeta. Este documento es lo que sale
de compararlas: los patrones que se repiten, los que no, y qué hay que cambiar
en el modelo de datos por culpa de ellos.

| # | Área | Ficha | Criticidad | Personas típicas |
|---|---|---|---|---|
| 01 | Alabanza y música | [`01-alabanza.md`](01-alabanza.md) | Importante | 5–8 por domingo |
| 02 | Sonido | [`02-sonido.md`](02-sonido.md) | **Crítica** | 1–2 |
| 03 | Multimedia y streaming | [`03-multimedia.md`](03-multimedia.md) | Importante | 2–4 |
| 04 | Dirección y predicación | [`04-direccion-y-predicacion.md`](04-direccion-y-predicacion.md) | **Crítica** | 2–3 |
| 05 | Bienvenida y ujieres | [`05-bienvenida.md`](05-bienvenida.md) | Flexible | 3–6 |
| 06 | Niños y escuela dominical | [`06-ninos.md`](06-ninos.md) | **Crítica** | 4–10 |
| 07 | Adolescentes y jóvenes | [`07-adolescentes-y-jovenes.md`](07-adolescentes-y-jovenes.md) | Importante | 2–4 |
| 08 | Intercesión y oración | [`08-intercesion.md`](08-intercesion.md) | Flexible | 2–20 |
| 09 | Diaconía, ofrenda y santa cena | [`09-diaconia.md`](09-diaconia.md) | Importante | 2–6 |
| 10 | Hospitalidad y café | [`10-hospitalidad.md`](10-hospitalidad.md) | Flexible | 2–4 |
| 11 | Limpieza y mantenimiento | [`11-limpieza-y-mantenimiento.md`](11-limpieza-y-mantenimiento.md) | Flexible | 2–4 |
| 12 | Traducción y accesibilidad | [`12-traduccion-y-accesibilidad.md`](12-traduccion-y-accesibilidad.md) | Importante | 1–3 |

---

## El error que hay que evitar

Tratar las doce áreas igual. El modelo actual —área, puesto, turno, asignación—
las cubre a todas en apariencia, pero al mirarlas de cerca se rompe en cinco
sitios. Un producto que no resuelva esos cinco funcionará bien en alabanza y
mal en niños, sonido e intercesión, que son justo donde más duele fallar.

---

## Los doce requisitos transversales

### R1 · Hora de llegada por puesto

El evento empieza a las 11:00, pero nadie llega a las 11:00.

| Puesto | Llega antes |
|---|---|
| Sonido | 90 min |
| Alabanza (ensayo previo) | 75 min |
| Multimedia | 60 min |
| Niños | 30 min |
| Bienvenida | 30 min |
| Predicador | 20 min |

Hoy el modelo solo tiene `events.starts_at`, así que el recordatorio de las dos
horas antes le llega tarde al técnico de sonido y demasiado pronto al ujier.

**Cambio:** `positions.call_offset_min` como valor por defecto del puesto, con
`event_positions.call_offset_min` para sobreescribirlo en un evento concreto.
Los recordatorios se calculan sobre la hora de llegada, no sobre la del evento.

### R2 · Nivel de cualificación, no un sí o un no

`member_positions` dice hoy si alguien puede cubrir un puesto. En alabanza eso
basta. En sonido y en niños no: hay quien está aprendiendo y no puede quedarse
solo en la mesa.

**Cambio:** `member_positions.level` con tres valores — `aprendiz`, `autonomo`,
`forma_a_otros`. Y una regla de composición que exija al menos un `autonomo` en
los puestos críticos.

### R3 · Requisitos con caducidad por área

En niños y en jóvenes no es una buena práctica: es la **Ley Orgánica 8/2021
(LOPIVI)**, que exige el certificado de delitos de naturaleza sexual a
profesionales **y voluntarios** en contacto habitual con menores. La misma ley
obliga a la entidad a tener protocolo de actuación y a formar a quien trabaja
con menores.

Un producto que permita asignar a alguien sin ese certificado está ayudando a la
iglesia a incumplir la ley.

**Cambio:** `ministry_requirements(ministry_id, kind, blocking)` y
`person_credentials(person_id, kind, issued_at, expires_at, verified_by)`. Si el
requisito es bloqueante y falta o ha caducado, **la asignación se impide**, no se
avisa. Y avisar al líder 60 días antes de que caduque.

### R4 · Reglas de composición del turno

Ningún área se cubre contando cabezas sueltas:

- **Niños:** nunca un adulto solo con menores. Mínimo dos, y preferiblemente no
  dos del mismo hogar.
- **Sonido:** si va un aprendiz, tiene que ir acompañado.
- **Conteo de la ofrenda:** siempre dos personas, por control interno.

**Cambio:** reglas declarativas por puesto (`min_personas`, `requiere_autonomo`,
`no_mismo_hogar`) validadas en `packages/core` al asignar y al publicar.

### R5 · Criticidad, que decide cómo se escala

Si el técnico de sonido cancela el sábado por la noche, es una emergencia: no
hay culto. Si falta uno de cuatro ujieres, no pasa nada. Hoy el producto trataría
los dos rechazos igual, y eso significa o alarmas de más o avisos de menos.

**Cambio:** `positions.criticality` — `critica`, `importante`, `flexible`.
Dirige tres cosas: cuándo se avisa al líder, si el aviso va también por llamada
o WhatsApp, y qué se pinta en rojo en el panel de huecos.

### R6 · Equipos que rotan en bloque

En alabanza no se programa persona a persona: se programa la Banda A o la Banda
B. En limpieza rota la familia Pérez, no Juan Pérez. Asignar de uno en uno es
trabajo inventado.

**Cambio:** `teams` dentro del área, con sus miembros y puestos, y una acción de
«asignar equipo completo» que crea las asignaciones individuales de golpe. Las
asignaciones siguen siendo individuales porque cada persona responde por sí
misma; lo que cambia es cómo se crean.

### R7 · Turnos por franja horaria, no por evento

Intercesión y limpieza no encajan en el modelo evento → turno. Una vigilia de
22:00 a 06:00 se cubre en tramos de una hora. La limpieza se reparte por semanas.
No hay un «evento» del que colgar el turno.

**Cambio:** o bien un evento con `event_positions` por tramo horario, o un
segundo tipo de turno con rango propio. Es la decisión de modelado más grande
que queda pendiente y conviene tomarla antes de la fase 2.

### R8 · Dependencias entre áreas

Multimedia no puede preparar la proyección sin el repertorio de alabanza. Sonido
tampoco. Hoy eso se resuelve con un mensaje de WhatsApp el sábado a las once de
la noche.

**Cambio:** marcar áreas dependientes de un contenido del evento, y un aviso
automático «ya está el repertorio» cuando se publica. Barato de hacer y resuelve
una fricción semanal real.

### R9 · Horizonte de planificación distinto por área

La predicación se planifica con meses. Alabanza con dos o tres semanas. La
limpieza con un mes. Un panel que muestre lo mismo a todos le sobra información
al líder de limpieza y le falta al que programa el púlpito.

**Cambio:** `ministries.planning_horizon_days`, que fija la vista por defecto y
cuándo empieza a avisar de huecos.

### R10 · Frecuencia deseada de servicio

«Sirvo una vez al mes», «cada dos domingos». La causa número uno de que un
voluntario lo deje es servir más de lo que quiere sin que nadie se dé cuenta.

**Cambio:** `availability_rules` con la frecuencia deseada, y que
`ordenarPorRotacion()` —que ya cuenta las veces servidas— la respete. La mitad
del valor de este producto está aquí y no en la programación.

### R11 · Cuántos hacen falta depende de cuántos vengan

En niños, el número de adultos depende de cuántos niños haya, que varía cada
domingo. `event_positions.needed` es un número fijo.

**Cambio:** mínimo fijo más una regla de ratio configurable por la iglesia. **No
hay una ratio legal nacional única** para esto — las que existen son autonómicas
y para campamentos y tiempo libre —, así que cada iglesia fija la suya y el
producto la respeta.

### R12 · Datos de menores

El área de niños guarda nombres de menores, alergias y quién puede recogerlos.
Eso es otro producto —check-in con etiquetas—, con su propio riesgo de RGPD.

**Cambio:** ninguno. **Fuera del MVP, y explícitamente fuera.** Lo que sí entra
es el control de credenciales de R3, que es de los voluntarios adultos.

---

## Qué entra en el MVP

| Requisito | MVP | Por qué |
|---|---|---|
| R1 · Hora de llegada | **Sí** | Barato, y sin él los recordatorios están mal para media iglesia |
| R2 · Nivel de cualificación | **Sí** | Una columna. Sin ella sonido no se puede programar bien |
| R3 · Credenciales LOPIVI | **Sí** | Es la ley, no una función |
| R4 · Reglas de composición | **Sí**, la de dos adultos | Protege a los menores y a la iglesia |
| R5 · Criticidad | **Sí** | Dirige todo el sistema de avisos |
| R10 · Frecuencia deseada | **Sí**, versión simple | Es donde está el valor percibido |
| R6 · Equipos en bloque | Fase 2 | Ahorra trabajo, no desbloquea nada |
| R8 · Dependencias entre áreas | Fase 2 | Barato, pero no bloqueante |
| R9 · Horizonte por área | Fase 2 | Cosmético hasta que haya volumen |
| R7 · Turnos por franja | Fase 2 | Decisión de modelado grande: decidirla antes |
| R11 · Ratio dinámico | Fase 3 | La iglesia lo apaña con el mínimo fijo |
| R12 · Check-in de niños | **Fuera** | Otro producto, otro riesgo |

---

## Cambios al esquema que salen de aquí

```sql
-- R1 · hora de llegada
alter table positions       add column call_offset_min smallint not null default 0;
alter table event_positions add column call_offset_min smallint;   -- null = hereda

-- R2 · nivel de cualificación
alter table member_positions add column level text not null default 'autonomo'
  check (level in ('aprendiz','autonomo','forma_a_otros'));

-- R5 · criticidad
alter table positions add column criticality text not null default 'importante'
  check (criticality in ('critica','importante','flexible'));

-- R4 · reglas de composición
alter table positions add column min_personas      smallint not null default 1;
alter table positions add column requiere_autonomo boolean  not null default false;

-- R3 · credenciales con caducidad (LOPIVI)
create table ministry_requirements (
  church_id   uuid not null,
  ministry_id uuid not null,
  kind        text not null,      -- 'delitos_sexuales', 'formacion_lopivi', 'primeros_auxilios'
  blocking    boolean not null default true,
  foreign key (ministry_id, church_id) references ministries(id, church_id) on delete cascade,
  primary key (ministry_id, kind)
);

create table person_credentials (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null,
  person_id   uuid not null,
  kind        text not null,
  issued_at   date not null,
  expires_at  date,
  verified_by uuid,               -- quién lo comprobó: rastro de auditoría
  foreign key (person_id, church_id) references people(id, church_id) on delete cascade,
  unique (person_id, kind)
);
```

El documento no guarda el certificado, solo el hecho de que se comprobó, cuándo
y quién. Guardar el PDF de un certificado de antecedentes es asumir un riesgo de
RGPD sin ninguna ventaja.

---

## Qué preguntar en las entrevistas

Cada ficha termina con sus propias preguntas. Las tres que hay que hacer sí o sí,
porque deciden requisitos del MVP:

1. **¿Cuántas personas saben llevar la mesa de sonido?** Si la respuesta típica
   es «una», el producto tiene que tratar sonido como un caso aparte, con alertas
   distintas. Es la hipótesis de R5.
2. **¿Pedís el certificado de delitos sexuales a los que sirven en niños?** Si
   la mayoría dice que no, R3 deja de ser una función y pasa a ser un argumento
   de venta: la herramienta les ayuda a cumplir algo que hoy incumplen.
3. **¿Cómo sabéis si alguien está sirviendo demasiado?** Si la respuesta es «no
   lo sabemos» o «cuando se queja», R10 es la función que hace que paguen.
