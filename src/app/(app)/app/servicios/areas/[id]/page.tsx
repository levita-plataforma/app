import { notFound } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { getServiceArea } from "@/server/serving/service-areas-service";
import { listAreaLeaders } from "@/server/serving/service-area-leaders-service";
import { listAreaMembers } from "@/server/serving/service-area-members-service";
import { listTeams } from "@/server/serving/service-teams-service";
import { listPositions } from "@/server/serving/service-positions-service";
import { listQualificationsForPeople } from "@/server/serving/qualifications-service";
import { listCredentialsForPeople } from "@/server/serving/credentials-service";
import { QUALIFICATION_LEVEL_LABELS } from "../../labels";
import { ensureServingModule } from "../../module-gate";
import AreaFicha from "./AreaFicha";
import { fullName } from "../../ui";

const EXPIRY_WINDOW_DAYS = 30;

export default async function AreaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenantContext();
  const disabled = await ensureServingModule(tenant.churchId);
  if (disabled) return disabled;

  const area = await getServiceArea(tenant.churchId, id);
  if (!area) notFound();

  const supabase = await createSupabaseServerClient();

  const [
    leaders,
    members,
    { items: teams },
    positions,
    canManageArea,
    canManageLeaders,
    canManageMembers,
    canManageTeams,
    canManagePositions,
    canReadCredentials,
    { data: peopleRows },
    { data: campuses },
  ] = await Promise.all([
    listAreaLeaders(tenant.churchId, id),
    listAreaMembers(tenant.churchId, id),
    listTeams(tenant.churchId, { areaId: id, pageSize: 100 }),
    listPositions(tenant.churchId, id),
    hasCapability(tenant.churchId, "service_area.manage", "service_area", id),
    hasCapability(tenant.churchId, "service_area.leaders.manage", "service_area", id),
    hasCapability(tenant.churchId, "service_members.manage", "service_area", id),
    hasCapability(tenant.churchId, "service_teams.manage", "service_area", id),
    hasCapability(tenant.churchId, "service_positions.manage", "service_area", id),
    hasCapability(tenant.churchId, "credential.read"),
    supabase
      .from("church_people")
      .select("person_id, people!inner(id, first_name, last_name)")
      .eq("church_id", tenant.churchId)
      .is("archived_at", null)
      .limit(500),
    supabase.from("campuses").select("id, name").eq("church_id", tenant.churchId).is("archived_at", null),
  ]);

  const people = (peopleRows ?? [])
    .map((row) => {
      const person = Array.isArray(row.people) ? row.people[0] : row.people;
      return person
        ? {
            id: person.id as string,
            firstName: person.first_name as string,
            lastName: person.last_name as string | null,
          }
        : null;
    })
    .filter((p): p is { id: string; firstName: string; lastName: string | null } => Boolean(p))
    .sort((a, b) => fullName(a.firstName, a.lastName).localeCompare(fullName(b.firstName, b.lastName), "es"));

  // Cualificaciones y credenciales se consultan solo para las personas del
  // área, y en una sola consulta por tabla (nunca una por persona).
  const memberPersonIds = members.map((m) => m.personId);

  const expiryLimit = new Date();
  expiryLimit.setDate(expiryLimit.getDate() + EXPIRY_WINDOW_DAYS);

  const [qualifications, credentials] = await Promise.all([
    listQualificationsForPeople(tenant.churchId, memberPersonIds),
    canReadCredentials
      ? listCredentialsForPeople(tenant.churchId, memberPersonIds)
      : Promise.resolve([]),
  ]);

  const areaQualifications = qualifications.map((q) => ({
    personId: q.personId,
    personName: fullName(q.firstName, q.lastName),
    qualificationName: q.qualificationName,
    level: QUALIFICATION_LEVEL_LABELS[q.level],
    verified: q.verified,
    expiresAt: q.expiresAt,
  }));

  const expiringCredentials = credentials.filter(
    (c) => c.expiresAt && new Date(c.expiresAt) <= expiryLimit,
  );

  return (
    <AreaFicha
      area={area}
      leaders={leaders}
      members={members}
      teams={teams}
      positions={positions}
      areaQualifications={areaQualifications}
      expiringCredentials={expiringCredentials}
      people={people}
      campuses={campuses ?? []}
      permissions={{
        canManageArea,
        canManageLeaders,
        canManageMembers,
        canManageTeams,
        canManagePositions,
        canReadCredentials,
      }}
    />
  );
}
