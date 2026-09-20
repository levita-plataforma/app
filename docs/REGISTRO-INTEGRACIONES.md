# Registro de integraciones

Quién validó qué y cuándo. Existe porque las cuentas de GitHub y Vercel son
compartidas: el registro automático no distingue a una persona de otra, así que
si no se escribe, no consta. Lo normal es dejarlo en la propia PR, como dice
[FUNCIONAMIENTO.md](../FUNCIONAMIENTO.md) §1; este documento recoge lo que se
integró sin pasar por ella.

## 20 de septiembre de 2026

Nueve integraciones en una sesión de trabajo. **Ninguna pasó por una pull
request**: se hicieron por merge local y push directo a `main`, con validación
expresa de Carlos en la conversación sobre cada commit concreto. Carlos autorizó
ese camino sabiendo que se saltaba la forma de la norma; este documento existe
para no saltarse también el fondo.

Las PR #11 y #18 estaban abiertas y quedaron cerradas como fusionadas al
detectar GitHub sus commits en `main`.

| Merge | Qué entró | Commit validado | Valida |
|---|---|---|---|
| `43f9a47` | Revoke que faltaba en diez wrappers públicos | `769ff8b` | Carlos |
| `384ab7d` | Límites de inscripción pública: 200 por evento / 10 por correo | `27387f1` | Carlos |
| `822a7f0` | Normas: validación por fase (PR #11) | `92d4e7e` | Carlos |
| `37945fa` | Fase 9 · Comunicación, con seis fallos corregidos (PR #18) | `17d25fb` | Carlos |
| `0db9faa` | Estado tras la integración y criterio de revoke | `358f68c` | Carlos |
| `18679ae` | R-01 · el contacto deja de estar a la vista de todos | `d795855` | Carlos |
| `334ad66` | Guión del recorrido CO-03 | `3e14107` | Carlos |
| `037fdd3` | Cierre de R-01 y decisión de segmentación por grupo | `b2fcf29` | Carlos |
| `098f431` | CO-03: qué mirar de los cambios del día | — | Carlos |
| `c5b7d23` | Encargos de las fases 7 y 10 | — | Carlos |

### Migraciones aplicadas en producción

Quince, en dos tandas:

- **Catorce** antes de integrar: el hotfix de revokes (`20260930000300`), los
  límites (`20260930000400`) y las doce de la Fase 9
  (`20261001000100`–`20261001001200`).
- **Una** después: R-01 (`20261002000100`).

### Lo que salió mal

La migración de R-01 se aplicó **antes** de integrar su código. La norma dice
migrar antes de integrar, y se siguió al pie de la letra sin ver que ese cambio
concreto exige que las dos cosas vayan juntas: el código desplegado seguía
pidiendo `email` y `phone` con un `select` directo, así que la ficha de persona
devolvió 404 durante unos minutos, hasta el merge `18679ae`.

Conviene tenerlo presente para la próxima: **una migración que quita permisos
sobre algo que el código usa no se puede aplicar por delante del despliegue.**
Añadir tablas o funciones sí; quitar acceso, no.

### Comprobado y sin comprobar

Comprobado: las pantallas de comunicación de la Fase 9, por Carlos, en
producción. Batería completa en verde con todo integrado: 1371 aserciones en 27
suites.

Sin comprobar todavía: el recorrido CO-03, que cierra la Fase 5, y la ficha de
persona con el cambio de R-01 —parte F del guión—.
