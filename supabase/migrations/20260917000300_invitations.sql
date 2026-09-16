-- Fase 1 · Invitaciones (alta asistida por operación LEVITA y futuras
-- invitaciones de equipo). Ver encargo de Fase 1 §16-17.

create type invitation_status as enum ('pending', 'accepted', 'expired', 'revoked');

create table invitations (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  email text not null,
  role_key text not null references roles (key),
  -- Solo se guarda el hash del token, nunca el token en claro (mismo patrón
  -- que el backlog histórico ya validó para Calserv/Levitaapp). El token
  -- real se entrega una única vez en el enlace de invitación.
  token_hash text not null,
  status invitation_status not null default 'pending',
  invited_by uuid,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by_person_id uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (token_hash)
);

comment on table invitations is
  'Invitación de una persona (owner en alta asistida, o futuro miembro de equipo) a una iglesia. Solo se persiste el hash del token. Ver docs/adr/0002 y encargo de Fase 1 §17.';
comment on column invitations.token_hash is
  'SHA-256 del token entregado por email. El token en claro nunca se guarda ni se loguea.';

alter table invitations add constraint invitations_id_unique unique (id, church_id);
create index invitations_church_id_idx on invitations (church_id);
create index invitations_email_idx on invitations (lower(email));
create index invitations_status_idx on invitations (status) where status = 'pending';

alter table invitations enable row level security;
alter table invitations force row level security;

create policy invitations_select on invitations
  for select to authenticated
  using ( (select app.has_capability(church_id, 'roles.manage')) );

create policy invitations_manage on invitations
  for all to authenticated
  using ( (select app.has_capability(church_id, 'roles.manage')) )
  with check ( (select app.has_capability(church_id, 'roles.manage')) );
