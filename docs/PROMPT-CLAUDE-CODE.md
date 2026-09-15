# Prompts para Claude Code

Revisión: **15 de septiembre de 2026**. Para maquetas usar el
[prompt de Claude Design](PROMPT-CLAUDE-DESIGN.md). Este documento reemplaza el
encargo antiguo de empezar automáticamente por A0: ese bloque contiene trabajo
histórico y no es el siguiente paso confirmado.

## Orientarse antes de programar

```text
Vamos a trabajar en LEVITA. Lee docs/README.md, docs/00-vision.md,
docs/13-plan-por-fases.md y docs/14-referencia-uiux-alabanza.md.

Identifica el repositorio actual. Este checkout levita.app contiene una
landing; el producto de turnos se localizó en Documents/Levitaapp y la app de
Alabanza en Documents/Calserv. Verifica disponibilidad, rama, HEAD y cambios
locales antes de asumir que las notas históricas describen el código actual.
Lee AGENTS.md y CLAUDE.md si existen en el repositorio donde vas a trabajar.

El producto es multiiglesia: alta asistida o registro con cuota y base propia
de áreas que se puede editar, renombrar y ampliar. La UI/UX y el funcionamiento común son los de la app de
Alabanza, que será la última en incorporarse dentro de la general. Reutiliza sus componentes, navegación, acceso, perfil, preferencias y sistema de push/campana durante las primeras fases. No adelantes la incorporación del equipo y los datos específicos de Alabanza.

Compara el estado real con el plan y concreta la tarea autorizada. No repitas
migraciones o pantallas solo porque un documento antiguo diga que faltan.
Distingue código presente, demo, pruebas ejecutadas y función desplegada.
No traslades secretos ni datos reales de un repositorio a otro.
```

## Implementar una tarea del plan

Sustituir el texto entre ángulos por el encargo concreto.

```text
Implementa <tarea concreta> de la fase <número> del plan de LEVITA en
<repositorio confirmado>.

Lee los documentos responsables: tenants, dominio, permisos, flujo afectado
y referencia UI/UX de Alabanza. Si afecta a un área, lee su ficha en docs/areas.

Usa la identidad y patrones de la app existente: extiende componentes antes de
crear otra familia. El contexto de iglesia y los permisos se validan en el
servidor, no solo ocultando controles. Una base de áreas se copia por iglesia;
renombrar conserva identificadores y vínculos. El alta y el pago se recuperan
sin generar tenants ni áreas duplicados.

Conserva la lógica verificada que encuentres y adapta solo lo necesario para
la tarea. La integración visual no permite copiar consultas sin aislamiento
por iglesia. Resuelve los contratos de cuentas, roles y avisos antes de unir
flujos incompatibles.

Ejecuta las comprobaciones aplicables al cambio y al repositorio real. Para
la landing los scripts son lint, typecheck y build; las suites SQL del producto
no existen aquí. Si trabajas en el producto, usa sus instrucciones y pruebas
de dominio/aislamiento cuando correspondan. No informes de pruebas que no has
podido ejecutar ni uses conteos antiguos como resultados actuales.

Comprueba paridad funcional con Calserv en los recorridos afectados: no basta una captura parecida. Conserva carga, error y recuperación, con alcance por cuenta, dispositivo e iglesia. Entrega cambio concreto, validación realizada y limitaciones pendientes.
```

## Retomar y revisar

```text
Retomo LEVITA. Lee el índice y el plan vigente. Comprueba qué repositorios están
accesibles y revisa cambios locales, HEAD y evidencia de implementación.

Resume: qué fase tiene un recorrido completo, qué está en demo, qué falta para
el siguiente criterio de salida y qué decisiones abiertas afectan a esa tarea.
La UI/UX de Alabanza es obligatoria; las notas antiguas de facturación en fase 4
y de diseñar a partir de la landing han quedado sustituidas.
```
