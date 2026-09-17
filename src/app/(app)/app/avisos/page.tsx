import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  BellRing,
  CalendarCheck,
  CalendarX2,
  Check,
  Clock,
  Repeat,
  X,
  type LucideIcon,
} from "lucide-react";
import { getTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { env } from "@/server/env";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  listMyNotifications,
  countMyUnreadNotifications,
  getMyNotificationPreferences,
  notificationTarget,
  type AppNotification,
  type NotificationPreferences,
} from "@/server/notifications/notifications-service";
import { formatDateLong, formatTime, timeZoneAbbreviation } from "@/lib/activities/time";
import AvisoAcciones from "./AvisoAcciones";
import MarcarTodoLeido from "./MarcarTodoLeido";
import PreferenciasAvisos from "./PreferenciasAvisos";
import "./avisos.css";

/**
 * Bandeja de avisos (Fase 5, DI-02). Server component: carga con el cliente
 * del usuario y delega toda escritura en las acciones de ./actions.ts.
 *
 * Mientras el transporte externo esté desactivado, el aviso vive solo aquí:
 * ningún texto de esta página dice que se haya enviado un correo ni un push.
 */

type SearchParams = { ver?: string };

const LIST_LIMIT = 100;

/** El instante se lee una vez por render, fuera del cuerpo del componente. */
function currentTimeMs(): number {
  return Date.now();
}

export default async function AvisosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const onlyUnread = params.ver !== "todos";
  const tenant = await getTenantContext();

  if (!tenant) {
    return (
      <>
        <PageHeader unreadCount={0} />
        <div className="shell-card shell-empty-state">
          <span className="av-module-icon">
            <Bell size={18} aria-hidden="true" />
          </span>
          <h3>Todavía no perteneces a ninguna iglesia</h3>
          <p>
            Cuando la administración de una iglesia vincule tu cuenta, los avisos de tus turnos y de las actividades
            aparecerán aquí.
          </p>
        </div>
      </>
    );
  }

  const supabase = await createSupabaseServerClient();
  const [notifications, unreadCount, preferences, churchTimezone] = await Promise.all([
    listMyNotifications(tenant.churchId, { onlyUnread, limit: LIST_LIMIT }),
    countMyUnreadNotifications(tenant.churchId),
    loadPreferences(tenant.churchId, tenant.personId),
    supabase
      .from("churches")
      .select("timezone")
      .eq("id", tenant.churchId)
      .maybeSingle()
      .then(({ data }) => (data?.timezone as string | null) ?? "Europe/Madrid"),
  ]);

  const nowMs = currentTimeMs();
  const externalTransportEnabled = env.notificationsTransport !== "disabled";

  return (
    <>
      <PageHeader unreadCount={unreadCount} churchName={tenant.churchName} />

      <div className="av-toolbar">
        <nav className="serving-tabs av-tabs" aria-label="Avisos que se muestran">
          <Link href="/app/avisos" className="av-tab" aria-current={onlyUnread ? "page" : undefined}>
            Sin leer{unreadCount > 0 ? ` (${unreadCount})` : ""}
          </Link>
          <Link href="/app/avisos?ver=todos" className="av-tab" aria-current={onlyUnread ? undefined : "page"}>
            Todos
          </Link>
        </nav>
        <MarcarTodoLeido unreadCount={unreadCount} />
      </div>

      {notifications.length === 0 ? (
        <div className="shell-card shell-empty-state">
          <span className="av-module-icon">
            <Bell size={18} aria-hidden="true" />
          </span>
          <h3>{onlyUnread ? "No tienes avisos sin leer" : "Todavía no tienes avisos"}</h3>
          <p>
            {onlyUnread ? (
              <>
                Estás al día.{" "}
                <Link href="/app/avisos?ver=todos" className="av-inline-link">
                  Ver todos los avisos
                </Link>{" "}
                para repasar los anteriores.
              </>
            ) : (
              "Aquí aparecerán los avisos de tus turnos y de las actividades que coordinas: cuando te asignen un puesto, cuando alguien responda o cuando cambie una hora."
            )}
          </p>
        </div>
      ) : (
        <ul className="av-list">
          {notifications.map((notification) => (
            <AvisoCard
              key={notification.id}
              notification={notification}
              nowMs={nowMs}
              timeZone={churchTimezone}
            />
          ))}
        </ul>
      )}

      {notifications.length >= LIST_LIMIT ? (
        <p className="av-note">
          Se muestran los {LIST_LIMIT} avisos más recientes. Los anteriores siguen guardados, pero no se listan aquí.
        </p>
      ) : null}

      <PreferenciasAvisos preferences={preferences} externalTransportEnabled={externalTransportEnabled} />
    </>
  );
}

