-- Fase 9 (Diogo) · Preferencias de comunicación por categoría (iteración).
--
-- notification_preferences (Fase 5) es por canal, no por categoría/purpose:
-- deliberadamente NO se toca esa tabla ni su contrato con Avisos operativos.
-- Esta tabla es propia de Comunicación y SOLO cubre categorías opcionales
-- (services/groups/events/discipleship/kids/pastoral). institutional,
-- operational y system nunca admiten opt-out aquí: son siempre obligatorias
-- (el prompt de esta iteración lo exige explícitamente — "mensajes
-- operativos críticos separados de comunicaciones opcionales").

create table communication_category_preferences (
  church_id uuid not null references churches (id) on delete cascade,
  person_id uuid not null,
  category communication_purpose not null,
  opted_out boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (church_id, person_id, category),
  foreign key (church_id, person_id) references church_people (church_id, person_id) on delete cascade,
  foreign key (person_id) references people (id) on delete cascade,
  check (category in ('services', 'groups', 'events', 'discipleship', 'kids', 'pastoral'))
);

comment on table communication_category_preferences is
  'Opt-out por categoría opcional de comunicación (iteración sobre A14). Nunca cubre institutional/operational/system: esas categorías son siempre obligatorias y no tienen fila posible aquí (CHECK). Sin fila = suscrito (comportamiento por defecto, igual que notification_preferences).';

create trigger communication_category_preferences_set_updated_at
  before update on communication_category_preferences
  for each row execute function app.set_updated_at();

alter table communication_category_preferences enable row level security;
alter table communication_category_preferences force row level security;

create policy communication_category_preferences_select_own on communication_category_preferences
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and person_id in (select app.current_person_ids())
  );

revoke insert, update, delete, truncate, select on communication_category_preferences from anon;
revoke insert, update, delete, truncate on communication_category_preferences from authenticated;

-- Token opaco de baja, generado solo para destinatarios de categorías
-- opcionales al materializar (ver 20261001001100). Mismo patrón que
-- registrations.cancel_token (Fase 6): opaco, alta entropía, sin exponer
-- person_id ni ids secuenciales, comparado por igualdad.
alter table communication_recipients add column unsubscribe_token text unique;

comment on column communication_recipients.unsubscribe_token is
  'Token opaco de baja (dos UUID sin guiones), generado solo si communications.purpose es una categoría opcional. Null para institutional/operational/system y para canales que no llevan enlace de baja (inapp).';

-- failure_kind: distingue fallos transitorios (reintentables) de
-- permanentes, para cuando exista un proveedor real de email/push que
-- pueda fallar de verdad (hoy nunca falla: no hay transporte). Se prepara
-- la columna sin inventar fallos.
create type communication_failure_kind as enum ('temporary', 'permanent');

alter table communication_recipients add column failure_kind communication_failure_kind;

comment on column communication_recipients.failure_kind is
  'temporary: reintentable (rate limit del proveedor, timeout). permanent: no reintentable (dirección inválida, hard bounce). Null mientras no exista proveedor real que pueda fallar.';
