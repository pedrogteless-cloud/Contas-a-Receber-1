// ---------------------------------------------------------------------------
// lib/auth.ts
// Autenticação própria (usuário + senha), hash scrypt e sessão assinada.
// SOMENTE servidor — nunca importe em componentes de client.
// ---------------------------------------------------------------------------

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

export type Papel = "admin" | "operador" | "leitor";

export interface Usuario {
  id: string;
  nome: string;
  usuario: string;
  papel: Papel;
  ativo: boolean;
  ultimo_acesso?: string | null;
  created_at?: string;
}

export interface Sessao {
  id: string;
  usuario: string;
  nome: string;
  papel: Papel;
}

export const COOKIE_SESSAO = "cr1_sess";
const DIAS_SESSAO = 30;

// ---------------------------------------------------------------------------
// Senha (scrypt + salt aleatório)
// ---------------------------------------------------------------------------

/** Gera "salt:hash" para guardar no banco. */
export function hashSenha(senha: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(senha, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/** Confere a senha contra o "salt:hash" guardado (comparação constante). */
export function conferirSenha(senha: string, guardado: string): boolean {
  try {
    const [salt, hash] = String(guardado).split(":");
    if (!salt || !hash) return false;
    const calculado = scryptSync(senha, salt, 64);
    const esperado = Buffer.from(hash, "hex");
    if (calculado.length !== esperado.length) return false;
    return timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Sessão assinada (payload.assinatura em base64url)
// ---------------------------------------------------------------------------

function segredo(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.ADMIN_SENHA ||
    "contas-a-receber-1"
  );
}

function b64url(s: string | Buffer): string {
  return Buffer.from(s)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function deB64url(s: string): string {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
}

function assinar(dados: string): string {
  return b64url(createHmac("sha256", segredo()).update(dados).digest());
}

/** Cria o valor do cookie de sessão. */
export function criarSessao(s: Sessao): string {
  const payload = b64url(
    JSON.stringify({ ...s, exp: Date.now() + DIAS_SESSAO * 86400_000 })
  );
  return `${payload}.${assinar(payload)}`;
}

/** Valida o cookie e devolve a sessão, ou null se inválida/expirada. */
export function lerSessao(cookie: string | undefined | null): Sessao | null {
  if (!cookie) return null;
  const [payload, assinatura] = cookie.split(".");
  if (!payload || !assinatura) return null;

  const esperada = assinar(payload);
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const dados = JSON.parse(deB64url(payload)) as Sessao & { exp: number };
    if (!dados.exp || dados.exp < Date.now()) return null;
    return {
      id: dados.id,
      usuario: dados.usuario,
      nome: dados.nome,
      papel: dados.papel,
    };
  } catch {
    return null;
  }
}

export const MAX_AGE_SESSAO = DIAS_SESSAO * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Payload assinado genérico — mesmo esquema da sessão, para outros cookies de
// vida curta (hoje: o desafio do WebAuthn, que precisa sobreviver só entre o
// "gerar opções" e o "verificar resposta").
// ---------------------------------------------------------------------------

export function assinarPayload(dados: Record<string, unknown>, ttlMs: number): string {
  const payload = b64url(JSON.stringify({ ...dados, exp: Date.now() + ttlMs }));
  return `${payload}.${assinar(payload)}`;
}

export function lerPayload<T = Record<string, unknown>>(
  valor: string | undefined | null
): T | null {
  if (!valor) return null;
  const [payload, assinatura] = valor.split(".");
  if (!payload || !assinatura) return null;

  const esperada = assinar(payload);
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const dados = JSON.parse(deB64url(payload)) as T & { exp: number };
    if (!dados.exp || dados.exp < Date.now()) return null;
    return dados;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Permissões
// ---------------------------------------------------------------------------

/** Pode alterar dados (importar boletos, enviar alertas, configurar). */
export function podeEditar(papel: Papel | undefined): boolean {
  return papel === "admin" || papel === "operador";
}

/** Pode administrar usuários e ver auditoria. */
export function ehAdmin(papel: Papel | undefined): boolean {
  return papel === "admin";
}

export const PAPEIS: { valor: Papel; rotulo: string; descricao: string }[] = [
  {
    valor: "admin",
    rotulo: "Administrador",
    descricao: "Acesso total: usuários, permissões e auditoria.",
  },
  {
    valor: "operador",
    rotulo: "Operador",
    descricao: "Importa boletos, envia alertas e altera configurações.",
  },
  {
    valor: "leitor",
    rotulo: "Leitor",
    descricao: "Somente consulta: dashboard, clientes e histórico.",
  },
];
