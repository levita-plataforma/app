export type IconName = "home" | "people" | "teams" | "calendar" | "message" | "folder" | "chart" | "settings" | "church" | "heart" | "growth";
const paths: Record<IconName, React.ReactNode> = {
  home: <><path d="m3 10 9-7 9 7M5 9v12h14V9M10 21v-7h4v7"/></>,
  people: <><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3"/></>,
  teams: <><circle cx="12" cy="7" r="3"/><path d="M7 21v-4a5 5 0 0 1 10 0v4M4 6a3 3 0 0 0 0 6M20 6a3 3 0 0 1 0 6M3 16a4 4 0 0 0-1 3v2M21 16a4 4 0 0 1 1 3v2"/></>,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16m-12 5 3 3 5-5"/></>,
  message: <path d="M20 4H4v13h5v4l5-4h6V4ZM8 8h8M8 12h6"/>,
  folder: <path d="M3 7V4h7l3 3h8v14H3V7Zm0 3h18"/>,
  chart: <><path d="M4 21V13h4v8M10 21V8h4v13M16 21V3h4v18"/></>,
  settings: <><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3H9Z"/><circle cx="12" cy="12" r="3"/></>,
  church: <><path d="M12 2v6M9 5h6M5 13l7-5 7 5v8H5v-8ZM10 21v-6h4v6M2 21h20"/></>,
  heart: <path d="M12 21 3.5 12.5A5.5 5.5 0 0 1 12 5.6a5.5 5.5 0 0 1 8.5 6.9L12 21Z"/>,
  growth: <><path d="M12 22V10M12 16C5 16 3 12 3 8c6 0 9 3 9 8ZM12 11c0-6 3-9 9-9 0 6-3 9-9 9Z"/></>,
};
export default function Icon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
