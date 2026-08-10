import { NextResponse } from "next/server";

import { sessaoAtual } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Devolve a sessão atual para o client (nome, usuário e papel). */
export async function GET() {
  return NextResponse.json({ sessao: sessaoAtual() });
}
