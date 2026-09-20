<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Normas de trabajo de LEVITA

Leer [FUNCIONAMIENTO.md](FUNCIONAMIENTO.md) antes de modificar este repositorio.
Cada tarea se realiza en una rama identificable: `hotfix/` para arreglos y
`feature/` para nuevas funcionalidades; consultar la guía para otros tipos y
el prefijo opcional `codex/`. No desarrollar ni hacer commits directamente en
`main`. Ningún cambio puede integrarse en `main` sin la validación expresa,
sobre la versión concreta revisada, de quien responde de esa fase: cada
responsable valida las suyas (Carlos las suyas y Diogo las suyas). Lo
compartido, lo transversal y estos documentos de normas los valida Carlos, que
es el propietario. El CI en verde no sustituye esa validación. Si cambia la
propuesta, se requiere una nueva. Quien valida lo deja escrito en la PR, porque
las cuentas son compartidas y el registro automático no identifica al autor.
Respetar el trabajo de la otra persona y usar clones o worktrees separados para
tareas simultáneas.
