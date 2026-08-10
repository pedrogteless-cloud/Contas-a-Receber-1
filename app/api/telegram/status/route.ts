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

  // Diagnóstico do formato antes de perguntar ao Telegram: o token é
  // "<id numérico>:<chave longa>". Erros de cópia (espaço, aspas, pedaço
  // faltando) são a causa mais comum de "Not Found".
  const limpo = token.trim().replace(/^["']|["']$/g, "");
  if (!/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(limpo)) {
    const pistas: string[] = [];
    if (token !== token.trim()) pistas.push("há espaço no início ou no fim");
    if (/^["']|["']$/.test(token.trim())) pistas.push("está entre aspas");
    if (!token.includes(":")) pistas.push("falta o ':' (parece incompleto)");
    else if (limpo.split(":")[1]?.length < 30)
      pistas.push("a parte depois do ':' está curta (cópia incompleta)");

    return NextResponse.json({
      configurado: false,
      motivo: "token_malformado",
      detalhe: pistas.length
        ? `O token não está no formato esperado: ${pistas.join("; ")}.`
        : "O token não está no formato esperado (deve ser algo como 8123456789:AAH...).",
    });
  }

  try {
    const resp = await fetch(`https://api.telegram.org/bot${limpo}/getMe`);
    const dados = (await resp.json().catch(() => null)) as {
      ok?: boolean;
      result?: { username?: string; first_name?: string };
      description?: string;
    } | null;

    if (!resp.ok || !dados?.ok) {
      return NextResponse.json({
        configurado: false,
        motivo: "token_invalido",
        detalhe:
          dados?.description === "Not Found"
            ? "O Telegram não reconheceu este token. Gere um novo com /mytoken no @BotFather e cole de novo na Vercel (sem espaços e sem aspas)."
            : (dados?.description ?? "Token recusado pelo Telegram."),
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