function PageHeader({ unreadCount, churchName }: { unreadCount: number; churchName?: string }) {
  return (
    <section className="av-page-header">
      <div className="av-title-row">
        <span className="av-module-icon">
          <Bell size={18} aria-hidden="true" />
        </span>
        <div>
          <h1>Avisos</h1>
          <p className="av-subtitle">
            {churchName
              ? `Lo que ocurre con tus turnos y con las actividades que coordinas en ${churchName}.`
              : "Lo que ocurre con tus turnos y con las actividades que coordinas."}
            {unreadCount > 0 ? ` Tienes ${unreadCount} sin leer.` : ""}
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta de un aviso
// ---------------------------------------------------------------------------

function AvisoCard({
  notification,
  nowMs,
  timeZone,
}: {
  notification: AppNotification;
  nowMs: number;
  timeZone: string;
}) {
  const target = notificationTarget(notification);
  const unread = notification.readAt === null;
  const { Icon, tone } = eventVisual(notification.eventType);
  const fullDate = `${formatDateLong(notification.createdAt, timeZone)} a las ${formatTime(
    notification.createdAt,
    timeZone,
  )} (${timeZoneAbbreviation(notification.createdAt, timeZone)})`;

  return (
    <li className={`shell-card av-item${unread ? " is-unread" : ""}`}>
      <span className={`av-item-icon is-${tone}`} aria-hidden="true">
        <Icon size={16} />
      </span>
      <div className="av-item-main">
        <h2 className="av-item-title">
          {notification.title}
          {unread ? (
            <>
              <span className="av-unread-dot" aria-hidden="true" />
              <span className="sr-only"> (sin leer)</span>
            </>
          ) : null}
        </h2>
        <p className="av-item-body">{notification.body}</p>
        <p className="av-item-meta">
          <time dateTime={notification.createdAt} title={fullDate}>
            {relativeTime(notification.createdAt, nowMs)}
          </time>
          {/* La fecha completa siempre está disponible, también con lector de pantalla. */}
          <span className="sr-only">{fullDate}</span>
          <span className="av-item-fulldate" aria-hidden="true">
            · {fullDate}
          </span>
        </p>
      </div>
      <AvisoAcciones
        notificationId={notification.id}
        href={target?.href ?? null}
        linkLabel={target?.label ?? null}
        title={notification.title}
        unread={unread}
      />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------------

type Tone = "neutral" | "success" | "warning" | "danger";

const EVENT_VISUALS: Record<string, { Icon: LucideIcon; tone: Tone }> = {
  "assignment.proposed": { Icon: CalendarCheck, tone: "neutral" },
  "assignment.accepted": { Icon: Check, tone: "success" },
  "assignment.declined": { Icon: X, tone: "warning" },
  "assignment.cancelled": { Icon: CalendarX2, tone: "danger" },
  "assignment.substituted": { Icon: Repeat, tone: "warning" },
  "assignment.substitution_requested": { Icon: Repeat, tone: "warning" },
  "activity.rescheduled": { Icon: Clock, tone: "warning" },
  "assignment.reminder": { Icon: BellRing, tone: "neutral" },
  "assignment.coverage_at_risk": { Icon: AlertTriangle, tone: "danger" },
};

function eventVisual(eventType: string): { Icon: LucideIcon; tone: Tone } {
  return EVENT_VISUALS[eventType] ?? { Icon: Bell, tone: "neutral" };
}

const RELATIVE_FORMAT = new Intl.RelativeTimeFormat("es-ES", { numeric: "auto" });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** "hace 3 horas". La fecha completa se ofrece siempre junto a este texto. */
function relativeTime(iso: string, nowMs: number): string {
  const diff = new Date(iso).getTime() - nowMs;
  const abs = Math.abs(diff);
  if (!Number.isFinite(diff)) return "";
  if (abs < MINUTE) return "ahora mismo";
  if (abs < HOUR) return RELATIVE_FORMAT.format(Math.round(diff / MINUTE), "minute");
  if (abs < DAY) return RELATIVE_FORMAT.format(Math.round(diff / HOUR), "hour");
  if (abs < WEEK) return RELATIVE_FORMAT.format(Math.round(diff / DAY), "day");
  if (abs < MONTH) return RELATIVE_FORMAT.format(Math.round(diff / WEEK), "week");
  if (abs < YEAR) return RELATIVE_FORMAT.format(Math.round(diff / MONTH), "month");
  return RELATIVE_FORMAT.format(Math.round(diff / YEAR), "year");
}

/**
 * Las preferencias son secundarias: si su lectura falla, la bandeja se muestra
 * igual y el bloque de canales parte de los valores por defecto.
 */
async function loadPreferences(churchId: string, personId: string): Promise<NotificationPreferences> {
  try {
    return await getMyNotificationPreferences(churchId, personId);
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}
