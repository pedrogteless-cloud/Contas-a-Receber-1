import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "cr1_sess";

// Rotas acessíveis sem sessão: login, preparo do primeiro administrador e o
// resumo diário (chamado pelo agendamento da Vercel, que não tem cookie — a
// própria rota valida o CRON_SECRET).
const LIVRES = new Set([
  "/login",
  "/api/login",
  "/api/logout",
  "/api/sessao",
  "/api/setup",
  "/api/telegram/resumo",
  // Metadados do PWA: precisam responder mesmo sem sessão (ex.: na própria
  // tela de login), senão o navegador nunca considera o app instalável.
  "/manifest.webmanifest",
  "/sw.js",
]);

/**
 * Exige sessão para tudo, exceto as rotas livres acima.
 *
 * Aqui fazemos só a checagem barata (existe cookie?). A validação da
 * assinatura e do papel acontece nos route handlers (Node), que têm o segredo
 * e o banco. Se ainda não houver nenhum usuário, /login mostra a tela de
 * criação do primeiro administrador.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (LIVRES.has(pathname)) return NextResponse.next();

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
