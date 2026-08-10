import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { type Boleto } from "@/lib/boletos";
import {
  agruparParaTelegram,
  linhaVenda,
  moedaCurta,
  type VendaResumida,
} from "@/lib/telegram-formato";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Motivo = "ok" | "sem_token" | "sem_destinatarios";

interface Resultado {
  enviados: number;
  pendentes: number;
  motivo: Motivo;
}

/** O Telegram corta em 4096 caracteres; paramos antes, com folga. */
const MAX_CARACTERES = 3500;

interface Lote {
  texto: string;
  ids: string[];
}

/**
 * Junta TODAS as vendas acima do limite num aviso só — ou em poucos, quando a
 * lista é longa demais para uma mensagem.
 *
 * Antes saía uma mensagem comprida por venda, com todas as parcelas listadas.
 * Como a importação acontece no fim do expediente, isso enchia o grupo de
 * blocos que ninguém conseguia ler de relance.
 */
function montarLotes(vendas: VendaResumida[], limite: number): Lote[] {
  const lotes: Lote[] = [];
  let bloco: VendaResumida[] = [];
  let tamanho = 0;

  function fechar() {
    if (bloco.length === 0) return;
    const total = bloco.reduce((s, v) => s + v.valorTotal, 0);
    const titulo = `🔴 ${bloco.length} venda${
      bloco.length > 1 ? "s" : ""
    } acima de ${limite} dias · ${moedaCurta(total)}`;
    lotes.push({
      texto: [titulo, "", ...bloco.map(linhaVenda)].join("\n"),
      ids: bloco.flatMap((v) => v.ids),
    });
    bloco = [];
    tamanho = 0;
  }

  for (const v of vendas) {
    const linha = linhaVenda(v);
    if (bloco.length > 0 && tamanho + linha.length > MAX_CARACTERES) fechar();
    bloco.push(v);
    tamanho += linha.length + 1;
  }
  fechar();

  return lotes;
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
 * Dispara os alertas das VENDAS que excederam o limite e ainda não foram
 * avisadas. Marca `alerta_enviado = true` apenas quando todos os envios do
 * lote deram certo. Nunca reenvia.
 *
 * Body opcional: { ids?: string[] } para restringir a boletos específicos.
 */
export async function POST(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim().replace(/^["']|["']$/g, "");

  let ids: string[] | undefined;
  try {
    const body = await req.json().catch(() => null);
    if (body && Array.isArray(body.ids)) ids = body.ids.map(String);
  } catch {
    // sem body — segue com todos os pendentes
  }

  const supabase = getSupabaseAdmin();

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

  if (!token) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN não configurado — nada enviado.");
    const resultado: Resultado = {
      enviados: 0,
      pendentes: totalPendentes,
      motivo: "sem_token",
    };
    return NextResponse.json(resultado);
  }

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

  const vendas = agruparParaTelegram(pendentesBoletos);
  let enviados = 0;

  for (const lote of montarLotes(vendas, limite)) {
    let todosOk = true;
    for (const chatId of chatIds) {
      const ok = await enviarTelegram(token, chatId, lote.texto);
      if (!ok) todosOk = false;
    }
    if (!todosOk) continue;

    const { error: updErr } = await supabase
      .from("boletos")
      .update({ alerta_enviado: true })
      .in("id", lote.ids);
    if (updErr) {
      console.error("[telegram] erro ao marcar alerta_enviado:", updErr);
    } else {
      enviados += lote.ids.length;
    }
  }

  const resultado: Resultado = {
    enviados,
    pendentes: totalPendentes - enviados,
    motivo: "ok",
  };
  return NextResponse.json(resultado);
}
