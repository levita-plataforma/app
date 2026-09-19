import { notFound } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { hasCapability } from "@/server/tenant/authorize";
import { getCourse, listCohorts } from "@/server/discipleship/discipleship-service";
import { ensureDiscipleshipModule } from "../../module-gate";
import { ensureDiscipleshipRead } from "../../access-gate";
import CursoFicha from "./CursoFicha";

export default async function CursoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenantContext();

  const disabled = await ensureDiscipleshipModule(tenant.churchId);
  if (disabled) return disabled;

  const denied = await ensureDiscipleshipRead(tenant.churchId, ["course.read"], "los cursos");
  if (denied) return denied;

  const course = await getCourse(tenant.churchId, id);
  if (!course) notFound();

  const supabase = await createSupabaseServerClient();

  const [cohorts, { data: campuses }, canCreateCohort, canManage] = await Promise.all([
    listCohorts(tenant.churchId, { courseId: id, includeArchived: true }).catch(() => []),
    supabase.from("campuses").select("id, name").eq("church_id", tenant.churchId).is("archived_at", null).order("name"),
    hasCapability(tenant.churchId, "course.create"),
    hasCapability(tenant.churchId, "course.manage"),
  ]);

  return (
    <CursoFicha
      course={course}
      cohorts={cohorts}
      campuses={(campuses ?? []).map((c) => ({ id: c.id as string, name: c.name as string }))}
      canCreateCohort={canCreateCohort}
      canManage={canManage}
    />
  );
}
