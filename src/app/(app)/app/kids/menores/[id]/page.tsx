import { notFound } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { getOrCreateKidsProfile, getKidsSensitiveNotes } from "@/server/kids/kids-profiles-service";
import { listGuardiansForKid } from "@/server/kids/kid-guardians-service";
import { listPickupAuthorizations } from "@/server/kids/kid-pickup-service";
import { listIncidents } from "@/server/kids/kids-incidents-service";
import { DomainError } from "@/server/errors/domain-error";
import { ensureKidsModule } from "../../module-gate";
import KidFicha from "./KidFicha";

export default async function KidFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenantContext();
  const disabled = await ensureKidsModule(tenant.churchId);
  if (disabled) return disabled;

  const canReadKids = await hasCapability(tenant.churchId, "kids.read");
  if (!canReadKids) notFound();

  let profile;
  try {
    // getOrCreateKidsProfile exige kids.manage internamente porque la
    // creación implícita es una mutación; si el perfil ya existe para esta
    // persona no se inserta nada, solo se lee. Si el caller no tiene
    // kids.manage y el perfil no existe todavía, se le pedirá que lo cree
    // desde el listado (que sí exige el permiso) — aquí solo se atrapa el
    // caso de "no encontrado" para devolver un 404 limpio.
    profile = await getOrCreateKidsProfile(tenant.churchId, id);
  } catch (err) {
    if (err instanceof DomainError && (err.code === "RESOURCE_NOT_FOUND" || err.code === "FORBIDDEN")) {
      notFound();
    }
    throw err;
  }

  const canManageProfile = await hasCapability(tenant.churchId, "kids.manage");
  const canManageGuardians = await hasCapability(tenant.churchId, "kids.guardians.manage");
  const canManagePickup = await hasCapability(tenant.churchId, "kids.pickup.manage");
  const canReadIncidents = await hasCapability(tenant.churchId, "kids.incident.read");
  const canManageIncidents = await hasCapability(tenant.churchId, "kids.incident.manage");
  const canReadSensitive = await hasCapability(tenant.churchId, "kids.sensitive.read");

  const [guardians, pickupAuthorizations, incidents, sensitiveNotes] = await Promise.all([
    listGuardiansForKid(tenant.churchId, id),
    canManagePickup ? listPickupAuthorizations(tenant.churchId, id) : Promise.resolve([]),
    // El tab de Incidencias SOLO se renderiza server-side si el caller tiene
    // kids.incident.read (encargo §C): no se oculta solo con CSS, la
    // consulta ni siquiera se ejecuta si no hay permiso.
    canReadIncidents ? listIncidents(tenant.churchId, { kidPersonId: id }) : Promise.resolve([]),
    // Las notas sensibles viven en su propia tabla desde el hotfix
    // 20260928001000: la RLS de kids_sensitive_notes exige
    // kids.sensitive.read, así que sin ese permiso la consulta no devuelve
    // nada. Aquí ni siquiera se lanza, para no pedir a la base algo que ya
    // se sabe que no corresponde.
    canReadSensitive ? getKidsSensitiveNotes(tenant.churchId, id) : Promise.resolve(null),
  ]);

  return (
    <KidFicha
      profile={profile}
      guardians={guardians}
      pickupAuthorizations={pickupAuthorizations}
      incidents={incidents}
      sensitiveNotes={sensitiveNotes}
      permissions={{
        canManageProfile,
        canManageGuardians,
        canManagePickup,
        canReadIncidents,
        canManageIncidents,
        canReadSensitive,
      }}
    />
  );
}
