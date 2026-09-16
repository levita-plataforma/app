# ADR 0014 · Claves y FKs tenant-safe

## Estado

Aceptado — 16 de septiembre de 2026.

## Contexto

RLS protege qué filas puede ver o mutar un usuario, pero no impide, por sí sola, que una fila de la iglesia A referencie por error una fila de la iglesia B si la aplicación tiene un bug (por ejemplo, un `event_id` de otra iglesia colado en un formulario). Esa clase de error debe ser físicamente imposible, no solo improbable.

## Decisión

Toda tabla hija tenant-aware duplica `church_id` (en vez de derivarlo únicamente por join desde la tabla padre) y declara su clave foránea como **compuesta**:

```sql
foreign key (parent_id, church_id) references parent_table(id, church_id)
```

Lo que exige que la tabla padre tenga `unique (id, church_id)`. Esto hace imposible, a nivel de base de datos, insertar una fila hija que referencia una fila padre de otro tenant, incluso si el código de aplicación tuviera un error.

## Alternativas consideradas

1. **Derivar `church_id` únicamente por join desde la tabla padre, sin duplicarlo.** Descartado: obliga a toda política RLS a hacer join, que es la causa principal de RLS lento (ver ADR 0013); además no impide la inserción cross-tenant a nivel de esquema, solo a nivel de query bien escrita.
2. **Validar la pertenencia cross-tenant únicamente en la capa de aplicación antes de insertar.** Descartado: es defensa de una sola capa; un bug, una migración de datos o un acceso directo a la base la saltaría sin que el esquema lo impida.

## Consecuencias

- Cada tabla padre candidata a tener hijas tenant-aware necesita `unique (id, church_id)` además de su PK simple.
- El coste es una columna `church_id` redundante por tabla hija, con riesgo de desincronización si se inserta con datos inconsistentes; ese riesgo queda neutralizado por la propia FK compuesta, que rechaza la inserción si `church_id` no coincide con el de la fila padre referenciada.
- Todo UUID usado como identificador público es no predecible (v4 o equivalente), nunca secuencial.

## Riesgos

- Ninguno significativo más allá del coste de columna redundante, ya aceptado y neutralizado por la propia FK compuesta.
