// ---------------------------------------------------------------------------
// lib/sessao-servidor.ts
// Helpers de servidor: sessão atual, registro de auditoria e bootstrap do
// usuário mestre. SOMENTE servidor (usa service role).
// ---------------------------------------------------------------------------

import { cookies } from "next/headers";

import { getSupabaseAdmin } from "./supabase-admin";
import {
  COOKIE_SESSAO,
  hashSenha,
  lerSessao,
  type Papel,
  type Sessao,
} from "./auth";

/** Sessão do request atual (ou null). */
export function sessaoAtual(): Sessao | null {
  try {
    return lerSessao(cookies().get(COOKIE_SESSAO)?.value);
  } catch {
    return null;
  }
}

/** Grava uma linha na trilha de auditoria (nunca lança). */
export async function registrarAuditoria(
  acao: string,
  detalhe = "",
  sessao?: Sessao | null
): Promise<void> {
  try {
    const s = sessao ?? sessaoAtual();
    await getSupabaseAdmin()
      .from("auditoria")
      .insert({
        usuario: s?.usuario ?? "sistema",
        usuario_id: s?.id ?? null,
        acao,
        detalhe,
      });
  } catch (err) {
    console.error("[auditoria] falha ao registrar:", err);
  }
}

/**
 * Garante que o usuário mestre (ADMIN_USUARIO/ADMIN_SENHA) exista como admin.
 * Roda no login: se ainda não houver esse usuário, cria; se existir, mantém.
 */
export async function garantirAdmin(): Promise<void> {
  const usuario = process.env.ADMIN_USUARIO?.trim();
  const senha = process.env.ADMIN_SENHA;
  if (!usuario || !senha) return;

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("usuarios")
    .select("id")
    .eq("usuario", usuario.toLowerCase())
    .maybeSingle();

  if (data) return;

  const { error } = await supabase.from("usuarios").insert({
    nome: "Administrador",
    usuario: usuario.toLowerCase(),
    senha_hash: hashSenha(senha),
    papel: "admin" as Papel,
    ativo: true,
  });

  if (error) {
    console.error("[garantirAdmin] falha ao criar usuário mestre:", error);
    return;
  }

  await registrarAuditoria(
    "usuario.criado",
    `Usuário mestre "${usuario.toLowerCase()}" criado automaticamente.`,
    null
  );
}
