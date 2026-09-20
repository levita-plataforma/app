-- Fase 11 (Diogo) · Tests de Alabanza: aislamiento tenant, CRUD de canciones
-- y repertorios, relación ordenada, tonalidad por repertorio, archivado,
-- archivos, capabilities, RLS forzada, superficie pública/anon.

begin;
select plan(45);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function test_set_anon() returns void as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end;
$$ language plpgsql;

create or replace function t_set(p_key text, p_value text) returns text as $$
  select set_config('t11a.' || p_key, coalesce(p_value, ''), true);
$$ language sql;

create or replace function t_id(p_key text) returns uuid as $$
  select nullif(current_setting('t11a.' || p_key, true), '')::uuid;
$$ language sql;

create or replace function t_err(p_sql text) returns text as $$
declare
  v_state text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate;
  return v_state;
end;
$$ language plpgsql;

-- ============================================================
-- Aprovisionamiento: dos iglesias con el módulo worship habilitado.
-- ============================================================
insert into auth.users (id, email) values
  ('b1100000-0000-0000-0000-000000000001', 'owner.a.f11@example.test'),
  ('b1100000-0000-0000-0000-000000000002', 'owner.b.f11@example.test');

select test_set_auth_uid('b1100000-0000-0000-0000-000000000001');
select t_set('church_a', out_church_id::text), t_set('owner_a', out_person_id::text)
from app.provision_church(
  'Iglesia A F11', 'church-a-f11', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'AF11', 'owner.a.f11@example.test', null, 'Sede A F11', null, null, null, null,
  array['people', 'worship'], null
);

select test_set_auth_uid('b1100000-0000-0000-0000-000000000002');
select t_set('church_b', out_church_id::text), t_set('owner_b', out_person_id::text)
from app.provision_church(
  'Iglesia B F11', 'church-b-f11', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'BF11', 'owner.b.f11@example.test', null, 'Sede B F11', null, null, null, null,
  array['people', 'worship'], null
);

reset role;

-- ============================================================
-- 1. Crear canción (Church A, owner)
-- ============================================================
select test_set_auth_uid('b1100000-0000-0000-0000-000000000001');

select t_set('song_a1', public.create_worship_song(
  t_id('church_a'), 'Gracia y verdad', null, 'Autor Sintético', 'es',
  'Letra sintética de prueba, sin contenido real protegido.',
  '[C]Letra [G]sintética [Am]de [F]prueba',
  'C', 'major', 'D', 'major', 120, '4/4', null
)::text);

select ok(t_id('song_a1') is not null, 'create_worship_song crea la canción y devuelve id');

select is(
  (select status::text from worship_songs where id = t_id('song_a1')),
  'active',
  'La canción creada empieza en estado active'
);

select is(
  (select title from worship_songs where id = t_id('song_a1')),
  'Gracia y verdad',
  'El título se guarda correctamente'
);

-- ============================================================
-- 2. Validación de tonalidad: nota y modalidad siempre juntas
-- ============================================================
-- La escritura directa está revocada para authenticated (por diseño, ver
-- RLS): se prueba el check constraint con un insert como propietario de la
-- fila (rol de tabla, no RPC), igual que otros tests del repo comprueban
-- checks de esquema sin pasar por la capa de autorización de aplicación.
reset role;
select is(
  t_err(format(
    $$ insert into worship_songs (church_id, title, original_key_root) values (%L::uuid, 'Sin modo', 'C') $$,
    t_id('church_a')
  )),
  '23514',
  'Insertar solo original_key_root sin original_key_mode viola el check'
);
select test_set_auth_uid('b1100000-0000-0000-0000-000000000001');

-- ============================================================
-- 3. BPM inválido
-- ============================================================
select is(
  t_err(format(
    $$ select public.create_worship_song(%L::uuid, 'BPM inválido', null, null, null, null, null, null, null, null, null, 0, null, null) $$,
    t_id('church_a')
  )),
  '23514',
  'BPM = 0 se rechaza por el check (bpm > 0)'
);

