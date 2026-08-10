import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ehAdmin, hashSenha, type Papel } from "@/lib/auth";
import { registrarAuditoria, sessaoAtual } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAPEIS_VALIDOS: Papel[] = ["admin", "operador", "leitor"];

function negado() {
  return NextResponse.json(
    { erro: "Acesso restrito ao administrador." },
    { status: 403 }
  );
}

/** Lista os usuários (sem hashes). */
export async function GET() {
  const s = sessaoAtual();
  if (!ehAdmin(s?.papel)) return negado();

  const { data, error } = await getSupabaseAdmin()
    .from("usuarios")
    .select("id, nome, usuario, papel, ativo, ultimo_acesso, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ erro: "Erro ao listar." }, { status: 500 });
  }
  return NextResponse.json({ usuarios: data ?? [] });
}

/** Cria um usuário. */
export async function POST(req: Request) {
  const s = sessaoAtual();
  if (!ehAdmin(s?.papel)) return negado();

  const body = await req.json().catch(() => null);
  const nome = String(body?.nome ?? "").trim();
  const usuario = String(body?.usuario ?? "").trim().toLowerCase();
  const senha = String(body?.senha ?? "");
  const papel = String(body?.papel ?? "operador") as Papel;

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
  if (!PAPEIS_VALIDOS.includes(papel)) {
    return NextResponse.json({ erro: "Papel inválido." }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin().from("usuarios").insert({
    nome: nome || usuario,
    usuario,
    senha_hash: hashSenha(senha),
    papel,
    ativo: true,
  });

  if (error) {
    const dup = String(error.message).includes("duplicate");
    return NextResponse.json(
      { erro: dup ? "Esse usuário já existe." : "Erro ao criar usuário." },
      { status: dup ? 409 : 500 }
    );
  }

  await registrarAuditoria(
    "usuario.criado",
    `Criou o usuário "${usuario}" com papel ${papel}.`,
    s
  );
  return NextResponse.json({ ok: true });
}

/** Atualiza nome, papel, ativo e/ou senha. */
export async function PATCH(req: Request) {
  const s = sessaoAtual();
  if (!ehAdmin(s?.papel)) return negado();

  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id) {
    return NextResponse.json({ erro: "Usuário não informado." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: alvo } = await supabase
    .from("usuarios")
    .select("id, usuario, papel, ativo")
    .eq("id", id)
    .maybeSingle();

  if (!alvo) {
    return NextResponse.json({ erro: "Usuário não encontrado." }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};
  const mudancas: string[] = [];

  if (typeof body?.nome === "string") {
    patch.nome = body.nome.trim();
    mudancas.push("nome");
  }
  if (typeof body?.papel === "string") {
    if (!PAPEIS_VALIDOS.includes(body.papel as Papel)) {
      return NextResponse.json({ erro: "Papel inválido." }, { status: 400 });
    }
    patch.papel = body.papel;
    mudancas.push(`papel -> ${body.papel}`);
  }
  if (typeof body?.ativo === "boolean") {
    patch.ativo = body.ativo;
    mudancas.push(body.ativo ? "reativado" : "desativado");
  }
  if (typeof body?.senha === "string" && body.senha) {
    if (body.senha.length < 6) {
      return NextResponse.json(
        { erro: "A senha precisa de ao menos 6 caracteres." },
        { status: 400 }
      );
    }
    patch.senha_hash = hashSenha(body.senha);
    mudancas.push("senha redefinida");
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ erro: "Nada para atualizar." }, { status: 400 });
  }

  // Trava de segurança: não permitir remover/desativar o último admin ativo.
  const viraNaoAdmin = patch.papel != null && patch.papel !== "admin";
  const viraInativo = patch.ativo === false;
  if (alvo.papel === "admin" && (viraNaoAdmin || viraInativo)) {
    const { count } = await supabase
      .from("usuarios")
      .select("id", { count: "exact", head: true })
      .eq("papel", "admin")
      .eq("ativo", true);
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { erro: "Não é possível remover o último administrador ativo." },
        { status: 400 }
      );
    }
  }

  const { error } = await supabase.from("usuarios").update(patch).eq("id", id);
  if (error) {
    return NextResponse.json({ erro: "Erro ao atualizar." }, { status: 500 });
  }

  await registrarAuditoria(
    "usuario.alterado",
    `Alterou "${alvo.usuario}": ${mudancas.join(", ")}.`,
    s
  );
  return NextResponse.json({ ok: true });
}
