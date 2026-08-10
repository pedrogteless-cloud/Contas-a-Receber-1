import { NextResponse } from "next/server";

import { COOKIE_SESSAO } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await registrarAuditoria("logout", "Saiu do sistema.");

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESSAO, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
