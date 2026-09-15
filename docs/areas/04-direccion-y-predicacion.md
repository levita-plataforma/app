# 04 · Dirección del culto y predicación

**Criticidad: CRÍTICA** · **Personas por domingo:** 2–3 · **Horizonte: 2–6 meses**

## Qué hace

Quien predica, quien dirige el culto y quien lee la Escritura. Es el área que
menos se parece a las demás: no rota semanalmente, se planifica con meses, y la
decide el pastor, no un coordinador.

## Puestos típicos

| Puesto | Cuántos | Cualificación | Llega antes |
|---|---|---|---|
| Predicador | 1 | Muy alta, reconocimiento de la iglesia | 20 min |
| Director del culto | 1 | Alta | 30 min |
| Lectura bíblica | 0–1 | Baja | 20 min |
| Avisos | 0–1 | Baja | 20 min |

## Cómo funciona de verdad

**Se planifica por trimestres, no por semanas.** El pastor cierra los púlpitos
con meses de antelación, sobre todo si hay predicadores invitados o una serie de
predicaciones. Un panel que muestre cuatro semanas no le sirve de nada.

**No es rotación, es asignación deliberada.** No hay reparto justo que valga: se
decide quién predica sobre qué, y a menudo el mismo tema encadena varias
semanas. Sugerir a quien menos ha predicado es, aquí, ruido.

**El invitado externo no está en el roster.** Un predicador de otra iglesia no
es miembro, no tiene cuenta y no va a instalarse una PWA. Pero tiene que
aparecer en la programación.

**La confirmación funciona distinta.** A un predicador invitado se le llama por
teléfono; no se le manda un push para que pulse «puedo servir».

## Si falta alguien

Es la emergencia mayor: sin predicador no hay culto en el sentido que la iglesia
entiende. Por eso se cierra con meses y se confirma por teléfono.

## Qué necesita del producto

1. **Horizonte de planificación largo** (R9). Vista por defecto de tres o seis
   meses, no de cuatro semanas.
2. **Personas externas sin cuenta.** Una ficha en `people` con `user_id` nulo y
   `status = 'invited'` ya lo permite —ese es justo el motivo de haberlo
   modelado así—, pero hace falta marcarla como externa para que el sistema no
   le insista con avisos que nadie va a leer.
3. **Confirmación manual.** El coordinador marca «confirmado por teléfono» en
   nombre de la persona. Sin esto, el panel dirá que el púlpito está sin cubrir
   cuando en realidad está cerrado desde hace dos meses.
4. **Sin sugerencia de rotación.** El área se marca como asignación deliberada y
   `ordenarPorRotacion()` no se aplica.
5. **Tema o serie asociada al evento**, para planificar una serie completa.
   *(Fase 3.)*

## Qué no necesita

Rotación justa. Avisos agresivos. Detección de conflictos con otras áreas —el
predicador no está en la banda.

## Preguntas para las entrevistas

- ¿Con cuánta antelación sabéis quién predica?
- ¿Cómo lleváis a los predicadores invitados de fuera?
- ¿Quién decide el púlpito: el pastor solo, un equipo, los ancianos?
