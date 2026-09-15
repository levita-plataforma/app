# Despliegue

> Referencia heredada del producto de turnos localizado en `Documents/Levitaapp`. El código de ese producto no está en este checkout de la landing. Las menciones a implementación, comandos y resultados deben contrastarse allí; no son verificaciones realizadas en esta revisión. Ver [índice](README.md).

| Pieza | Dónde | Nota |
|---|---|---|
| Panel | Vercel → `app.tuiglesia.es` | Región `fra1` |
| PWA | Vercel → `mi.tuiglesia.es` | Mismo repo, distinto *root directory* |
| BD y Auth | Supabase, región UE | Frankfurt o Irlanda. Requisito RGPD |
| Worker de avisos | Supabase Edge Function | Disparada por `pg_cron` cada 2 min |
| Webhook de Stripe | Route handler en Vercel | Runtime Node, firma verificada |
| Ficheros | Supabase Storage | Buckets con política por `church_id` |

Para desplegar la landing actual, seguir el README raíz. Los dominios de esta tabla son ejemplos. El alta y pago de iglesias ahora forman parte del lanzamiento; concretar el despliegue tras resolver la integración con Calserv. Los precios y límites de proveedores que siguen son históricos y necesitan verificación antes de contratar.

## Tres ajustes de la arquitectura heredada

**Región de funciones en Frankfurt.** Por defecto Vercel despliega en
Washington. Con la base de datos en Europa, cada consulta cruza el Atlántico dos
veces: 150–200 ms de latencia regalada en cada render.

**El worker no va en Vercel Cron.** `pg_cron` dentro de Postgres: más fiable,
más barato y sin *cold start*.

**Cabeceras del service worker.** `Service-Worker-Allowed: /` y sin caché. Ya
está en `apps/pwa/next.config.mjs`. Si se cachea, una corrección tarda días en
llegar a los móviles que ya tienen la app instalada.

## Variables de entorno

Ver `.env.example`. La única que importa de verdad:
`SUPABASE_SERVICE_ROLE_KEY` **se salta RLS por completo**. Nunca en un fichero
`NEXT_PUBLIC_`, nunca en el navegador, nunca en una ruta que reciba un
`churchId` del cliente.

## Después del primer despliegue

1. Generar las claves VAPID: `npx web-push generate-vapid-keys`.
2. Guardar `worker_key` en Supabase Vault.
3. Ejecutar el `cron.schedule` comentado en
   `supabase/migrations/20260101000700_avisos_triggers.sql`. Una sola vez.
4. Comprobar que el aviso llega a un iPhone real con la app instalada en
   pantalla de inicio. **Antes de construir nada encima.**

## Estimaciones históricas de costes — no usar como presupuesto vigente

Desarrollo: 0 €. Supabase gratuito y Vercel Hobby cubren toda la construcción.
Primeras iglesias: ~45 €/mes (Supabase Pro 25 $ + Vercel Pro 20 $).
50 iglesias: ~60 €/mes, más correo transaccional.

El salto a Pro lo fuerzan las copias de seguridad diarias y el dominio propio,
no el volumen. El coste que sí hay que vigilar es WhatsApp si se añade: las
plantillas de la API de Meta se pagan por conversación.
