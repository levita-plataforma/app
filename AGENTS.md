<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Normas de trabajo de LEVITA

Leer [FUNCIONAMIENTO.md](FUNCIONAMIENTO.md) antes de modificar este repositorio.
Cada tarea se realiza en una rama identificable: `hotfix/` para arreglos y
`feature/` para nuevas funcionalidades; consultar la guía para otros tipos y
el prefijo opcional `codex/`. **Las migraciones se nombran con la fecha y hora
UTC de su creación (`date -u +%Y%m%d%H%M%S`), nunca con un número escogido a
mano: la CLI de Supabase indexa por ese número y una colisión hace que la
migración no se ejecute, sin error.** Cada responsable integra sus propias
fases, por separado y sin depender de la otra persona. No desarrollar ni hacer
commits directamente en `main`: la integración va por pull request y con el CI
en verde, que es la única comprobación obligatoria. Avisar antes de integrar
algo que toque el núcleo compartido —tenant, permisos, RLS, navegación, tipos
generados— o la fase de la otra persona: no hace falta su permiso, sí que se
entere. Quien integra lo deja escrito en la PR, porque las cuentas son
compartidas y el registro automático no identifica al autor.
Respetar el trabajo de la otra persona y usar clones o worktrees separados para
tareas simultáneas.
