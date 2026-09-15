# 08 · Intercesión y oración

**Criticidad:** flexible · **Personas:** 2–20 · **Horizonte:** 1–2 semanas

## Qué hace

Oración antes del culto, cadena de oración durante la semana, vigilias. Es el
área que **no encaja en el modelo de datos actual**, y por eso es la más
interesante de analizar.

## Puestos típicos

| Puesto | Cuántos | Cualificación | Cuándo |
|---|---|---|---|
| Oración previa al culto | 2–5 | Ninguna | 45 min antes |
| Tramo de cadena de oración | 1 por tramo | Ninguna | Franja horaria |
| Vigilia | 1–3 por tramo | Ninguna | Franja nocturna |
| Ministración tras el culto | 2–4 | Alta, madurez y discreción | Al terminar |

## Por qué no encaja

**No hay un evento del que colgar el turno.** Una cadena de oración de 24 horas
se cubre en tramos de una hora: veinticuatro turnos que no pertenecen a ningún
culto. El modelo `evento → turno → asignación` asume que siempre hay un evento
con fecha y hora de inicio, y aquí lo que hay es una rejilla de franjas.

Este es el requisito **R7** del análisis transversal, y afecta también a
limpieza. Es la decisión de modelado grande que queda pendiente:

- **Opción A:** un evento «Vigilia» con un `event_position` por tramo. Reutiliza
  todo lo existente; ensucia la semántica de «puesto».
- **Opción B:** una entidad `shift_slots` con rango horario propio, separada de
  los eventos. Más limpia; duplica la mitad de la lógica de asignación y de
  avisos.

**Recomendación:** opción A para el MVP. Un `positions.tipo = 'franja'` con hora
de inicio y fin propias dentro del evento cubre el caso sin partir el modelo en
dos, y deja la puerta abierta a la opción B si el uso real lo pide.

## Cómo funciona de verdad

**Voluntariado espontáneo, no asignación.** Nadie asigna tramos de vigilia: se
publica la rejilla y la gente se apunta. Es el patrón inverso al del resto del
producto — aquí el sistema ofrece, no propone.

**La ministración tras el culto es otra cosa.** Ahí sí hay un puesto fijo con
requisitos altos de madurez, y sí se asigna.

**Es el área con menos estructura de toda la iglesia.** Funciona por convicción
personal, y la mitad de las iglesias no la programa en absoluto.

## Si falta alguien

No pasa nada visible. Por eso es flexible.

## Qué necesita del producto

1. **Turnos por franja horaria** (R7). Es el área que fuerza este requisito.
2. **Autoservicio: apuntarse en vez de ser asignado.** Un turno abierto donde la
   gente se ofrece. Esto invierte el flujo principal del producto y hay que
   diseñarlo como tal, no como un caso raro.
3. **Rejilla visual de la vigilia**, mostrando qué tramos están vacíos.
4. **Avisos mínimos.** Un recordatorio suave, y nada más. Alarmar por un tramo
   de oración vacío a las cuatro de la madrugada es ruido.

## Qué no necesita

Cualificación, salvo en ministración. Credenciales. Detección de conflictos —se
puede orar a cualquier hora.

## Preguntas para las entrevistas

- ¿Hacéis vigilias o cadenas de oración? ¿Cómo organizáis quién cubre cada hora?
- ¿La gente se apunta sola o alguien reparte los tramos?
