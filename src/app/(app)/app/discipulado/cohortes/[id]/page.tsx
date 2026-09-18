import { notFound } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import {
  getCohort,
  getCompletionSuggestions,
  getSessionAttendance,
  listCohortSessions,
  listEnrollments,
} from "@/server/discipleship/discipleship-service";
import { ensureDiscipleshipModule } from "../../module-gate";
import { ensureDiscipleshipRead } from "../../access-gate";
import CohorteFicha from "./CohorteFicha";

export default async function CohorteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenantContext();

  const disabled = await ensureDiscipleshipModule(tenant.churchId);
  if (disabled) return disabled;

  const denied = await ensureDiscipleshipRead(tenant.churchId, ["course.read"], "la formación");
  if (denied) return denied;

  const cohort = await getCohort(tenant.churchId, id);
  if (!cohort) notFound();

  const [canManage, canManageEnrollments, canManageAttendance] = await Promise.all([
    hasCapability(tenant.churchId, "course.manage"),
    hasCapability(tenant.churchId, "course.enrollment.manage"),
    hasCapability(tenant.churchId, "course.attendance.manage"),
  ]);

  const [enrollments, sessions, suggestions] = await Promise.all([
    listEnrollments(tenant.churchId, { cohortId: id }).catch(() => []),
    listCohortSessions(tenant.churchId, id).catch(() => []),
    canManageEnrollments ? getCompletionSuggestions(id).catch(() => []) : Promise.resolve([]),
  ]);

  // Asistencia ya anotada de cada sesión viva, para precargar el formulario sin
  // pedirla de nuevo al cambiar de sesión en el cliente.
  const openSessions = sessions.filter((session) => !session.cancelledAt);
  const attendanceEntries = canManageAttendance
    ? await Promise.all(
        openSessions.map(async (session) => {
          const recorded = await getSessionAttendance(tenant.churchId, session.id).catch(() => new Map());
          return [session.id, Object.fromEntries(recorded)] as const;
        }),
      )
    : [];

  const enrolled = enrollments.filter((item) => item.status === "enrolled");
  const alreadyInvolved = enrollments.some((item) => item.personId === tenant.personId);

  return (
    <CohorteFicha
      cohort={cohort}
      enrollments={enrollments}
      sessions={sessions}
      suggestions={suggestions}
      attendanceBySession={Object.fromEntries(attendanceEntries)}
      permissions={{ canManage, canManageEnrollments, canManageAttendance }}
      canRequestSeat={
        !alreadyInvolved &&
        (cohort.status === "open" || cohort.status === "running") &&
        (cohort.capacity === null || enrolled.length < cohort.capacity)
      }
    />
  );
}
