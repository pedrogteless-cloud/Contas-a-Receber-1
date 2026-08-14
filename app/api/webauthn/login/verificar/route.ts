import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { NextResponse } from "next/server";

import {
  COOKIE_SESSAO,
  MAX_AGE_SESSAO,
  criarSessao,
  lerPayload,
  type Papel,
} from "@/lib/auth";
import { registrarAuditoria } from "@/lib/sessao-servidor";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { COOKIE_DESAFIO, rpInfo } from "@/lib/webauthn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resposta = body?.resposta;
  if (!resposta?.id) {
    return NextResponse.json({ ok: false, erro: "Resposta inválida." }, { status: 400 });
  }

  const cookieDesafio = req.headers
    .get("cookie")
    ?.split("; ")
    .find((c) => c.startsWith(`${COOKIE_DESAFIO}=`))
    ?.slice(COOKIE_DESAFIO.length + 1);

  const desafio = lerPayload<{ challenge: string }>(cookieDesafio);
  if (!desafio) {
    return NextResponse.json(
      { ok: false, erro: "Desafio expirado. Tente novamente." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: cred } = await supabase
    .from("webauthn_credenciais")
    .select(
      "id, credential_id, public_key, contador, transportes, usuario_id, usuarios(id, nome, usuario, papel, ativo)"
    )
    .eq("credential_id", resposta.id)
    .maybeSingle();

  const usuario = (cred?.usuarios as unknown as
    | { id: string; nome: string; usuario: string; papel: Papel; ativo: boolean }
    | null) ?? null;

  if (!cred || !usuario || !usuario.ativo) {
    await registrarAuditoria("login.falhou", "Tentativa de login com biometria desconhecida.", null);
    return NextResponse.json({ ok: false, erro: "Credencial não reconhecida." }, { status: 401 });
  }

  const { rpID, origin } = rpInfo(req);

  try {
    const verificacao = await verifyAuthenticationResponse({
      response: resposta,
      expectedChallenge: desafio.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.credential_id as string,
        publicKey: isoBase64URL.toBuffer(cred.public_key as string),
        counter: cred.contador as number,
        transports: (cred.transportes as AuthenticatorTransportFuture[] | null) ?? undefined,
      },
    });

    if (!verificacao.verified) {
      return NextResponse.json({ ok: false, erro: "Não foi possível verificar." }, { status: 401 });
    }

    const agora = new Date().toISOString();
    await supabase
      .from("webauthn_credenciais")
      .update({ contador: verificacao.authenticationInfo.newCounter, ultimo_uso: agora })
      .eq("id", cred.id);

    const sessao = {
      id: usuario.id,
      usuario: usuario.usuario,
      nome: usuario.nome || usuario.usuario,
      papel: usuario.papel ?? "leitor",
    };

    await supabase.from("usuarios").update({ ultimo_acesso: agora }).eq("id", usuario.id);
    await registrarAuditoria("login", "Entrou com biometria.", sessao);

    const res = NextResponse.json({ ok: true, usuario: sessao });
    res.cookies.set(COOKIE_SESSAO, criarSessao(sessao), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_SESSAO,
    });
    res.cookies.delete(COOKIE_DESAFIO);
    return res;
  } catch (err) {
    console.error("[webauthn/login/verificar] erro:", err);
    return NextResponse.json({ ok: false, erro: "Erro no servidor." }, { status: 500 });
  }
}
