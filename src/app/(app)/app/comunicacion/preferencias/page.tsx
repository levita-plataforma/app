import { SlidersHorizontal } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { getMyNotificationPreferences, DEFAULT_NOTIFICATION_PREFERENCES } from "@/server/notifications/notifications-service";
import { listMyCommunicationCategoryPreferences } from "@/server/communications/communications-service";
import { env } from "@/server/env";
import { logger } from "@/server/logger/logger";
import PreferenciasAvisos from "../../avisos/PreferenciasAvisos";
import PreferenciasCategorias from "./PreferenciasCategorias";
import { ensureCommunicationsModule } from "../module-gate";
import "../../avisos/avisos.css";

/**
 * Preferencias de comunicación (Fase 9, iteración). Reutiliza el bloque de
 * preferencias por CANAL ya existente de Avisos (PreferenciasAvisos.tsx,
 * Fase 5) sin duplicarlo, y añade un bloque propio de preferencias por
 * CATEGORÍA opcional (communication_category_preferences), que es lo que
 * esta iteración añade de nuevo. Las categorías obligatorias
 * (institutional/operational/system) nunca aparecen aquí: no admiten baja.
 */
export default async function ComunicacionPreferenciasPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureCommunicationsModule(tenant.churchId);
  if (disabled) return disabled;

  const [channelPreferences, categoryPreferences] = await Promise.all([
    loadChannelPreferences(tenant.churchId, tenant.personId),
    listMyCommunicationCategoryPreferences(tenant.churchId),
  ]);

  const externalTransportEnabled = env.notificationsTransport !== "disabled";

  return (
    <>
      <section className="av-page-header">
        <div className="av-title-row">
          <span className="av-module-icon">
            <SlidersHorizontal size={18} aria-hidden="true" />
          </span>
          <div>
            <h1>Preferencias de comunicación</h1>
            <p className="av-subtitle">Cómo y de qué quieres que te avisemos.</p>
          </div>
        </div>
      </section>

      <PreferenciasAvisos
        preferences={channelPreferences.preferences}
        loadFailed={!channelPreferences.ok}
        externalTransportEnabled={externalTransportEnabled}
      />

      <PreferenciasCategorias initialPreferences={categoryPreferences} />
    </>
  );
}

async function loadChannelPreferences(churchId: string, personId: string) {
  try {
    return { ok: true as const, preferences: await getMyNotificationPreferences(churchId, personId) };
  } catch (error) {
    logger.error("No se pudieron cargar las preferencias de canal para Comunicación", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false as const, preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES } };
  }
}