-- ============================================================
-- 4. Editar canción
-- ============================================================
-- update_worship_song reemplaza el estado completo (mismo criterio que
-- update_communication en Fase 9): un formulario de edición siempre envía
-- todos los campos, así que el test también los reenvía, incluida la
-- tonalidad ya fijada en la creación.
select lives_ok(
  format(
    $$ select public.update_worship_song(%L::uuid, %L::uuid, 'Gracia y verdad (editada)', null, 'Autor Sintético', 'es', null, null, 'C', 'major', 'D', 'major', 120, '4/4', null) $$,
    t_id('song_a1'), t_id('church_a')
  ),
  'update_worship_song permite editar una canción activa'
);

select is(
  (select title from worship_songs where id = t_id('song_a1')),
  'Gracia y verdad (editada)',
  'El título editado se refleja en la fila'
);

-- ============================================================
-- 5. Crear repertorio y añadir la canción
-- ============================================================
select t_set('repertoire_a1', public.create_worship_repertoire(t_id('church_a'), 'Domingo mañana', 'Repertorio sintético de prueba')::text);

select ok(t_id('repertoire_a1') is not null, 'create_worship_repertoire crea el repertorio');

select t_set('rs_a1', public.add_worship_repertoire_song(t_id('repertoire_a1'), t_id('church_a'), t_id('song_a1'), 'D', 'major')::text);

select is(
  (select position from worship_repertoire_songs where id = t_id('rs_a1')),
  1,
  'La primera canción añadida queda en position 1'
);

select is(
  (select selected_key_root::text || ' ' || selected_key_mode::text from worship_repertoire_songs where id = t_id('rs_a1')),
  'D major',
  'La tonalidad elegida en el repertorio se guarda (selected_key)'
);

select is(
  (select default_key_root::text from worship_songs where id = t_id('song_a1')),
  'D',
  'default_key_root de la canción NO cambia por elegir otra tonalidad en el repertorio (sigue siendo la original de la canción)'
);

-- ============================================================
-- 6. Segunda canción y orden
-- ============================================================
select t_set('song_a2', public.create_worship_song(t_id('church_a'), 'Segunda canción sintética')::text);
select t_set('rs_a2', public.add_worship_repertoire_song(t_id('repertoire_a1'), t_id('church_a'), t_id('song_a2'))::text);

select is(
  (select position from worship_repertoire_songs where id = t_id('rs_a2')),
  2,
  'La segunda canción añadida queda en position 2'
);

-- Reordenar: song_a2 primero, song_a1 segundo.
select lives_ok(
  format(
    $$ select public.reorder_worship_repertoire_songs(%L::uuid, %L::uuid, array[%L, %L]::uuid[]) $$,
    t_id('repertoire_a1'), t_id('church_a'), t_id('rs_a2'), t_id('rs_a1')
  ),
  'reorder_worship_repertoire_songs acepta el conjunto completo actual'
);

select is(
  (select position from worship_repertoire_songs where id = t_id('rs_a2')),
  1,
  'Tras reordenar, rs_a2 queda en position 1'
);

select is(
  (select position from worship_repertoire_songs where id = t_id('rs_a1')),
  2,
  'Tras reordenar, rs_a1 queda en position 2'
);

-- Reordenar con un conjunto que no coincide (falta un id) debe fallar.
select is(
  t_err(format(
    $$ select public.reorder_worship_repertoire_songs(%L::uuid, %L::uuid, array[%L]::uuid[]) $$,
    t_id('repertoire_a1'), t_id('church_a'), t_id('rs_a2')
  )),
  '55P03',
  'Reordenar con un conjunto incompleto de ids se rechaza (55P03)'
);

-- ============================================================
-- 7. Quitar canción del repertorio y compactar posiciones
-- ============================================================
select lives_ok(
  format($$ select public.remove_worship_repertoire_song(%L::uuid, %L::uuid) $$, t_id('rs_a2'), t_id('church_a')),
  'remove_worship_repertoire_song quita la fila'
);

select is(
  (select position from worship_repertoire_songs where id = t_id('rs_a1')),
  1,
  'Tras quitar rs_a2, rs_a1 se compacta a position 1'
);

select is(
  (select count(*)::integer from worship_repertoire_songs where repertoire_id = t_id('repertoire_a1')),
  1,
  'El repertorio queda con una sola canción tras la eliminación'
);

