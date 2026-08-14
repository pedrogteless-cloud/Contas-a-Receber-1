import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { NextResponse } from "next/server";

import { lerPayload } from "@/lib/auth";
import { registrarAuditoria, sessaoAtual } from "@/lib/sessao-servidor";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { COOKIE_DESAFIO, rpInfo } from "@/lib/webauthn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sessao = sessaoAtual();
  if (!sessao) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const resposta = body?.resposta;
  const nomeAparelho = String(body?.nomeAparelho ?? "Aparelho").trim().slice(0, 80);
  if (!resposta) {
    return NextResponse.json({ ok: false, erro: "Resposta inválida." }, { status: 400 });
  }

  const cookieDesafio = req.headers
    .get("cookie")
    ?.split("; ")
    .find((c) => c.startsWith(`${COOKIE_DESAFIO}=`))
    ?.slice(COOKIE_DESAFIO.length + 1);

  const desafio = lerPayload<{ challenge: string; usuarioId: string }>(cookieDesafio);
  if (!desafio || desafio.usuarioId !== sessao.id) {
    return NextResponse.json(
      { ok: false, erro: "Desafio expirado. Tente novamente." },
      { status: 400 }
    );
  }

  const { rpID, origin } = rpInfo(req);

  try {
    const verificacao = await verifyRegistrationResponse({
      response: resposta,
      expectedChallenge: desafio.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verificacao.verified || !verificacao.registrationInfo) {
      return NextResponse.json({ ok: false, erro: "Não foi possível verificar." }, { status: 400 });
    }

    const { credential } = verificacao.registrationInfo;
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("webauthn_credenciais").insert({
      usuario_id: sessao.id,
      credential_id: credential.id,
      public_key: isoBase64URL.fromBuffer(credential.publicKey),
      contador: credential.counter,
      transportes: credential.transports ?? null,
      nome_aparelho: nomeAparelho || "Aparelho",
    });

    if (error) {
      console.error("[webauthn/registro/verificar] erro ao salvar:", error);
      return NextResponse.json({ ok: false, erro: "Erro ao salvar credencial." }, { status: 500 });
    }

    await registrarAuditoria(
      "webauthn.cadastrado",
      `Cadastrou biometria neste aparelho ("${nomeAparelho}").`,
      sessao
    );

    const res = NextResponse.json({ ok: true });
    res.cookies.delete(COOKIE_DESAFIO);
    return res;
  } catch (err) {
    console.error("[webauthn/registro/verificar] erro:", err);
    return NextResponse.json({ ok: false, erro: "Erro no servidor." }, { status: 500 });
  }
}
