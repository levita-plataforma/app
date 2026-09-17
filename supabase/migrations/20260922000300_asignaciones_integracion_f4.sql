-- Fase 5 (Carlos) · Integración de asignaciones con los cambios de F4.
--
-- Sin reescribir funciones de F4: triggers sobre sus tablas que dejan las
-- asignaciones afectadas en un estado verificable (decisión de Carlos):
-- * Actividad cancelada -> asignaciones vigentes a cancelled (activity_cancelled).
-- * Actividad archivada desde draft/planned/published -> cancelled
--   (activity_archived). Archivar una completada conserva su historia.
-- * Cambio de starts_at/ends_at -> accepted vuelve a pending para reconfirmar;
--   todas las vigentes suben de versión (invalida respuestas concurrentes).
-- * Despublicar conserva las asignaciones.
-- * Ocurrencia de serie que F4 eliminaría teniendo asignaciones -> se cancela
--   en lugar de borrarse (occurrence_removed), para conservar la historia.
-- * Eliminar un puesto (o su área) con asignaciones vigentes -> se bloquea:
--   hay que retirar antes a las personas. También bloquea "aplicar estructura
--   a la serie" sobre ocurrencias con personas.
--
-- Eventos de aviso (DI-02, Diogo): los puntos de emisión quedan marcados con
-- "EVENTO F5"; no se emiten hasta que exista el punto de escritura acordado.

-- Guard de inserción/actualización de asignaciones --------------------------
create or replace function app.activity_assignments_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_position activity_positions%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into v_position from activity_positions ap
    where ap.id = new.activity_position_id and ap.church_id = new.church_id;
    if not found then
      raise exception 'El puesto no existe en esta iglesia.' using errcode = '22023';
    end if;
    -- Varias FK por tenant no garantizan que el puesto sea de esa actividad.
    if v_position.activity_id <> new.activity_id then
      raise exception 'El puesto no pertenece a esa actividad.' using errcode = '22023';
    end if;
    new.position_name := v_position.name;
    new.service_area_id := v_position.service_area_id;
    return new;
  end if;

  -- Identidad inmutable (salvo el puesto anulado por FK al borrarlo).
  if new.church_id <> old.church_id or new.activity_id <> old.activity_id or new.person_id <> old.person_id
     or new.substitutes_assignment_id is distinct from old.substitutes_assignment_id
     or (new.activity_position_id is distinct from old.activity_position_id and new.activity_position_id is not null) then
    raise exception 'La identidad de una asignación no se puede cambiar.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger activity_assignments_guard
  before insert or update on activity_assignments
  for each row execute function app.activity_assignments_guard();

-- Cambios de la actividad ----------------------------------------------------
create or replace function app.activities_assignments_sync()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cause text;
  v_count integer;
begin
  v_cause := case
    when new.status = 'cancelled' and old.status <> 'cancelled' then
      case when coalesce(current_setting('app.occurrence_removing', true), '') = new.id::text
        then 'occurrence_removed' else 'activity_cancelled' end
    when new.status = 'archived' and old.status in ('draft', 'planned', 'published') then 'activity_archived'
  end;

  if v_cause is not null then
    update activity_substitution_requests
    set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
    where activity_id = new.id and status = 'open';

    update activity_assignments
    set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
        cancel_cause = v_cause, version = version + 1
    where activity_id = new.id and status in ('proposed', 'pending', 'accepted');
    get diagnostics v_count = row_count;

    if v_count > 0 then
      -- EVENTO F5 (DI-02): assignment.cancelled por cada asignación afectada.
      perform app.write_audit_log(
        new.church_id, 'assignment.cancelled_by_activity', 'activities', new.id,
        jsonb_build_object('cause', v_cause, 'assignments', v_count)
      );
    end if;
    return new;
  end if;

  if (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at)
     and new.status in ('draft', 'planned', 'published') then
    update activity_assignments
    set status = case when status = 'accepted' then 'pending'::activity_assignment_status else status end,
        reconfirmation_requested_at = case when status = 'accepted' then now() else reconfirmation_requested_at end,
        version = version + 1
    where activity_id = new.id and status in ('proposed', 'pending', 'accepted');
    get diagnostics v_count = row_count;

    if v_count > 0 then
      -- EVENTO F5 (DI-02): activity.rescheduled a las personas con asignación comunicada.
      perform app.write_audit_log(
        new.church_id, 'assignment.reconfirmation_requested', 'activities', new.id,
        jsonb_build_object('assignments', v_count)
      );
    end if;
  end if;

  return new;
end;
$$;

create trigger activities_assignments_sync
  after update of status, starts_at, ends_at on activities
  for each row execute function app.activities_assignments_sync();

-- Ocurrencia eliminada con asignaciones -> cancelada ----------------------------
create or replace function app.activities_preserve_assigned()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Borrado en cascada de la iglesia: no interferir.
  if not exists (select 1 from churches where id = old.church_id) then
    return old;
  end if;

  if exists (select 1 from activity_assignments where activity_id = old.id) then
    if old.status not in ('draft', 'planned', 'published') then
      raise exception 'La actividad tiene historial de asignaciones y no se puede eliminar.' using errcode = '22023';
    end if;
    perform set_config('app.occurrence_removing', old.id::text, true);
    update activities
    set status = 'cancelled', cancellation_reason = coalesce(cancellation_reason, 'Serie reprogramada')
    where id = old.id;
    perform set_config('app.occurrence_removing', '', true);
    -- Se conserva la fila (y su historia) en lugar de borrarla.
    return null;
  end if;

  return old;
end;
$$;

create trigger activities_preserve_assigned
  before delete on activities
  for each row execute function app.activities_preserve_assigned();

-- Puesto con personas asignadas -------------------------------------------------
create or replace function app.activity_positions_block_assigned()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (select 1 from activities a where a.id = old.activity_id)
     and exists (
       select 1 from activity_assignments aa
       where aa.activity_position_id = old.id and aa.status in ('proposed', 'pending', 'accepted')
     ) then
    raise exception 'El puesto "%" tiene personas asignadas: retíralas antes de eliminarlo o de reemplazar la estructura.', old.name
      using errcode = '22023';
  end if;
  return old;
end;
$$;

create trigger activity_positions_block_assigned
  before delete on activity_positions
  for each row execute function app.activity_positions_block_assigned();
