-- Fase 8 (Diogo) · Wrappers públicos faltantes para las funciones de
-- elegibilidad/ratio Kids. La migración 20260928000600 creó
-- `app.kids_staff_eligibility` y `app.kids_room_ratio_status` con
-- `grant execute to authenticated`, pero sin su wrapper `public.*`: sin él,
-- PostgREST no las expone como RPC y `supabase.rpc(...)` falla en runtime.
-- Mismo patrón que el resto de funciones `app.*` del proyecto (ver
-- `public.evaluate_person_eligibility` de Fase 3 como referencia).

create or replace function public.kids_staff_eligibility(
  p_church_id uuid,
  p_person_id uuid,
  p_campus_id uuid default null
)
returns table (eligible boolean, reasons text[])
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.kids_staff_eligibility(p_church_id, p_person_id, p_campus_id);
$$;

revoke all on function public.kids_staff_eligibility(uuid, uuid, uuid) from public;
grant execute on function public.kids_staff_eligibility(uuid, uuid, uuid) to authenticated;

create or replace function public.kids_room_ratio_status(p_session_id uuid)
returns table (
  state kids_ratio_state,
  children_checked_in integer,
  staff_checked_in integer,
  min_adults_required integer,
  ratio_children_per_adult integer,
  max_children_for_current_staff integer
)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.kids_room_ratio_status(p_session_id);
$$;

revoke all on function public.kids_room_ratio_status(uuid) from public;
grant execute on function public.kids_room_ratio_status(uuid) to authenticated;
