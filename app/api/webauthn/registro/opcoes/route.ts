import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { NextResponse } from "next/server";

import { assinarPayload } from "@/lib/auth";
import { sessaoAtual } from "@/lib/sessao-servidor";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { COOKIE_DESAFIO, TTL_DESAFIO_MS, rpInfo } from "@/lib/webauthn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sessao = sessaoAtual();
  if (!sessao) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const { rpID } = rpInfo(req);
  const supabase = getSupabaseAdmin();
  const { data: existentes } = await supabase
    .from("webauthn_credenciais")
    .select("credential_id, transportes")
    .eq("usuario_id", sessao.id);

  const opcoes = await generateRegistrationOptions({
    rpName: "Contas a Receber 1",
    rpID,
    userName: sessao.usuario,
    userID: new TextEncoder().encode(sessao.id),
    userDisplayName: sessao.nome,
    attestationType: "none",
    excludeCredentials: (existentes ?? []).map((c) => ({
      id: c.credential_id as string,
      transports: (c.transportes as AuthenticatorTransportFuture[] | null) ?? undefined,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
  });

  const res = NextResponse.json({ ok: true, opcoes });
  res.cookies.set(
    COOKIE_DESAFIO,
    assinarPayload({ challenge: opcoes.challenge, usuarioId: sessao.id }, TTL_DESAFIO_MS),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: TTL_DESAFIO_MS / 1000,
    }
  );
  return res;
}
