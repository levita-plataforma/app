-- Fase 13 · Índices para los recorridos del directorio.
--
-- Medidos con 100.000 personas (50.000 por iglesia, dos iglesias) sobre los
-- planes reales que genera PostgREST para src/server/people/people-service.ts,
-- no sobre consultas inventadas: el directorio ordena por joined_at desc,
-- filtra archived_at is null y busca con cinco ilike separados.
--
--                                       antes      después
--   Página 1 del directorio            95,7 ms      0,2 ms
--   Página 41 (offset 1000)           111,4 ms      4,6 ms
--   Filtro por vínculo                 99,9 ms      0,2 ms
--   Búsqueda por nombre o contacto    179,3 ms      5,6 ms
--   Recuento exacto                   135,3 ms    133,7 ms   ← sin cambio, ver abajo
--
-- Coste: 12 MB de índices sobre 29 MB de tablas, y una diferencia de escritura
-- por debajo del ruido de medición (2.000 altas: 756 ms sin ellos, 735 ms con
-- ellos; la variación entre pasadas es mayor que la diferencia).
--
-- Esto NO acredita capacidad de escala: es una medición local, con datos
-- sintéticos y sin concurrencia. Acredita que estos planes de ejecución dejan
-- de recorrer las tablas enteras, que es otra cosa.

-- 1. Orden y filtros del listado -------------------------------------------
--
-- El listado siempre filtra por iglesia, descarta los archivados y ordena por
-- fecha de vinculación descendente. Sin este índice el planificador recorría
-- church_people entera y ordenaba 50.000 filas para devolver 25.
--
-- Parcial por archived_at is null porque es el caso de uso: la vista de
-- archivados ya tiene su propio índice desde la Fase 2.
create index if not exists church_people_church_joined_idx
  on church_people (church_id, joined_at desc)
  where archived_at is null;

-- 2. Búsqueda por texto ------------------------------------------------------
--
-- El buscador del directorio genera cinco ilike '%término%' independientes, uno
-- por columna. El índice people_search_name_trgm_idx de la Fase 2 no sirve para
-- eso: está construido sobre la concatenación de los tres nombres, así que solo
-- lo aprovecharía una consulta escrita contra esa misma expresión. Queda en pie
-- por si se implementa la búsqueda por similitud para la que se creó, pero hoy
-- no lo usa ninguna consulta del proyecto.
--
-- Un ilike con comodín por delante solo puede usar un índice de trigramas, y
-- tiene que haber uno por columna.
create index if not exists people_first_name_trgm_idx
  on people using gin (first_name gin_trgm_ops);

create index if not exists people_last_name_trgm_idx
  on people using gin (last_name gin_trgm_ops);

create index if not exists people_preferred_name_trgm_idx
  on people using gin (preferred_name gin_trgm_ops);

create index if not exists people_email_trgm_idx
  on people using gin (email gin_trgm_ops);

create index if not exists people_phone_trgm_idx
  on people using gin (phone gin_trgm_ops);

-- 3. Sin lista pendiente en los índices de búsqueda --------------------------
--
-- Un índice GIN acumula por defecto lo recién insertado en una lista sin
-- ordenar y la consolida más tarde, en un vacuum. Mientras esa lista está
-- llena, el planificador descarta el índice y vuelve al recorrido secuencial.
--
-- Eso no es teórico aquí: el proyecto importa padrones enteros. Medido tras
-- importar 10.000 personas, la búsqueda del directorio tardaba 104 ms y
-- recorría people entera; después de un vacuum, 2,7 ms por el índice. Entre
-- una cosa y la otra pasa un tiempo que nadie controla, el que tarde
-- autovacuum, así que la búsqueda iría bien o mal sin explicación visible.
--
-- Desactivar fastupdate obliga a escribir en el índice en el momento. Lo que
-- cuesta, medido:
--
--   Alta de una persona           1,89 ms → 2,13 ms   (+0,24 ms)
--   Importar 10.000 personas       2,8 s  →  18 s
--   Búsqueda tras esa importación  104 ms →  2,7 ms   y ya siempre
--
-- El alta individual es la operación frecuente y la penalización es
-- despreciable dentro de una petición HTTP. La importación masiva es un
-- episodio de puesta en marcha, asíncrono, donde 18 segundos no molestan a
-- nadie. Se prefiere eso a un buscador cuyo tiempo de respuesta dependa de
-- cuándo pasó autovacuum por última vez.
alter index people_first_name_trgm_idx set (fastupdate = off);
alter index people_last_name_trgm_idx set (fastupdate = off);
alter index people_preferred_name_trgm_idx set (fastupdate = off);
alter index people_email_trgm_idx set (fastupdate = off);
alter index people_phone_trgm_idx set (fastupdate = off);

-- 4. El recuento exacto se queda como está -----------------------------------
--
-- listPeople pide count:exact, que obliga a contar las 50.000 filas del tenant
-- con el join a people incluido: 134 ms que ningún índice arregla, porque el
-- trabajo es recorrer el resultado, no encontrarlo.
--
-- El join a people es redundante para contar —la clave foránea garantiza que
-- toda pertenencia tiene su persona— y quitarlo bajaría el recuento a ~12 ms.
-- No se hace aquí porque no es un cambio de esquema sino de la consulta, y
-- porque people tiene RLS propia: contar sin el join cambiaría el resultado si
-- alguna política llegara a ocultar personas de la propia iglesia. Queda
-- anotado en docs/FASE-13-OPERACION-ESCALA.md §5 para decidirlo con medida.
