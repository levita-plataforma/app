-- Fase 13 · Invariantes de aislamiento.
--
-- Esta suite no prueba una funcionalidad: comprueba que el esquema sigue
-- cumpliendo las reglas que el proyecto dice seguir. Es lo que convierte una
-- auditoría en algo que no caduca.
--
-- Cada aserción viene de una comprobación que se hizo a mano durante la
-- auditoría de la Fase 13. Si alguien añade una tabla sin RLS, una función
-- definer sin search_path o una política permisiva, esto falla en CI en vez de
-- esperar a la siguiente revisión.
--
-- Las listas de excepciones son explícitas y cortas a propósito: cada nombre
-- que aparece en ellas es una decisión que alguien tuvo que justificar.

begin;
select plan(11);

-- 1. Toda tabla con church_id tiene RLS habilitada Y forzada ------------------
-- Sin FORCE, el propietario de la tabla se salta las políticas, y en Supabase
-- eso incluye a las funciones definer que no deberían saltárselas.

select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), array[]::text[])
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where c.relkind = 'r'
     and exists (select 1 from information_schema.columns col
                 where col.table_schema = 'public' and col.table_name = c.relname
                   and col.column_name = 'church_id')
     and (not c.relrowsecurity or not c.relforcerowsecurity)),
  array[]::text[],
  'Toda tabla con church_id tiene RLS habilitada y forzada'
);

-- 2. Ninguna función security definer sin search_path -------------------------
-- Una definer sin search_path fijo puede acabar ejecutando código de un esquema
-- que controle quien la llama. Es la vulnerabilidad clásica de este patrón.

select is(
  (select coalesce(array_agg((n.nspname || '.' || p.proname)::text order by p.proname), array[]::text[])
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'public')
     and p.prosecdef
     and (p.proconfig is null
          or not exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%'))),
  array[]::text[],
  'Ninguna función security definer se queda sin search_path fijado'
);

-- 3. La superficie anónima es exactamente la declarada ------------------------

select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), array[]::text[])
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'execute')
     and exists (select 1 from pg_proc a
                 where a.pronamespace = 'app'::regnamespace and a.proname = p.proname)
     and p.proname <> all (array[
       'register_for_event',            -- alta pública a un evento
       'cancel_registration_by_token',  -- cancelación por enlace del correo
       'event_registration_status',     -- plazas del evento público
       'submit_marketing_lead',         -- formulario de contacto de la web
       'unsubscribe_by_token'           -- baja por enlace del correo
     ])),
  array[]::text[],
  'Anon no alcanza ninguna función fuera de la superficie pública declarada'
);

-- 4. Ninguna política de escritura con «with check (true)» --------------------
-- Es lo que tenía people_insert y lo que permitía crear filas con la identidad
-- de otra cuenta. Una política que no comprueba nada no es una política.

select is(
  (select coalesce(array_agg((p.tablename || '.' || p.policyname)::text order by p.tablename), array[]::text[])
   from pg_policies p
   where p.schemaname = 'public'
     and p.cmd in ('ALL', 'INSERT', 'UPDATE')
     and btrim(coalesce(p.with_check, '')) = 'true'),
  array[]::text[],
  'Ninguna política de escritura acepta cualquier fila sin comprobar nada'
);

-- 5. Toda tabla con RLS tiene al menos una política, o nadie puede leerla -----
-- Una tabla con RLS y sin políticas deniega todo, que es el lado seguro. Lo que
-- no debe pasar es que además tenga grants que hagan creer que se puede leer.

select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), array[]::text[])
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where c.relkind = 'r'
     and c.relrowsecurity
     and not exists (select 1 from pg_policies p
                     where p.schemaname = 'public' and p.tablename = c.relname)
     and exists (select 1 from information_schema.role_table_grants g
                 where g.table_schema = 'public' and g.table_name = c.relname
                   and g.grantee = 'anon' and g.privilege_type = 'SELECT')),
  array['webhook_events_inbound'],
  'Solo webhook_events_inbound concede lectura a anon sin tener políticas, y RLS le devuelve cero filas'
);

-- 6. people no admite filas con identidad ajena -------------------------------

select is(
  (select btrim(coalesce(with_check, '')) from pg_policies
   where schemaname = 'public' and tablename = 'people' and policyname = 'people_insert'),
  '((user_id IS NULL) OR (user_id = auth.uid()))',
  'El alta de persona solo admite una fila sin cuenta o con la de quien la crea'
);

-- 7. Las claves foráneas entre tablas tenant llevan church_id ------------------
-- ADR 0014: sin la composición, nada impide relacionar una fila de una iglesia
-- con la de otra. La excepción es people, que es identidad común sin church_id.

