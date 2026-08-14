import { NextResponse } from "next/server";

import { conferirSenha, hashSenha } from "@/lib/auth";
import { registrarAuditoria, sessaoAtual } from "@/lib/sessao-servidor";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Troca a própria senha (requer a senha atual). */
export async function POST(req: Request) {
  const sessao = sessaoAtual();
  if (!sessao) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const senhaAtual = String(body?.senhaAtual ?? "");
  const novaSenha = String(body?.novaSenha ?? "");

  if (!senhaAtual || !novaSenha) {
    return NextResponse.json(
      { ok: false, erro: "Informe a senha atual e a nova senha." },
      { status: 400 }
    );
  }
  if (novaSenha.length < 6) {
    return NextResponse.json(
      { ok: false, erro: "A nova senha precisa de ao menos 6 caracteres." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: u } = await supabase
    .from("usuarios")
    .select("id, senha_hash")
    .eq("id", sessao.id)
    .maybeSingle();

  if (!u || !conferirSenha(senhaAtual, u.senha_hash)) {
    return NextResponse.json(
      { ok: false, erro: "Senha atual incorreta." },
      { status: 401 }
    );
  }

  const { error } = await supabase
    .from("usuarios")
    .update({ senha_hash: hashSenha(novaSenha) })
    .eq("id", sessao.id);

  if (error) {
    return NextResponse.json({ ok: false, erro: "Erro ao trocar a senha." }, { status: 500 });
  }

  await registrarAuditoria("usuario.senha_trocada", "Trocou a própria senha.", sessao);
  return NextResponse.json({ ok: true });
}
