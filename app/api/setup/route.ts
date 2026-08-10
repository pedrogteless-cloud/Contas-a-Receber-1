import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  COOKIE_SESSAO,
  MAX_AGE_SESSAO,
  criarSessao,
  hashSenha,
} from "@/lib/auth";
import { registrarAuditoria } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Há algum usuário cadastrado? Se não, o app precisa do primeiro admin. */
async function semUsuarios(): Promise<boolean> {
  const { count, error } = await getSupabaseAdmin()
    .from("usuarios")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return (count ?? 0) === 0;
}

export async function GET() {
  try {
    return NextResponse.json({ precisaSetup: await semUsuarios() });
  } catch (err) {
    console.error("[setup] erro ao verificar:", err);
    return NextResponse.json(
      { precisaSetup: false, erro: "Não foi possível consultar o banco." },
      { status: 500 }
    );
  }
}

/**
 * Cria o PRIMEIRO administrador. Só funciona enquanto não existir nenhum
 * usuário — depois disso, novos cadastros só pela tela de Administração.
 */
export async function POST(req: Request) {
  try {
    if (!(await semUsuarios())) {
      return NextResponse.json(
        { erro: "O sistema já possui usuários. Entre com sua conta." },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => null);
    const nome = String(body?.nome ?? "").trim();
    const usuario = String(body?.usuario ?? "").trim().toLowerCase();
    const senha = String(body?.senha ?? "");

    if (!usuario || !senha) {
      return NextResponse.json(
        { erro: "Informe usuário e senha." },
        { status: 400 }
      );
    }
    if (senha.length < 6) {
      return NextResponse.json(
        { erro: "A senha precisa de ao menos 6 caracteres." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("usuarios")
      .insert({
        nome: nome || usuario,
        usuario,
        senha_hash: hashSenha(senha),
        papel: "admin",
        ativo: true,
        ultimo_acesso: new Date().toISOString(),
      })
      .select("id, nome, usuario, papel")
      .single();

    if (error || !data) {
      console.error("[setup] erro ao criar admin:", error);
      return NextResponse.json(
        { erro: "Não foi possível criar o administrador." },
        { status: 500 }
      );
    }

    const sessao = {
      id: data.id as string,
      usuario: data.usuario as string,
      nome: (data.nome as string) || (data.usuario as string),
      papel: "admin" as const,
    };

    await registrarAuditoria(
      "usuario.criado",
      `Administrador inicial "${sessao.usuario}" criado.`,
      sessao
    );

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
    console.error("[setup] erro:", err);
    return NextResponse.json({ erro: "Erro no servidor." }, { status: 500 });
  }
}
