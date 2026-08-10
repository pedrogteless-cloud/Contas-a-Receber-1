import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  COOKIE_SESSAO,
  MAX_AGE_SESSAO,
  conferirSenha,
  criarSessao,
  type Papel,
} from "@/lib/auth";
import { garantirAdmin, registrarAuditoria } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const usuario = String(body?.usuario ?? "").trim().toLowerCase();
  const senha = String(body?.senha ?? "");

  if (!usuario || !senha) {
    return NextResponse.json(
      { ok: false, erro: "Informe usuário e senha." },
      { status: 400 }
    );
  }

  try {
    // Cria o usuário mestre na primeira entrada, se configurado.
    await garantirAdmin();

    const supabase = getSupabaseAdmin();
    const { data: u } = await supabase
      .from("usuarios")
      .select("id, nome, usuario, senha_hash, papel, ativo")
      .eq("usuario", usuario)
      .maybeSingle();

    if (!u || !u.ativo || !conferirSenha(senha, u.senha_hash)) {
      await registrarAuditoria(
        "login.falhou",
        `Tentativa de login para "${usuario}".`,
        null
      );
      return NextResponse.json(
        { ok: false, erro: "Usuário ou senha inválidos." },
        { status: 401 }
      );
    }

    const sessao = {
      id: u.id as string,
      usuario: u.usuario as string,
      nome: (u.nome as string) || (u.usuario as string),
      papel: (u.papel as Papel) ?? "leitor",
    };

    await supabase
      .from("usuarios")
      .update({ ultimo_acesso: new Date().toISOString() })
      .eq("id", u.id);

    await registrarAuditoria("login", `Entrou no sistema.`, sessao);

    const res = NextResponse.json({ ok: true, usuario: sessao });
    res.cookies.set(COOKIE_SESSAO, criarSessao(sessao), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_SESSAO,
    });
    return res;
  } catch (err) {
    console.error("[login] erro:", err);
    return NextResponse.json(
      { ok: false, erro: "Erro no servidor. Verifique a configuração." },
      { status: 500 }
    );
  }
}
