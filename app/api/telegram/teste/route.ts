import { NextResponse } from "next/server";

import { dataPorExtenso } from "@/lib/tempo";
import { registrarAuditoria, sessaoAtual } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Envia uma mensagem de teste para um chat_id, confirmando a configuração. */
export async function POST(req: Request) {
  const s = sessaoAtual();
  if (!s) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim().replace(/^["']|["']$/g, "");
  if (!token) {
    return NextResponse.json(
      { ok: false, erro: "Bot sem token configurado." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const chatId = String(body?.chat_id ?? "").trim();
  if (!chatId) {
    return NextResponse.json(
      { ok: false, erro: "Informe o chat_id." },
      { status: 400 }
    );
  }

  const texto = [
    "✅ Teste do Contas a Receber 1",
    "",
    "Se você recebeu esta mensagem, os alertas de prazo chegarão aqui.",
    "",
    `📅 ${dataPorExtenso()}`,
    `👤 Enviado por: ${s.nome}`,
  ].join("\n");

  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: texto }),
      }
    );
    const dados = (await resp.json().catch(() => null)) as {
      ok?: boolean;
      description?: string;
    } | null;

    if (!resp.ok || !dados?.ok) {
      return NextResponse.json({
        ok: false,
        erro:
          dados?.description ??
          "O Telegram recusou o envio. Confira se a pessoa já iniciou conversa com o bot.",
      });
    }

    await registrarAuditoria(
      "telegram.teste",
      `Enviou mensagem de teste para o chat ${chatId}.`,
      s
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[telegram/teste] erro:", err);
    return NextResponse.json(
      { ok: false, erro: "Falha de rede ao falar com o Telegram." },
      { status: 500 }
    );
  }
}
