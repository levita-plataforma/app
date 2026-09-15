# Documentación de LEVITA

Revisión documental: **15 de septiembre de 2026**. Este índice identifica qué
se puede comprobar en este checkout y cómo usar el resto de los documentos.

## Qué existe aquí

| Elemento | Estado y evidencia |
|---|---|
| Landing de «Muy pronto» | Código presente en `src/app` y `src/components`; configuración en `package.json` |
| Marca y maqueta conceptual | Presentes en la landing; referencia comercial. La UI/UX del producto procede de Calserv por instrucción del promotor |
| Panel, PWA y backend de turnos | No presentes en este checkout: no hay `apps/`, `packages/`, `supabase/` ni `scripts/` |
| Historial de implementación | Relatado en `TAREAS.md`; producto localizado en `Documents/Levitaapp`. Código y HEAD identificados; suites y despliegue sin verificar aquí |
| Despliegue de la landing | README y metadata preparados para `levitaapp.com`; el estado del despliegue no se ha comprobado en esta revisión |

Los documentos heredados usan «Turnos» para el producto de programación y
«Calserv / LFY Worship» para la app de Alabanza que se integrará y cuya UI/UX se hereda. En los
nuevos materiales de producto y diseño se usa **LEVITA**. Se conservan esos
nombres en el historial para mantener su contexto. Los dominios
`app.tuiglesia.es` y `mi.tuiglesia.es` son ejemplos de arquitectura, no destinos
de despliegue confirmados.

## Cómo interpretar los estados

- **Especificado:** comportamiento requerido; no acredita que esté construido.
- **Propuesto para diseño:** criterio de maqueta que debe revisarse con el producto.
- **Referido como demo:** el historial relata una pantalla con datos de ejemplo.
- **Referido como implementado/verificado:** el historial relata código o pruebas;
  hay que contrastar cada afirmación con el código del repositorio y volver a ejecutar las comprobaciones cuando corresponda.
- **Verificado en este checkout:** evidencia inspeccionada en archivos presentes.
- **Desplegado:** necesita URL, entorno y comprobación fechada; no se infiere de
  un archivo, una casilla marcada o un resultado de pruebas antiguo.

Las casillas del backlog preservan su significado histórico. No se deben
reiniciar ni marcar como completadas a partir de esta revisión documental.

## Qué leer y qué documento manda

| Documento | Responsabilidad |
|---|---|
| [Visión y alcance](00-vision.md) | Usuarios, problema, entregas y límites del producto |
| [Modelo de dominio](01-modelo-dominio.md) | Vocabulario, estados, cobertura y reglas de publicación |
| [Datos y permisos](02-datos-y-rls.md) | Quién puede consultar y modificar qué; pendientes de autorización |
| [Notificaciones](03-notificaciones.md) | Avisos, destinatarios y referencias de implementación |
| [Aplicaciones](04-apps.md) | Arquitectura y rutas de referencia; mapa de navegación de diseño |
| [Despliegue](05-despliegue.md) | Referencia histórica para el producto; la landing sigue el README raíz |
| [Facturación](06-facturacion.md) | Cuota y activación desde el lanzamiento; importe y condiciones pendientes |
| [Decisiones](07-decisiones.md) | Decisiones heredadas y cuestiones todavía abiertas |
| [Datos personales](08-rgpd-y-lopivi.md) | Criterios de privacidad; análisis jurídico pendiente de revisión según el propio documento |
| [Flujos](09-flujos.md) | Recorridos, estados vacíos, errores y recuperación |
| [Brief de diseño](10-brief-diseno.md) | Pantallas, jerarquía, identidad visual y criterios de evaluación |
| [Escenarios](11-escenarios-diseno.md) | Datos ficticios consistentes para maquetas y revisión |
| [Iglesias y tenants](12-iglesias-y-tenants.md) | Alta asistida/autoservicio y base de áreas editable por iglesia |
| [Plan por fases](13-plan-por-fases.md) | Orden vigente: UI/UX heredada, alta y pago, programación, PWA, piloto, consolidación y Alabanza al final |
| [Referencia UI/UX](14-referencia-uiux-alabanza.md) | App de Alabanza como fuente obligatoria de componentes, experiencia y funcionamiento común; repositorios y HEAD inspeccionados |
| [Áreas](areas/00-indice.md) | Investigación y necesidades por área; hipótesis y fases de origen |
| [Backlog histórico](TAREAS.md) | Trabajo referido, decisiones fechadas y dependencias históricas de Alabanza; el plan vigente y las aclaraciones del promotor prevalecen |
| [Prompt de diseño](PROMPT-CLAUDE-DESIGN.md) | Encargo listo para copiar; resumen del brief, no otra especificación |
| [Prompts de desarrollo](PROMPT-CLAUDE-CODE.md) | Cómo comprobar el contexto antes de programar |

El código presente acredita **estado actual**, no decide por sí solo el alcance
futuro. La visión gobierna el alcance; dominio y permisos gobiernan las reglas;
los flujos aplican esas reglas y el brief hereda su presentación de la UI/UX de Alabanza. Las decisiones confirmadas 11–16 prevalecen sobre las propuestas históricas, incluida facturación en fase 4. Los escenarios
no cambian reglas. Las decisiones fechadas del backlog se incorporan a su
documento responsable; si queda una contradicción, se registra en
[Decisiones](07-decisiones.md) y se etiqueta el supuesto de maqueta.

## Recorridos de lectura

**Diseño:** visión → referencia UI/UX de Alabanza → plan por fases → brief → escenarios → flujos relevantes → prompt.

**Desarrollo de la landing:** README raíz → archivos presentes y scripts de
`package.json`. Este checkout no contiene las suites del producto de turnos.

**Desarrollo del producto:** confirmar primero el contexto de `Documents/Levitaapp` y `Documents/Calserv` con la referencia UI/UX;
leer después dominio, permisos, flujos y backlog. `CLAUDE.md`, `.env.example` y
las rutas del monorepo citados en el historial no existen aquí.

## Mantenimiento

Al cambiar una regla, actualizar su documento responsable y revisar sus ejemplos,
flujos y prompts. Al informar de implementación, añadir repositorio, commit,
entorno, fecha y comprobación realizada. Un diseño aprobado y una función
desplegada son estados distintos.

## Repositorios localizados durante esta revisión

La landing es este checkout. El monorepo de turnos está en Documents/Levitaapp y la app de Alabanza en Documents/Calserv. Se han inspeccionado en lectura: [referencias y hashes](14-referencia-uiux-alabanza.md). Esta revisión edita la documentación de la landing; no sincroniza automáticamente los documentos de los otros dos repositorios. Antes de desarrollar allí, trasladar las decisiones vigentes y contrastar su código y backlog.
