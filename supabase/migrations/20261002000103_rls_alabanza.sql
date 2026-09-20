-- Fase 11 (Diogo) · RLS de Alabanza. Toda escritura pasa por RPC security
-- definer (ver 20261002000104): las políticas de aquí solo cubren lectura
-- directa desde el cliente autenticado. Sin superficie pública/anon.

create policy worship_songs_select on worship_songs
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'worship.song.read'))
  );

create policy worship_repertoires_select on worship_repertoires
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'worship.repertoire.read'))
  );

create policy worship_repertoire_songs_select on worship_repertoire_songs
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'worship.repertoire.read'))
  );

-- Privilegios por defecto: toda tabla nueva en public recibe
-- INSERT/UPDATE/DELETE/SELECT por defecto para anon y authenticated (bug
-- real ya confirmado y corregido varias veces en este repo, ver
-- 20260930000300_hotfix_revokes_wrappers_publicos.sql). Se revoca
-- explícitamente, no basta con las políticas de arriba.
revoke insert, update, delete, truncate, select on
  worship_songs, worship_repertoires, worship_repertoire_songs
from anon;

revoke insert, update, delete, truncate on
  worship_songs, worship_repertoires, worship_repertoire_songs
from authenticated;
