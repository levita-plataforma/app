import "./public-shell.css";

/**
 * Layout mínimo para la superficie pública sin sesión (/i/...). El layout
 * raíz (src/app/layout.tsx) ya provee <html>/<body>, fuentes y metadata
 * base, así que aquí solo se importan las variables de color propias de
 * esta superficie (no lleva header/sidebar autenticado del grupo (app)).
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