-- ============================================================
-- 8. Archivar canción: no puede añadirse a un repertorio nuevo
-- ============================================================
select lives_ok(
  format($$ select public.archive_worship_song(%L::uuid, %L::uuid) $$, t_id('song_a2'), t_id('church_a')),
  'archive_worship_song archiva la canción'
);

select is(
  (select status::text from worship_songs where id = t_id('song_a2')),
  'archived',
  'La canción queda en estado archived'
);

select is(
  t_err(format(
    $$ select public.add_worship_repertoire_song(%L::uuid, %L::uuid, %L::uuid) $$,
    t_id('repertoire_a1'), t_id('church_a'), t_id('song_a2')
  )),
  '22023',
  'No se puede añadir una canción archivada a un repertorio'
);

select is(
  t_err(format(
    $$ select public.update_worship_song(%L::uuid, %L::uuid, 'No debería poder editarse') $$,
    t_id('song_a2'), t_id('church_a')
  )),
  '22023',
  'No se puede editar una canción archivada'
);

-- El repertorio que YA contenía la canción archivada (song_a1 sigue activa;
-- comprobamos que archivar una canción no rompe el repertorio existente que
-- la sigue referenciando con otra canción activa).
select is(
  (select count(*)::integer from worship_repertoire_songs where repertoire_id = t_id('repertoire_a1') and song_id = t_id('song_a1')),
  1,
  'El repertorio sigue mostrando la canción activa que ya tenía'
);

-- ============================================================
-- 9. Archivar repertorio: no editable
-- ============================================================
select lives_ok(
  format($$ select public.archive_worship_repertoire(%L::uuid, %L::uuid) $$, t_id('repertoire_a1'), t_id('church_a')),
  'archive_worship_repertoire archiva el repertorio'
);

select is(
  t_err(format(
    $$ select public.update_worship_repertoire(%L::uuid, %L::uuid, 'No debería poder editarse') $$,
    t_id('repertoire_a1'), t_id('church_a')
  )),
  '22023',
  'No se puede editar un repertorio archivado'
);

-- ============================================================
-- 10. Aislamiento cross-tenant
-- ============================================================
select test_set_auth_uid('b1100000-0000-0000-0000-000000000002');

select is(
  (select count(*)::integer from worship_songs where church_id = t_id('church_a')),
  0,
  'Church B no ve (SELECT) canciones de Church A'
);

select is(
  t_err(format(
    $$ select public.update_worship_song(%L::uuid, %L::uuid, 'Intento cross-tenant') $$,
    t_id('song_a1'), t_id('church_b')
  )),
  'P0002',
  'Church B no puede editar una canción de Church A (no la encuentra bajo su propio church_id)'
);

select is(
  t_err(format(
    $$ select public.archive_worship_song(%L::uuid, %L::uuid) $$,
    t_id('song_a1'), t_id('church_b')
  )),
  'P0002',
  'Church B no puede archivar una canción de Church A'
);

-- Repertorio de B no puede aceptar canción de A (FK tenant-safe): creamos un
-- repertorio real en B y probamos con la canción de A.
select t_set('repertoire_b1', public.create_worship_repertoire(t_id('church_b'), 'Repertorio de B')::text);

select is(
  t_err(format(
    $$ select public.add_worship_repertoire_song(%L::uuid, %L::uuid, %L::uuid) $$,
    t_id('repertoire_b1'), t_id('church_b'), t_id('song_a1')
  )),
  'P0002',
  'Church B no puede añadir una canción de Church A a su propio repertorio (no la encuentra en su tenant)'
);

-- Repertorio propio de B sí acepta una canción propia de B.
select test_set_auth_uid('b1100000-0000-0000-0000-000000000002');
select t_set('song_b1', public.create_worship_song(t_id('church_b'), 'Canción de B')::text);

select lives_ok(
  format(
    $$ select public.add_worship_repertoire_song(%L::uuid, %L::uuid, %L::uuid) $$,
    t_id('repertoire_b1'), t_id('church_b'), t_id('song_b1')
  ),
  'Church B sí puede añadir su propia canción a su propio repertorio'
);

