import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { formatarData, formatarMoeda, type Boleto } from "@/lib/boletos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Motivo = "ok" | "sem_token" | "sem_destinatarios";

interface Resultado {
  enviados: number;
  pendentes: number;
  motivo: Motivo;
}

function montarMensagem(b: Boleto, limite: number): string {
  const linhas = [
    "🔴 Boleto acima do limite de prazo",
    "",
    `🏢 Empresa: ${b.empresa || "—"}`,
    `👤 Sacado: ${b.sacado || "—"}`,
    `🔢 Nosso número: ${b.nosso_numero || "—"}`,
    `📄 Seu número: ${b.seu_numero || "—"}`,
    `📅 Entrada: ${formatarData(b.data_entrada)}`,
    `⏰ Vencimento: ${formatarData(b.data_vencimento)}`,
    `📆 Prazo: ${b.prazo_dias ?? "—"} dias (limite ${limite})`,
    `💰 Valor: ${formatarMoeda(b.valor)}`,
  ];
  return linhas.join("\n");
}

async function enviarTelegram(
  token: string,
  chatId: string,
  texto: string
): Promise<boolean> {
  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: texto }),
      }
    );
    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => "");
      console.error(`[telegram] envio falhou (chat ${chatId}):`, detalhe);
      return false;
    }
    const data = (await resp.json().catch(() => null)) as { ok?: boolean } | null;
    return Boolean(data?.ok);
  } catch (err) {
    console.error(`[telegram] erro de rede (chat ${chatId}):`, err);
    return false;
  }
}

/**
 * Dispara alertas de Telegram para boletos que excederam o limite e ainda não
 * foram alertados. Marca `alerta_enviado = true` apenas quando TODOS os envios
 * daquele boleto forem bem-sucedidos. Nunca reenvia.
 *
 * Body opcional: { ids?: string[] } para restringir a boletos específicos.
 */
export async function POST(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  let ids: string[] | undefined;
  try {
    const body = await req.json().catch(() => null);
    if (body && Array.isArray(body.ids)) ids = body.ids.map(String);
  } catch {
    // sem body — segue com todos os pendentes
  }

  const supabase = getSupabaseAdmin();

  // Boletos pendentes: excederam o limite e ainda não foram alertados.
  let query = supabase
    .from("boletos")
    .select("*")
    .eq("excedeu_limite", true)
    .eq("alerta_enviado", false);

  if (ids && ids.length > 0) query = query.in("id", ids);

  const { data: pendentesData, error } = await query;
  if (error) {
    console.error("[telegram] erro ao buscar boletos:", error);
    return NextResponse.json(
      { error: "Erro ao buscar boletos." },
      { status: 500 }
    );
  }

  const pendentesBoletos = (pendentesData ?? []) as Boleto[];
  const totalPendentes = pendentesBoletos.length;

  // Sem token configurado: não quebra, apenas informa.
  if (!token) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN não configurado — nada enviado.");
    const resultado: Resultado = {
      enviados: 0,
      pendentes: totalPendentes,
      motivo: "sem_token",
    };
    return NextResponse.json(resultado);
  }

  // Destinatários cadastrados.
  const { data: config } = await supabase
    .from("configuracoes")
    .select("limite_prazo_dias, telegram_chat_ids")
    .limit(1)
    .maybeSingle();

  const limite: number = config?.limite_prazo_dias ?? 60;
  const chatIds: string[] = Array.isArray(config?.telegram_chat_ids)
    ? (config!.telegram_chat_ids as string[]).filter(Boolean)
    : [];

  if (chatIds.length === 0) {
    const resultado: Resultado = {
      enviados: 0,
      pendentes: totalPendentes,
      motivo: "sem_destinatarios",
    };
    return NextResponse.json(resultado);
  }

  let enviados = 0;

  for (const boleto of pendentesBoletos) {
    const texto = montarMensagem(boleto, limite);

    // Envia para todos os destinatários; só marca se todos derem certo.
    let todosOk = true;
    for (const chatId of chatIds) {
      const ok = await enviarTelegram(token, chatId, texto);
      if (!ok) todosOk = false;
    }

    if (todosOk) {
      const { error: updErr } = await supabase
        .from("boletos")
        .update({ alerta_enviado: true })
        .eq("id", boleto.id);
      if (updErr) {
        console.error("[telegram] erro ao marcar alerta_enviado:", updErr);
      } else {
        enviados++;
      }
    }
  }

  const resultado: Resultado = {
    enviados,
    pendentes: totalPendentes - enviados,
    motivo: "ok",
  };
  return NextResponse.json(resultado);
}
