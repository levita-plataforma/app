import { notFound } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { hasCapability } from "@/server/tenant/authorize";
import {
  getLearningPath,
  getPersonPathProgress,
  listPathPeople,
  listPathSteps,
} from "@/server/discipleship/learning-paths-service";
import { listCourses } from "@/server/discipleship/discipleship-service";
import { ensureDiscipleshipModule } from "../../module-gate";
import { ensureDiscipleshipRead } from "../../access-gate";
import { isUuid } from "../../ui";
import ItinerarioFicha from "./ItinerarioFicha";

type SearchParams = { persona?: string };

export default async function ItinerarioDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tenant = await requireTenantContext();

  const disabled = await ensureDiscipleshipModule(tenant.churchId);
  if (disabled) return disabled;

  const denied = await ensureDiscipleshipRead(tenant.churchId, ["path.read"], "los itinerarios");
  if (denied) return denied;

  const path = await getLearningPath(tenant.churchId, id);
  if (!path) notFound();

  const [canManage, canManageProgress] = await Promise.all([
    hasCapability(tenant.churchId, "path.manage"),
    hasCapability(tenant.churchId, "path.progress.manage"),
  ]);

  const personId = isUuid(sp.persona) ? sp.persona : null;

  const [steps, people, coursesResult] = await Promise.all([
    listPathSteps(tenant.churchId, id).catch(() => []),
    listPathPeople(tenant.churchId, id).catch(() => []),
    canManage
      ? listCourses(tenant.churchId, { status: "active", pageSize: 100 }).catch(() => ({
          items: [],
          total: 0,
          page: 1,
          pageSize: 100,
        }))
      : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 100 }),
  ]);

  let personProgress = [] as Awaited<ReturnType<typeof getPersonPathProgress>>;
  let selectedPerson: { id: string; name: string } | null = null;

  if (personId) {
    const supabase = await createSupabaseServerClient();
    const [{ data: person }, progress] = await Promise.all([
      supabase
        .from("people")
        .select("id, first_name, last_name, preferred_name")
        .eq("id", personId)
        .maybeSingle(),
      getPersonPathProgress(id, personId).catch(() => []),
    ]);

    if (person) {
      selectedPerson = {
        id: person.id as string,
        name: [
          (person.preferred_name as string | null) || (person.first_name as string),
          person.last_name as string | null,
        ]
          .filter(Boolean)
          .join(" "),
      };
      personProgress = progress;
    }
  }

  return (
    <ItinerarioFicha
      path={path}
      steps={steps}
      people={people}
      courses={coursesResult.items.map((course) => ({ id: course.id, name: course.name }))}
      personProgress={personProgress}
      selectedPerson={selectedPerson}
      canManage={canManage}
      canManageProgress={canManageProgress}
    />
  );
}
