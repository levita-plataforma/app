import { notFound } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { hasCapability } from "@/server/tenant/authorize";
import { listCustomFieldDefinitions, getCustomFieldValues } from "@/server/people/custom-fields-service";
import { listHouseholds } from "@/server/people/households-service";
import PersonaFicha from "./PersonaFicha";

export default async function PersonaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await requireTenantContext();
  const supabase = await createSupabaseServerClient();

  const [{ data: person }, { data: churchPerson }, canManage] = await Promise.all([
    supabase
      .from("people")
      .select("id, first_name, last_name, preferred_name, email, phone, birth_date, user_id, source, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("church_people")
      .select("id, relationship, primary_campus_id, joined_at, archived_at, campuses(name)")
      .eq("church_id", tenant.churchId)
      .eq("person_id", id)
      .maybeSingle(),
    hasCapability(tenant.churchId, "people.manage"),
  ]);

  if (!person || !churchPerson) notFound();

  const [{ data: tags }, { data: allTags }, { data: campuses }, customFieldDefs, customFieldValues, households, { data: auditEvents }] =
    await Promise.all([
      supabase.from("person_tags").select("tags(id, name, color)").eq("church_id", tenant.churchId).eq("person_id", id),
      supabase.from("tags").select("id, name, color").eq("church_id", tenant.churchId).is("archived_at", null),
      supabase.from("campuses").select("id, name").eq("church_id", tenant.churchId).is("archived_at", null),
      listCustomFieldDefinitions(tenant.churchId),
      getCustomFieldValues(tenant.churchId, id),
      listHouseholds(tenant.churchId),
      supabase
        .from("audit_logs")
        .select("id, action, created_at, metadata")
        .eq("church_id", tenant.churchId)
        .eq("entity_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const campus = Array.isArray(churchPerson.campuses) ? churchPerson.campuses[0] : churchPerson.campuses;
  const personTags = (tags ?? [])
    .map((t) => (Array.isArray(t.tags) ? t.tags[0] : t.tags))
    .filter((t): t is { id: string; name: string; color: string | null } => Boolean(t));

  return (
    <PersonaFicha
      canManage={canManage}
      person={{
        id: person.id,
        firstName: person.first_name,
        lastName: person.last_name,
        preferredName: person.preferred_name,
        email: person.email,
        phone: person.phone,
        birthDate: person.birth_date,
        hasAccount: Boolean(person.user_id),
        source: person.source,
        createdAt: person.created_at,
      }}
      membership={{
        relationship: churchPerson.relationship,
        campusId: churchPerson.primary_campus_id,
        campusName: (campus?.name as string | null) ?? null,
        joinedAt: churchPerson.joined_at,
        archivedAt: churchPerson.archived_at,
      }}
      churchName={tenant.churchName}
      campuses={campuses ?? []}
      tags={personTags}
      allTags={allTags ?? []}
      households={households}
      customFieldDefinitions={customFieldDefs}
      customFieldValues={customFieldValues}
      auditEvents={(auditEvents ?? []).map((e) => ({ id: e.id, action: e.action, createdAt: e.created_at, metadata: e.metadata as Record<string, unknown> }))}
    />
  );
}
