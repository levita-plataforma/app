# ADR 0016 · Referencia visual: imágenes `layout*` sustituyen a Calserv

## Estado

Aceptado — 16 de septiembre de 2026.

## Contexto

La documentación de producto vigente (`docs/10-brief-diseno.md`, `docs/14-referencia-uiux-alabanza.md`) establecía que toda la UI/UX de LEVITA debía heredarse literalmente de la app existente de Alabanza (Calserv / LFY Worship): tipografías Work Sans/Outfit, temas Negro+Escenario, sidebar de 264 px, tokens de color oscuros documentados con sus valores hexadecimales exactos.

Al iniciar la Fase 0, el promotor aportó veinte pantallas de referencia (`imagenes/layout0.png`, `layout1.png`, `layou2.png`, `layou3.png`) con un sistema visual propio y distinto: fondo crema/off-white, acento dorado de marca (icono de iglesia), sidebar blanca con iconografía a color por módulo, cards con acento pastel por dominio funcional, ilustraciones de línea (hojas, iglesia) como elemento decorativo recurrente, y tipografía sans-serif geométrica clara. Las veinte pantallas cubren Inicio, Personas, Familias, Grupos, Áreas de servicio, Alabanza, Niños, Discipulado, Eventos, Comunicación, Pastoral, Ofrendas, Instalaciones, Informes, Integraciones, Formularios, Configuración, Ayuda y soporte, Perfil de usuario y vista móvil responsive.

## Decisión

Las imágenes `imagenes/layout*.png` (y cualquier imagen futura con ese prefijo) son la **fuente de verdad del sistema visual de LEVITA**, sustituyendo la instrucción de heredar literalmente los tokens de Calserv. Calserv deja de ser la referencia de paleta, tipografía y estructura visual concreta.

Se conserva de la documentación histórica de Calserv únicamente lo que no es visual: los **patrones de comportamiento común** (bandeja de avisos, activación de push por dispositivo, perfil con pestañas Tema/Avisos/Contraseña, flujo de acceso con contraseña e invitación) descritos en `docs/03-notificaciones.md` y `docs/14-referencia-uiux-alabanza.md`, en tanto no contradigan lo que las imágenes de referencia muestren explícitamente.

## Alternativas consideradas

1. **Calserv manda; las imágenes son solo inspiración puntual de iconografía.** Rechazada explícitamente por el promotor: la instrucción fue "todas las imágenes que empiezan con layout mandan".
2. **Fusionar ambos sistemas (tokens de Calserv + estructura de las imágenes).** No solicitada y con alto riesgo de resultar en una identidad inconsistente; se descarta a favor de una fuente de verdad única y clara.

## Consecuencias

- La Fase 0 implementa la shell de aplicación (layout autenticado, sidebar, header, cards de módulo) siguiendo la paleta, tipografía, radios y estructura observados en `imagenes/layout0.png` y `layout1.png`, no los valores hexadecimales documentados en `docs/14-referencia-uiux-alabanza.md`.
- `docs/10-brief-diseno.md` y `docs/14-referencia-uiux-alabanza.md` requieren actualización para reflejar este cambio de dirección visual, dejando constancia expresa de la decisión y su fecha (ver sección de mantenimiento documental de `docs/README.md`).
- La landing pública actual (tokens navy/gold oscuro en `src/app/globals.css`) no se modifica por este ADR: es un artefacto de marca comercial distinto de la aplicación autenticada, y su alineación con el nuevo sistema visual, si procede, es una decisión de producto separada.

## Riesgos

- Las imágenes son mockups estáticos, no un sistema de diseño tokenizado: será necesario inferir una escala de espaciados, radios y estados (hover/focus/disabled) no visibles directamente en las capturas. Mitigación: donde el mockup no especifique un valor, se usan las convenciones de accesibilidad ya fijadas en `docs/10-brief-diseno.md` (contraste, foco visible, tamaño táctil ≥44px) y se documenta la inferencia en el sistema de diseño implementado.
