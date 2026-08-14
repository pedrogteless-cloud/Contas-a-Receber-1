import { NextResponse } from "next/server";

import { registrarAuditoria, sessaoAtual } from "@/lib/sessao-servidor";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sessao = sessaoAtual();
  if (!sessao) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id) {
    return NextResponse.json({ ok: false, erro: "Informe a credencial." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: existente } = await supabase
    .from("webauthn_credenciais")
    .select("id, usuario_id, nome_aparelho")
    .eq("id", id)
    .maybeSingle();

  if (!existente || existente.usuario_id !== sessao.id) {
    return NextResponse.json({ ok: false, erro: "Credencial não encontrada." }, { status: 404 });
  }

  const { error } = await supabase.from("webauthn_credenciais").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, erro: "Erro ao remover." }, { status: 500 });
  }

  await registrarAuditoria(
    "webauthn.removido",
    `Removeu biometria do aparelho "${existente.nome_aparelho}".`,
    sessao
  );

  return NextResponse.json({ ok: true });
}
