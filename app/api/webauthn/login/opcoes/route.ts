import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";

import { assinarPayload } from "@/lib/auth";
import { COOKIE_DESAFIO, TTL_DESAFIO_MS, rpInfo } from "@/lib/webauthn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { rpID } = rpInfo(req);

  const opcoes = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
  });

  const res = NextResponse.json({ ok: true, opcoes });
  res.cookies.set(
    COOKIE_DESAFIO,
    assinarPayload({ challenge: opcoes.challenge }, TTL_DESAFIO_MS),
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
