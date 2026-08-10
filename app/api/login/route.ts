import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const senha = process.env.APP_SENHA;
  // Sem senha configurada: acesso livre.
  if (!senha) return NextResponse.json({ ok: true });

  const body = await req.json().catch(() => null);
  if (body?.senha === senha) {
    const res = NextResponse.json({ ok: true });
    res.cookies.set("cr1_auth", senha, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 dias
    });
    return res;
  }

  return NextResponse.json({ ok: false }, { status: 401 });
}
