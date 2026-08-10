import { NextResponse } from "next/server";

import { sessaoAtual } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatEncontrado {
  id: string;
  nome: string;
  tipo: string;
}

/**
 * Lista quem já conversou com o bot (via getUpdates), para o usuário adicionar
 * os destinatários com um clique em vez de descobrir o chat_id na mão.
 *
 * Observação: o Telegram só guarda as atualizações recentes (~24h) e apenas
 * enquanto não houver webhook configurado.
 */
export async function GET() {
  if (!sessaoAtual()) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim().replace(/^["']|["']$/g, "");
  if (!token) {
    return NextResponse.json({ chats: [], motivo: "sem_token" });
  }

  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?limit=100`
    );
    interface ChatTelegram {
      id?: number;
      type?: string;
      title?: string;
      first_name?: string;
      username?: string;
    }
    const dados = (await resp.json().catch(() => null)) as {
      ok?: boolean;
      result?: Array<{
        message?: { chat?: ChatTelegram };
        my_chat_member?: { chat?: ChatTelegram };
        channel_post?: { chat?: ChatTelegram };
      }>;
      description?: string;
    } | null;

    if (!resp.ok || !dados?.ok) {
      return NextResponse.json({
        chats: [],
        motivo: "erro",
        detalhe: dados?.description ?? "O Telegram recusou a consulta.",
      });
    }

    const mapa = new Map<string, ChatEncontrado>();
    for (const u of dados.result ?? []) {
      const chat =
        u.message?.chat ?? u.my_chat_member?.chat ?? u.channel_post?.chat;
      if (!chat?.id) continue;
      const id = String(chat.id);
      const nome =
        chat.title ||
        [chat.first_name, chat.username ? `@${chat.username}` : ""]
          .filter(Boolean)
          .join(" ") ||
        id;
      mapa.set(id, { id, nome, tipo: chat.type ?? "private" });
    }

    return NextResponse.json({
      chats: Array.from(mapa.values()),
      motivo: "ok",
    });
  } catch (err) {
    console.error("[telegram/chats] erro:", err);
    return NextResponse.json({ chats: [], motivo: "erro_rede" });
  }
}
