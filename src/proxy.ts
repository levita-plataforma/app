import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { COOKIE_ULTIMO_CONTEXTO, contextoDeRuta } from "@/server/auth/destino-acceso";

/**
 * Refresca la sesión de Supabase en cada petición y protege las rutas de la
 * aplicación autenticada. La landing pública y las rutas de acceso quedan
 * excluidas por el matcher. Ver Fase 0 §22 (contexto de tenant) y §23 (shell).
 */
export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAppRoute = pathname.startsWith("/app");
  const isConsolaRoute = pathname === "/operacion" || pathname.startsWith("/operacion/");
  const isLoginRoute = pathname === "/acceso";
  // El wizard de onboarding y la aceptación de invitación son rutas de
  // /acceso a propósito: un usuario ya autenticado pero sin iglesia
  // todavía debe poder seguir en ellas, no rebotar a /app en bucle.
  const isOnboardingFlowRoute =
    pathname.startsWith("/acceso/onboarding") || pathname.startsWith("/acceso/invitacion");

  if ((isAppRoute || isConsolaRoute) && !user) {
    const redirectUrl = new URL("/acceso", request.url);
    redirectUrl.searchParams.set("siguiente", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Con sesión, /acceso decide el destino en /acceso/contexto: consola, app o
  // elección, según el tipo de cuenta y el último contexto usado.
  if ((isLoginRoute || pathname === "/acceso/registro") && user && !isOnboardingFlowRoute) {
    return NextResponse.redirect(new URL("/acceso/contexto", request.url));
  }

  // Se recuerda el último contexto (consola o iglesia) para el próximo login.
  // No es autorización: solo decide a qué pantalla se llega primero.
  const contexto = contextoDeRuta(pathname);
  if (user && contexto && request.cookies.get(COOKIE_ULTIMO_CONTEXTO)?.value !== contexto) {
    response.cookies.set(COOKIE_ULTIMO_CONTEXTO, contexto, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
  }

  return response;
}

export const config = {
  matcher: ["/app/:path*", "/acceso/:path*", "/operacion/:path*", "/operacion"],
};
