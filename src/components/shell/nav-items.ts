import type { LucideIcon } from "lucide-react";
import {
  Home,
  Users,
  UsersRound,
  CalendarClock,
  Music4,
  UserRound,
  GraduationCap,
  CalendarDays,
  Baby,
  MessageCircle,
  HeartHandshake,
  Coins,
  Building2,
  BarChart3,
  Link2,
  Settings,
} from "lucide-react";

/**
 * Catálogo de navegación de la shell. `moduleKey` referencia el catálogo
 * global de módulos (public.modules); un elemento solo se muestra si su
 * módulo está habilitado para la iglesia activa (o si moduleKey es null,
 * como "Inicio" y "Configuración", que son núcleo, no módulo). Ver
 * docs/adr/0006 y Fase 0 §23.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  moduleKey: string | null;
  accent: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Inicio", icon: Home, moduleKey: null, accent: "brand" },
  { href: "/app/personas", label: "Personas", icon: Users, moduleKey: "people", accent: "people" },
  { href: "/app/familias", label: "Familias", icon: UsersRound, moduleKey: "people", accent: "families" },
  { href: "/app/servicios", label: "Servicios", icon: CalendarClock, moduleKey: "serving", accent: "serving" },
  { href: "/app/alabanza", label: "Alabanza", icon: Music4, moduleKey: "worship", accent: "worship" },
  { href: "/app/grupos", label: "Grupos", icon: UserRound, moduleKey: "groups", accent: "groups" },
  { href: "/app/discipulado", label: "Discipulado", icon: GraduationCap, moduleKey: "discipleship", accent: "discipleship" },
  { href: "/app/eventos", label: "Eventos", icon: CalendarDays, moduleKey: "events", accent: "events" },
  { href: "/app/ninos", label: "Niños", icon: Baby, moduleKey: "kids", accent: "kids" },
  { href: "/app/comunicacion", label: "Comunicación", icon: MessageCircle, moduleKey: "communications", accent: "communications" },
  { href: "/app/acompanamiento", label: "Acompañamiento Pastoral", icon: HeartHandshake, moduleKey: "pastoral", accent: "pastoral" },
  { href: "/app/ofrendas", label: "Ofrendas", icon: Coins, moduleKey: "giving", accent: "giving" },
  { href: "/app/instalaciones", label: "Instalaciones", icon: Building2, moduleKey: "facilities", accent: "facilities" },
  { href: "/app/informes", label: "Informes", icon: BarChart3, moduleKey: "analytics", accent: "analytics" },
  { href: "/app/integraciones", label: "Integraciones", icon: Link2, moduleKey: "integrations", accent: "integrations" },
];

export const SETTINGS_ITEM: NavItem = {
  href: "/app/configuracion",
  label: "Configuración",
  icon: Settings,
  moduleKey: null,
  accent: "brand",
};
