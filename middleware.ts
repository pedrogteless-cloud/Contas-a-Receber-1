import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "cr1_sess";

/**
 * Protege o app quando o login está configurado (ADMIN_USUARIO + ADMIN_SENHA).
 * Faz apenas a checagem barata: existe cookie de sessão? A validação da
 * assinatura acontece nos route handlers/páginas (Node), que têm acesso ao
 * segredo e ao banco.
 */
export function middleware(req: NextRequest) {
  const loginAtivo =
    Boolean(process.env.ADMIN_USUARIO) && Boolean(process.env.ADMIN_SENHA);
  if (!loginAtivo) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (
    pathname === "/login" ||
    pathname === "/api/login" ||
    pathname === "/api/logout" ||
    pathname === "/api/sessao"
  ) {
    return NextResponse.next();
  }

  if (req.cookies.get(COOKIE)?.value) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
