-- Fase 6 · Lectura pública mínima de form_fields para renderizar el
-- formulario de inscripción de un evento público sin sesión.
--
-- La política RLS `form_fields_select` (20260924000500_rls_eventos.sql) solo
-- concede SELECT a `authenticated`: un visitante `anon` en la página pública
-- de inscripción no puede leer los campos del formulario asociado al evento.
-- En vez de ampliar esa política a `anon` (lo que expondría form_fields de
-- CUALQUIER formulario si se conociera su form_id, incluidos formularios no
-- ligados a ningún evento público), se añade una función `security definer`
-- de superficie mínima: solo devuelve columnas no administrativas
-- (key/label/type/required/help_text/options/sort_order, nunca
-- `classification` ni IDs internos más allá de lo necesario) y solo para el
-- formulario de un evento que ya pasa `app.can_read_event_public`.

create or replace function public.public_form_fields(p_event_id uuid)
returns table (
  field_key text,
  label text,
  type form_field_type,
  required boolean,
  help_text text,
  options jsonb,
  sort_order smallint
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select ff.key, ff.label, ff.type, ff.required, ff.help_text, ff.options, ff.sort_order
  from form_fields ff
  join events e on e.form_id = ff.form_id and e.church_id = ff.church_id
  where e.id = p_event_id
    and app.can_read_event_public(p_event_id)
    and ff.archived_at is null
  order by ff.sort_order;
$$;

revoke all on function public.public_form_fields(uuid) from public;
grant execute on function public.public_form_fields(uuid) to anon, authenticated;
