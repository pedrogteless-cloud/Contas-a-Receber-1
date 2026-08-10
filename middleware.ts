import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "cr1_auth";

/**
 * Proteção por senha compartilhada. Ativa somente quando APP_SENHA está
 * definida; sem ela, o app fica aberto (evita travar o deploy antes de
 * configurar). A senha fica no cookie httpOnly (só trafega para o servidor).
 */
export function middleware(req: NextRequest) {
  const senha = process.env.APP_SENHA;
  if (!senha) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") {
    return NextResponse.next();
  }

  if (req.cookies.get(COOKIE)?.value === senha) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
