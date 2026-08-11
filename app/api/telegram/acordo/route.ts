import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { moedaCurta } from "@/lib/telegram-formato";
import { lerNotificacoes, notificacaoAtiva } from "@/lib/notificacoes";
import { registrarAuditoria, sessaoAtual } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Avisa o grupo quando um cliente aceita ENCURTAR o prazo.
 *
 * O Telegram do time só recebia notícia ruim: pedido fora da política, prazo
 * estourado. Uma redução negociada é trabalho comercial que deu certo, e é
 * justo que apareça — em tom leve, sem virar festa a cada clique.
 *
 * Só dispara quando o prazo realmente diminuiu. Ajustar um acordo para cima,
 * ou registrar um cliente que ainda não tinha histórico, não gera mensagem.
 */
export async function POST(req: Request) {
  const s = sessaoAtual();
  if (!s) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    cliente?: string;
    condicaoAnterior?: string | null;
    prazoAnterior?: number | null;
    condicaoNova?: string | null;
    prazoNovo?: number | null;
    valorCarteira?: number | null;
  } | null;

  const cliente = String(body?.cliente ?? "").trim();
  const antes = body?.prazoAnterior;
  const depois = body?.prazoNovo;

  // Sem redução comprovada, não há o que comemorar.
  if (
    !cliente ||
    typeof antes !== "number" ||
    typeof depois !== "number" ||
    depois >= antes
  ) {
    return NextResponse.json({ ok: false, motivo: "sem_reducao" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim().replace(/^["']|["']$/g, "");
  if (!token) return NextResponse.json({ ok: false, motivo: "sem_token" });

  const supabase = getSupabaseAdmin();
  const { data: config } = await supabase
    .from("configuracoes")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (!notificacaoAtiva(lerNotificacoes(config), "acordo_reducao")) {
    return NextResponse.json({ ok: false, motivo: "aviso_desligado" });
  }

  const chatIds: string[] = Array.isArray(config?.telegram_chat_ids)
    ? (config!.telegram_chat_ids as string[]).filter(Boolean)
    : [];
  if (chatIds.length === 0) {
    return NextResponse.json({ ok: false, motivo: "sem_destinatarios" });
  }

  const ganho = antes - depois;
  const linhas = [
    "🎉 Redução do prazo médio concedido",
    "",
    `👤 ${cliente}`,
    `📉 ${body?.condicaoAnterior ?? `${antes}d`} → ${
      body?.condicaoNova ?? `${depois}d`
    }`,
    `   ${antes}d → ${depois}d · ${ganho} dia${ganho > 1 ? "s" : ""} a menos`,
  ];

  if (typeof body?.valorCarteira === "number" && body.valorCarteira > 0) {
    linhas.push(`💰 Carteira do cliente: ${moedaCurta(body.valorCarteira)}`);
  }

  linhas.push("", `📝 Acordo registrado pelo usuário: ${s.nome}`);
  const texto = linhas.join("\n");

  let enviados = 0;
  for (const chatId of chatIds) {
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
      } | null;
      if (resp.ok && dados?.ok) enviados++;
    } catch (err) {
      console.error("[telegram/acordo] erro ao enviar:", err);
    }
  }

  await registrarAuditoria(
    "acordo.reducao",
    `${cliente}: ${antes}d → ${depois}d (${ganho} dias a menos).`,
    s
  );

  return NextResponse.json({ ok: true, enviados, ganho });
}
