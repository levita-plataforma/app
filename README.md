# LEVITA

Landing pública de «Muy pronto», construida con Next.js App Router, TypeScript y CSS. La maqueta de producto es únicamente ilustrativa. No hay autenticación, backend, formularios, cookies ni servicios externos en la página.

## Desarrollo

Node.js 22 o posterior y npm.

```sh
npm ci
npm run dev
```

La página está en http://localhost:3000.

```sh
npm run lint
npm run typecheck
npm run build
npm run start
```

## Estructura

- `src/app`: página, layout, estilos, metadata, favicon, robots y sitemap.
- `src/components`: Logo, ComingSoonHero, ProductPreview e iconos SVG.
- `imagenes/levita.png`: referencia de diseño; no se sirve como parte de la landing.

## Vercel

Importar el repositorio con el preset Next.js y la raíz del proyecto. Vercel detecta npm mediante `package-lock.json`; no hacen falta variables de entorno ni pasos personalizados. La ruta `/` se prerenderiza estáticamente.

Metadata, canonical y sitemap están preparados para `https://levitaapp.com`. Añadir una imagen Open Graph definitiva a la metadata cuando esté disponible. Las fuentes se optimizan y alojan mediante `next/font`, sin solicitudes a Google desde el navegador.

ESLint 9 se mantiene por compatibilidad con los plugins de `eslint-config-next`. npm avisa de su fin de soporte; actualizar cuando los plugins oficiales admitan ESLint 10. Este aviso afecta a herramientas de desarrollo, no al build ni a la página pública.

## Funcionamiento y colaboración

Consultar [FUNCIONAMIENTO.md](FUNCIONAMIENTO.md) para el estado observado de la
aplicación, el entorno local y las normas de ramas y revisión. La descripción
de landing de este README no cubre toda la aplicación autenticada actual.
Todo cambio se prepara en una rama y requiere validación expresa del propietario
antes de integrarse en `main`.
