// ---------------------------------------------------------------------------
// lib/webauthn.ts
// Tipos e um helper de UI para as chaves de acesso (Face ID / biometria).
// Seguro para importar tanto no servidor quanto no client — a parte
// criptográfica de verdade mora nas rotas de API, que usam
// @simplewebauthn/server e a service role.
// ---------------------------------------------------------------------------

export interface CredencialWebAuthn {
  id: string;
  nome_aparelho: string;
  criado_em: string;
  ultimo_uso: string | null;
}

export const COOKIE_DESAFIO = "cr1_webauthn_desafio";
/** O desafio só precisa sobreviver ao tempo de olhar pra câmera. */
export const TTL_DESAFIO_MS = 5 * 60 * 1000;

/**
 * Deriva rpID (domínio) e origin a partir dos headers do request — evita
 * fixar o domínio em variável de ambiente e funciona em preview/produção.
 * Usa x-forwarded-host/proto (setados pelo Vercel) com fallback pro host.
 */
export function rpInfo(req: Request): { rpID: string; origin: string } {
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return { rpID: host.split(":")[0], origin: `${proto}://${host}` };
}

/**
 * Chuta um nome de aparelho a partir do user-agent, só pra pré-preencher o
 * campo — a pessoa pode trocar antes de confirmar. Sem lib de parsing: o
 * suficiente aqui é distinguir os aparelhos que a equipe realmente usa.
 */
export function nomeAparelhoPadrao(): string {
  if (typeof navigator === "undefined") return "Este aparelho";
  const ua = navigator.userAgent;

  const aparelho = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : "Este aparelho";

  const navegador = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";

  return navegador ? `${aparelho} · ${navegador}` : aparelho;
}
