-- Fase 10 · Reconciliación con Activity.
-- Ver docs/CONTRATO-FASE-10.md §44 y §45, decisiones P-16 y P-17.
--
-- Una reserva vinculada a una actividad no tiene vida propia: si la actividad
-- se cancela o se archiva, su reserva se cancela con ella y suelta la sala; si
-- cambia de hora, la reserva se mueve al horario nuevo.
--
-- Va en un trigger AFTER UPDATE propio, que no toca activities_before_update
-- (Fase 4) ni sus efectos: esta fase se engancha, no reescribe lo de nadie.
--
-- Lo que hace este trigger que conviene entender bien: si al mover la actividad
-- su recurso está ocupado en el horario nuevo, el movimiento de la franja falla
-- con 23P01 y, como estamos dentro de la misma transacción, se cae también el
-- UPDATE de la actividad. Cambiar la hora de un culto con el auditorio
-- reservado queda bloqueado hasta resolver el choque a mano. Es deliberado
-- (decisión P-17, confirmada por Carlos el 20 de septiembre de 2026): la
-- alternativa era mover la actividad y dejar la sala atrás, que nadie
-- descubriría hasta el domingo.

create or replace function app.activities_sync_reservations()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reserva record;
begin
  -- 1. La actividad se cancela o se archiva: sus reservas se van con ella.
  if (new.status = 'cancelled' and old.status is distinct from 'cancelled')
     or (new.archived_at is not null and old.archived_at is null) then

    for v_reserva in
      select id from resource_reservations
      where activity_id = new.id and status in ('confirmed', 'pending')
    loop
      update resource_reservations
      set status = 'cancelled',
          cancelled_at = now(),
          cancelled_by = null,
          cancelled_reason = case
            when new.status = 'cancelled' then 'La actividad se canceló'
            else 'La actividad se archivó' end,
          updated_at = now()
      where id = v_reserva.id;

      perform app.release_occupancy(v_reserva.id, null);

      perform app.write_audit_log(new.church_id, 'reservation.cancelled',
        'resource_reservations', v_reserva.id,
        jsonb_build_object('cause', case when new.status = 'cancelled' then 'activity_cancelled' else 'activity_archived' end,
                           'activity_id', new.id));
    end loop;

    return new;
  end if;

  -- 2. La actividad cambia de horario: sus reservas se mueven con ella.
  if (new.starts_at, new.ends_at) is distinct from (old.starts_at, old.ends_at) then

    -- Una actividad que pierde su horario concreto no puede arrastrar reservas
    -- a ninguna parte: no hay ventana donde ponerlas.
    if new.starts_at is null or new.ends_at is null then
      if exists (select 1 from resource_reservations
                 where activity_id = new.id and status in ('confirmed', 'pending')) then
        raise exception 'Esta actividad tiene recursos reservados: cancela las reservas antes de dejarla sin horario.'
          using errcode = '22023';
      end if;
      return new;
    end if;

    for v_reserva in
      select id, status from resource_reservations
      where activity_id = new.id and status in ('confirmed', 'pending')
    loop
      update resource_reservations
      set starts_at = new.starts_at, ends_at = new.ends_at, updated_at = now()
      where id = v_reserva.id;

      -- Solo las confirmadas ocupan; mover su franja es lo que puede chocar, y
      -- si choca se cae el cambio de hora entero.
      if v_reserva.status = 'confirmed' then
        perform app.move_occupancy(v_reserva.id, null, new.starts_at, new.ends_at);
      end if;

      perform app.write_audit_log(new.church_id, 'reservation.rescheduled',
        'resource_reservations', v_reserva.id,
        jsonb_build_object('cause', 'activity_rescheduled', 'activity_id', new.id,
                           'starts_at', new.starts_at, 'ends_at', new.ends_at));
    end loop;
  end if;

  return new;
end;
$$;

comment on function app.activities_sync_reservations() is
  'Mantiene las reservas de recursos en línea con su actividad: cancelación y archivado las cancelan, un cambio de hora las mueve. Si el horario nuevo choca con otra ocupación, falla y se cae el cambio entero (decisión P-17).';

revoke all on function app.activities_sync_reservations() from public, anon, authenticated;

-- AFTER, no BEFORE: cuando esto corre, la actividad ya ha pasado sus propias
-- validaciones de la Fase 4 y sabemos que el cambio es legítimo.
create trigger activities_sync_reservations_trg
  after update on activities
  for each row execute function app.activities_sync_reservations();

-- Borrar una actividad se lleva sus reservas por la FK en cascada, y la
-- ocupación detrás por la suya. No hace falta trigger para eso, pero sí dejarlo
-- dicho: es la única ruta donde no queda rastro en auditoría, y por eso borrar
-- actividades no es una operación normal del producto.
