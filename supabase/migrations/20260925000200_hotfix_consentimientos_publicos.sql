-- Hotfix Fase 6 · F-01 (crítico, fuga entre iglesias):
-- `consent_definitions_select_public` (20260924000500_rls_eventos.sql) concedía
-- SELECT a `anon` sobre consent_definitions con `using (active)`, SIN filtro de
-- church_id. Cualquier visitante sin sesión podía listar las cláusulas de
-- consentimiento de TODAS las iglesias de la plataforma: el cuerpo íntegro de
-- cada texto, que en la práctica contiene la razón social, la dirección y los
-- datos de contacto del responsable del tratamiento. Es una fuga transversal
-- entre inquilinos, justo lo que el ADR 0013 prohíbe.
--
-- Corrección: se elimina la política y la superficie pública pasa a ser una
-- función `security definer` de superficie mínima, resuelta por SLUG de
-- iglesia (nunca por church_id ni sin filtro), que devuelve solo lo que el
-- formulario público necesita pintar: key, purpose_type, title, body y
-- version. Mismo patrón que public.public_form_fields
-- (20260924000800_form_fields_publicos.sql).

drop policy if exists consent_definitions_select_public on consent_definitions;

create or replace function public.public_consent_definitions(p_church_slug text)
returns table (
  consent_key text,
  purpose_type text,
  title text,
  body text,
  version integer
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select cd.key, cd.purpose_type, cd.title, cd.body, cd.version
  from consent_definitions cd
  join churches c on c.id = cd.church_id
  where c.slug = p_church_slug
    and c.archived_at is null
    and cd.active
  order by cd.key;
$$;

comment on function public.public_consent_definitions(text) is
  'Cláusulas de consentimiento activas de UNA iglesia, resueltas por slug, para el formulario público de inscripción. Sustituye a la política RLS consent_definitions_select_public, que exponía las de todas las iglesias (hotfix F-01).';

revoke all on function public.public_consent_definitions(text) from public;
grant execute on function public.public_consent_definitions(text) to anon, authenticated;
