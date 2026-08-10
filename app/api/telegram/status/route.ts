import { NextResponse } from "next/server";

import { sessaoAtual } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diz se o bot está configurado e devolve o nome de usuário dele — sem nunca
 * expor o token ao navegador.
 */
export async function GET() {
  if (!sessaoAtual()) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ configurado: false, motivo: "sem_token" });
  }

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const dados = (await resp.json().catch(() => null)) as {
      ok?: boolean;
      result?: { username?: string; first_name?: string };
      description?: string;
    } | null;

    if (!resp.ok || !dados?.ok) {
      return NextResponse.json({
        configurado: false,
        motivo: "token_invalido",
        detalhe: dados?.description ?? "Token recusado pelo Telegram.",
      });
    }

    return NextResponse.json({
      configurado: true,
      bot: {
        username: dados.result?.username ?? "",
        nome: dados.result?.first_name ?? "",
      },
    });
  } catch (err) {
    console.error("[telegram/status] erro:", err);
    return NextResponse.json({ configurado: false, motivo: "erro_rede" });
  }
}
