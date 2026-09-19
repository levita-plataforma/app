-- Fase 7 · Repone los tipos de aviso después de la Fase 8.
--
-- Por qué hace falta esta migración, que a primera vista parece repetir lo que
-- ya hizo 20260927000500:
--
-- La migración de avisos de la Fase 8 (20260928000800_avisos_kids.sql) reescribe
-- la lista entera de tipos con la suya, que no conoce los de la Fase 7. Como se
-- aplica después por número, borra los de grupos y discipulado. No se puede
-- corregir allí: ya está aplicada en producción y las migraciones aplicadas no
-- se reescriben.
--
-- Así que se repone aquí, con el mecanismo aditivo que introdujo el hotfix de
-- la Fase 8 (app.add_notification_event_types), que conserva lo que haya. Al ir
-- esta migración la última, el resultado es el mismo se aplique en el orden que
-- se aplique: la lista acaba conteniendo los tipos de todas las fases.
--
-- Comprobado antes de escribirla: sin esto, en una base construida desde cero,
-- la constraint terminaba sin ni uno solo de los tipos de la Fase 7, y el
-- primer aviso de un grupo habría fallado con 23514.

do $tipos$
begin
  if to_regprocedure('app.add_notification_event_types(text[])') is not null then
    perform app.add_notification_event_types(array[
      'group.join_request.received', 'group.join_request.accepted',
      'group.join_request.rejected', 'group.member.added',
      'group.meeting.rescheduled', 'group.meeting.cancelled',
      'course.session.rescheduled', 'course.session.cancelled',
      'course.enrollment.completed', 'path.step.completed'
    ]);
  else
    -- Si esta migración llegara a aplicarse sin la Fase 8 presente, los tipos
    -- ya los puso 20260927000500 y no hay nada que reponer.
    raise notice 'app.add_notification_event_types no existe: los tipos de la Fase 7 ya están puestos.';
  end if;
end;
$tipos$;
