import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  chaveCompra,
  formatarData,
  formatarMoeda,
  type Boleto,
} from "@/lib/boletos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Motivo = "ok" | "sem_token" | "sem_destinatarios";

interface Resultado {
  enviados: number;
  pendentes: number;
  motivo: Motivo;
}

/**
 * Monta UMA mensagem por venda. Uma venda de R$ 10.000 em 4x gera um único
 * alerta com as parcelas listadas, em vez de quatro avisos separados.
 */
function montarMensagem(grupo: Boleto[], limite: number): string {
  const ordenado = [...grupo].sort((a, b) =>
    (a.data_vencimento ?? "").localeCompare(b.data_vencimento ?? "")
  );
  const primeiro = ordenado[0];
  const total = ordenado.reduce((s, b) => s + (b.valor ?? 0), 0);
  const prazoRecebimento =
    primeiro.prazo_recebimento ??
    Math.max(...ordenado.map((b) => b.prazo_dias ?? 0));

  const linhas = [
    "🔴 Venda acima do limite de prazo",
    "",
    `🏢 Empresa: ${primeiro.empresa || "—"}`,
    `👤 Cliente: ${primeiro.sacado || "—"}`,
    `📄 Documento: ${primeiro.documento || primeiro.seu_numero || "—"}`,
    `💰 Valor total: ${formatarMoeda(total)}`,
    `📅 Entrada: ${formatarData(primeiro.data_entrada)}`,
    `⏳ Prazo de recebimento: ${prazoRecebimento} dias (limite ${limite})`,
    "",
    ordenado.length > 1
      ? `📆 ${ordenado.length} parcelas:`
      : "📆 Parcela única:",
  ];

  for (const [i, b] of ordenado.entries()) {
    linhas.push(
      `   ${i + 1}/${ordenado.length} · ${formatarData(b.data_vencimento)} · ${formatarMoeda(
        b.valor
      )} · ${b.prazo_dias ?? "—"}d`
    );
  }

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
 * Dispara alertas para as VENDAS que excederam o limite e ainda não foram
 * avisadas. Marca `alerta_enviado = true` em todas as parcelas da venda apenas
 * quando todos os envios derem certo. Nunca reenvia.
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

  // Agrupa as parcelas por venda: um alerta por venda.
  const vendas = new Map<string, Boleto[]>();
  for (const b of pendentesBoletos) {
    const chave = chaveCompra(b);
    if (!vendas.has(chave)) vendas.set(chave, []);
    vendas.get(chave)!.push(b);
  }

  let enviados = 0;

  for (const grupo of vendas.values()) {
    const texto = montarMensagem(grupo, limite);

    let todosOk = true;
    for (const chatId of chatIds) {
      const ok = await enviarTelegram(token, chatId, texto);
      if (!ok) todosOk = false;
    }

    if (todosOk) {
      const { error: updErr } = await supabase
        .from("boletos")
        .update({ alerta_enviado: true })
        .in(
          "id",
          grupo.map((b) => b.id)
        );
      if (updErr) {
        console.error("[telegram] erro ao marcar alerta_enviado:", updErr);
      } else {
        enviados += grupo.length;
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