-- ============================================================
-- 11. RLS forzada + superficie anon
-- ============================================================
select ok(
  (select relforcerowsecurity from pg_class where relname = 'worship_songs'),
  'worship_songs tiene FORCE ROW LEVEL SECURITY'
);
select ok(
  (select relforcerowsecurity from pg_class where relname = 'worship_repertoires'),
  'worship_repertoires tiene FORCE ROW LEVEL SECURITY'
);
select ok(
  (select relforcerowsecurity from pg_class where relname = 'worship_repertoire_songs'),
  'worship_repertoire_songs tiene FORCE ROW LEVEL SECURITY'
);

select test_set_anon();

select is(
  t_err(format($$ select public.create_worship_song(%L::uuid, 'Intento anon') $$, t_id('church_a'))),
  '42501',
  'anon no puede ejecutar create_worship_song (revoke explícito)'
);

select is(
  t_err($$ select * from worship_songs limit 1 $$),
  '42501',
  'anon no tiene SELECT directo sobre worship_songs'
);

reset role;

-- ============================================================
-- 12. Capability ausente: persona sin worship.song.manage
-- ============================================================
insert into auth.users (id, email) values ('b1100000-0000-0000-0000-000000000003', 'miembro.a.f11@example.test');

-- El montaje va sin rol de usuario: crear una persona con el user_id de otra
-- cuenta dejó de estar permitido en 20261004000410. Antes se podía porque la
-- política de alta no comprobaba nada, y esta suite lo usaba como atajo; no era
-- un caso de uso del producto, era preparar datos. Se prepara como tal.
reset role;
select t_set('person_member', gen_random_uuid()::text);
insert into people (id, first_name, last_name, user_id) values (t_id('person_member'), 'Miembro', 'Sin permiso', 'b1100000-0000-0000-0000-000000000003');
insert into church_people (church_id, person_id, relationship) values (t_id('church_a'), t_id('person_member'), 'member');

select test_set_auth_uid('b1100000-0000-0000-0000-000000000003');

select is(
  t_err(format($$ select public.create_worship_song(%L::uuid, 'Sin capability') $$, t_id('church_a'))),
  '42501',
  'Un miembro sin worship.song.manage no puede crear canciones'
);

-- ============================================================
-- 13. Auditoría
-- ============================================================
select test_set_auth_uid('b1100000-0000-0000-0000-000000000001');
reset role;

select ok(
  exists(
    select 1 from audit_logs
    where church_id = t_id('church_a') and action = 'worship.song.created' and entity_id = t_id('song_a1')
  ),
  'worship.song.created queda auditado'
);

select ok(
  exists(
    select 1 from audit_logs
    where church_id = t_id('church_a') and action = 'worship.repertoire.created' and entity_id = t_id('repertoire_a1')
  ),
  'worship.repertoire.created queda auditado'
);

select ok(
  exists(
    select 1 from audit_logs
    where church_id = t_id('church_a') and action = 'worship.song.archived' and entity_id = t_id('song_a2')
  ),
  'worship.song.archived queda auditado'
);

-- ============================================================
-- 14. Archivos (files, entity_type='song')
-- ============================================================
select test_set_auth_uid('b1100000-0000-0000-0000-000000000001');

select t_set('file_a1', public.attach_worship_song_file(
  t_id('song_a1'), t_id('church_a'), 'worship-files', 'songs/gracia-y-verdad.pdf', 'application/pdf', 12345, 'abc123'
)::text);

select ok(t_id('file_a1') is not null, 'attach_worship_song_file adjunta un archivo y devuelve id');

select is(
  (select entity_type from files where id = t_id('file_a1')),
  'song',
  'El archivo queda asociado con entity_type = song'
);

select is(
  (select entity_id from files where id = t_id('file_a1')),
  t_id('song_a1'),
  'El archivo queda asociado a la canción correcta (entity_id)'
);

select lives_ok(
  format($$ select public.detach_worship_song_file(%L::uuid, %L::uuid) $$, t_id('file_a1'), t_id('church_a')),
  'detach_worship_song_file marca el archivo como eliminado'
);

select is(
  (select status from files where id = t_id('file_a1')),
  'deleted',
  'El archivo queda con status = deleted tras detach'
);

reset role;

select * from finish();
rollback;
