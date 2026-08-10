import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ehAdmin } from "@/lib/auth";
import { registrarAuditoria, sessaoAtual } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lista a trilha de auditoria (mais recentes primeiro). */
export async function GET(req: Request) {
  const s = sessaoAtual();
  if (!ehAdmin(s?.papel)) {
    return NextResponse.json(
      { erro: "Acesso restrito ao administrador." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const limite = Math.min(Number(searchParams.get("limite") ?? 300), 1000);

  const { data, error } = await getSupabaseAdmin()
    .from("auditoria")
    .select("id, usuario, acao, detalhe, created_at")
    .order("created_at", { ascending: false })
    .limit(limite);

  if (error) {
    return NextResponse.json({ erro: "Erro ao listar." }, { status: 500 });
  }
  return NextResponse.json({ registros: data ?? [] });
}

/** Registra uma ação vinda do client (ex.: importação, alertas). */
export async function POST(req: Request) {
  const s = sessaoAtual();
  const body = await req.json().catch(() => null);
  const acao = String(body?.acao ?? "").trim();
  if (!acao) {
    return NextResponse.json({ erro: "Ação não informada." }, { status: 400 });
  }
  await registrarAuditoria(acao, String(body?.detalhe ?? ""), s);
  return NextResponse.json({ ok: true });
}
