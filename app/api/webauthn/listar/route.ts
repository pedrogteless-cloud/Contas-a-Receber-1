import { NextResponse } from "next/server";

import { sessaoAtual } from "@/lib/sessao-servidor";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sessao = sessaoAtual();
  if (!sessao) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("webauthn_credenciais")
    .select("id, nome_aparelho, criado_em, ultimo_uso")
    .eq("usuario_id", sessao.id)
    .order("criado_em", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, erro: "Erro ao listar." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, credenciais: data ?? [] });
}