select is(
  (select coalesce(array_agg((hija || '.' || conname)::text order by hija, conname), array[]::text[])
   from (
     select cl.relname as hija, cf.relname as padre, con.conname,
            array(select attname from pg_attribute
                  where attrelid = con.conrelid and attnum = any(con.conkey)) as cols
     from pg_constraint con
     join pg_class cl on cl.oid = con.conrelid
     join pg_class cf on cf.oid = con.confrelid
     join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
     where con.contype = 'f'
   ) fk
   where exists (select 1 from information_schema.columns c
                 where c.table_schema = 'public' and c.table_name = fk.hija and c.column_name = 'church_id')
     and exists (select 1 from information_schema.columns c
                 where c.table_schema = 'public' and c.table_name = fk.padre and c.column_name = 'church_id')
     and not ('church_id' = any (fk.cols))
     and fk.padre <> 'churches'),
  array[]::text[],
  'Ninguna clave foránea entre tablas de un mismo tenant se olvida de church_id'
);

-- 8. Las tablas de eventos internos no son legibles por nadie ------------------
-- notification_events, notification_deliveries y communication_recipients
-- contienen destinatarios y contenido de avisos. Se leen solo desde funciones
-- definer que comprueban a quién pertenece cada fila.

select is(
  (select coalesce(array_agg(t::text order by t), array[]::text[])
   from unnest(array['notification_events', 'notification_deliveries', 'communication_recipients']) t
   where exists (
     select 1 from information_schema.role_table_grants g
     where g.table_schema = 'public' and g.table_name = t
       and g.grantee in ('anon', 'authenticated') and g.privilege_type = 'SELECT'
   )),
  array[]::text[],
  'Las tablas de avisos y destinatarios no conceden lectura directa a nadie'
);

-- 9. Ninguna tabla del proyecto concede escritura a anon ------------------------
--
-- Se excluyen las tablas que instala pgTAP (tap_funky, __tcache__…): existen
-- solo en el arnés de pruebas, se crean después de las migraciones y heredan
-- los privilegios por defecto que esta comprobación vigila. No son del
-- proyecto y en producción no existen.

select is(
  (select coalesce(array_agg(distinct g.table_name::text), array[]::text[])
   from information_schema.role_table_grants g
   where g.table_schema = 'public'
     and g.grantee = 'anon'
     and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
     -- Solo tablas base: pg_all_foreign_keys es una vista de pgTAP.
     and exists (select 1 from pg_class c
                 join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
                 where c.relname = g.table_name and c.relkind = 'r')
     and g.table_name not like 'tap%'
     and g.table_name not like '\_\_%'),
  array[]::text[],
  'Una sesión anónima no puede escribir en ninguna tabla del proyecto'
);

-- 10. Ningún índice duplica a otro idéntico ------------------------------------
--
-- Una restricción unique crea su propio índice. Declarar además uno normal
-- sobre las mismas columnas deja dos estructuras iguales que se mantienen en
-- cada escritura y de las que el planificador solo puede usar una.
--
-- Había ocho, repartidos por siete fases sin relación entre ellas (retirados en
-- 20261004000414). Que ocurriera tantas veces es lo que justifica vigilarlo:
-- quien escribe el índice piensa en la consulta y quien escribe la restricción
-- piensa en la integridad, y nadie ve que la segunda ya trae el primero.
--
-- Se agrupa por tabla, columnas, expresión, predicado y familia de operadores:
-- dos índices caen en el mismo grupo solo si son intercambiables de verdad. Un
-- índice parcial y uno completo sobre la misma columna no lo son, y no se
-- señalan.

select is(
  (select coalesce(array_agg(d.descripcion order by d.descripcion), array[]::text[])
   from (
     select t.relname || ': ' || string_agg(c.relname, ' + ' order by c.relname) as descripcion
     from pg_index i
     join pg_class c on c.oid = i.indexrelid
     join pg_class t on t.oid = i.indrelid
     join pg_namespace n on n.oid = t.relnamespace and n.nspname = 'public'
     where t.relname not like 'tap%' and t.relname not like '\_\_%'
     group by t.relname,
              i.indrelid,
              i.indkey::text,
              pg_get_expr(i.indexprs, i.indrelid),
              pg_get_expr(i.indpred, i.indrelid),
              i.indclass::text
     having count(*) > 1
   ) d),
  array[]::text[],
  'Ningún índice duplica exactamente a otro'
);

-- 11. La cola de borrado de ficheros sobrevive al borrado de la iglesia --------
--
-- storage_deletion_queue guarda qué objetos del almacenamiento hay que eliminar
-- después de borrar una iglesia. Si alguien le añadiera una clave foránea a
-- churches, la cascada se la llevaría en el mismo instante en que hace falta: el
-- borrado parecería correcto y los ficheros —fotos de menores, documentos
-- pastorales— seguirían vivos en el bucket.
--
-- Es un fallo que no daría ningún síntoma, así que se vigila aquí.

select is(
  (select coalesce(array_agg(con.conname::text order by con.conname), array[]::text[])
   from pg_constraint con
   join pg_class cl on cl.oid = con.conrelid
   join pg_class cf on cf.oid = con.confrelid
   where con.contype = 'f'
     and cl.relname = 'storage_deletion_queue'
     and cf.relname = 'churches'),
  array[]::text[],
  'La cola de borrado de ficheros no depende de churches: debe sobrevivir a la cascada'
);

select * from finish();
rollback;
