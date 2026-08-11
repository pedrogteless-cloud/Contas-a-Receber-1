import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { type Boleto } from "@/lib/boletos";
import {
  agruparPedidos,
  classificarPrazo,
  lerLimites,
  type LimitesPrazo,
  type Pedido,
} from "@/lib/politica-prazo";
import { linhaPedido, moedaCurta } from "@/lib/telegram-formato";
import {
  avaliarPedido,
  chaveCliente,
  indexarAcordos,
  type Acordo,
} from "@/lib/acordos";

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
 * Monta os avisos de um grupo de pedidos, quebrando em várias mensagens quando
 * a lista não cabe em uma só. Cada lote carrega os ids que ele cobre, para que
 * só o que realmente chegou ao grupo seja marcado como avisado.
 */
function montarLotes(
  pedidos: Pedido[],
  cabecalho: (qtd: number, valor: number) => string
): Lote[] {
  const lotes: Lote[] = [];
  let bloco: Pedido[] = [];
  let tamanho = 0;

  function fechar() {
    if (bloco.length === 0) return;
    const total = bloco.reduce((s, p) => s + p.valorTotal, 0);
    lotes.push({
      // Linha em branco entre os blocos: sem ela, um pedido cola no seguinte.
      texto: [
        cabecalho(bloco.length, total),
        "",
        bloco.map(linhaPedido).join("\n\n"),
      ].join("\n"),
      ids: bloco.flatMap((p) => p.ids),
    });
    bloco = [];
    tamanho = 0;
  }

  for (const p of pedidos) {
    const linha = linhaPedido(p);
    if (bloco.length > 0 && tamanho + linha.length > MAX_CARACTERES) fechar();
    bloco.push(p);
    tamanho += linha.length + 2;
  }
  fechar();

  return lotes;
}

/**
 * Os dois avisos da política, em mensagens separadas e nesta ordem: o crítico
 * primeiro, para não ficar enterrado no meio das exceções.
 */
function montarAvisos(
  pedidos: Pedido[],
  limites: LimitesPrazo,
  acordos: Map<string, Acordo>
): { lotes: Lote[]; silenciados: string[] } {
  const naoPermitidos: Pedido[] = [];
  const excecoes: Pedido[] = [];
  const foraDoAcordo: Pedido[] = [];
  // Pedidos de clientes que o time já marcou como "estou ciente": não viram
  // aviso, mas são marcados como tratados para não ficarem pendentes para sempre.
  const silenciados: string[] = [];

  for (const p of pedidos) {
    const dataImportacao = p.boletos[0]?.data_importacao ?? null;
    const av = avaliarPedido(
      p.prazo,
      acordos.get(chaveCliente(p.sacado)),
      limites,
      dataImportacao
    );
    if (!av.alertar) {
      if (av.motivo === "silenciado") silenciados.push(...p.ids);
      continue;
    }
    if (av.motivo === "nao_permitido") naoPermitidos.push(p);
    else if (av.motivo === "fora_do_acordo") foraDoAcordo.push(p);
    else excecoes.push(p);
  }

  const lotes = [
    ...montarLotes(
      naoPermitidos,
      (qtd, valor) =>
        `🚨 ${qtd} pedido${qtd > 1 ? "s" : ""} ACIMA DE ${
          limites.maximo
        } DIAS · ${moedaCurta(valor)}\nPrazo não permitido pela política.`
    ),
    ...montarLotes(
      foraDoAcordo,
      (qtd, valor) =>
        `🤝 ${qtd} pedido${qtd > 1 ? "s" : ""} FORA DO ACORDO · ${moedaCurta(
          valor
        )}\nEstes clientes já tinham prazo combinado — e o pedido passou dele.`
    ),
    ...montarLotes(
      excecoes,
      (qtd, valor) =>
        `⚠️ ${qtd} exceç${qtd > 1 ? "ões" : "ão"} estratégica${
          qtd > 1 ? "s" : ""
        } · ${moedaCurta(valor)}\nPrazo de recebimento entre ${
          limites.normal + 1
        } e ${limites.maximo} dias.`
    ),
  ];

  return { lotes, silenciados };
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
 * Dispara os alertas dos PEDIDOS fora da política que ainda não foram
 * avisados. Marca `alerta_enviado = true` apenas quando todos os envios do
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

  // `select("*")` para não quebrar caso a coluna do limite máximo ainda não
  // exista no banco — lerLimites cai no padrão da política.
  const { data: config } = await supabase
    .from("configuracoes")
    .select("*")
    .limit(1)
    .maybeSingle();

  const limites = lerLimites(config);
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

  const { data: acordosData } = await supabase.from("acordos_prazo").select("*");
  const acordos = indexarAcordos((acordosData ?? []) as Acordo[]);

  const pedidos = agruparPedidos(pendentesBoletos);
  const { lotes, silenciados } = montarAvisos(pedidos, limites, acordos);
  let enviados = 0;

  // Quem está silenciado por acordo já fica resolvido: aparece nas telas como
  // acima do limite, mas não volta na fila de alertas todo dia.
  if (silenciados.length > 0) {
    await supabase
      .from("boletos")
      .update({ alerta_enviado: true })
      .in("id", silenciados);
  }

  for (const lote of lotes) {
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
    pendentes: totalPendentes - enviados - silenciados.length,
    motivo: "ok",
  };
  return NextResponse.json(resultado);
}
