-- Fase 4 · Nuevo estado `planned` para activities.
--
-- Va en una migración propia: PostgreSQL no permite usar un valor de enum
-- añadido con ALTER TYPE ... ADD VALUE dentro de la misma transacción en la
-- que se añade. Las migraciones siguientes (que ya lo usan en constraints,
-- funciones y políticas) se ejecutan en transacciones posteriores.
--
-- Es un cambio aditivo: ninguna fila existente cambia de estado.

alter type activity_status add value if not exists 'planned' before 'published';
