import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { prazoMedioPonderado, valorTotal } from "@/lib/analytics";
import { type Boleto } from "@/lib/boletos";
import {
  agruparPedidos,
  desvioDaMeta,
  indicadoresPolitica,
  lerLimites,
  type DesvioMeta,
  type LimitesPrazo,
} from "@/lib/politica-prazo";
import { dataCurtaISO, hojeBrasilia } from "@/lib/tempo";
import {
  SEPARADOR,
  diasCurto,
  moedaCurta,
  nomeCompleto,
} from "@/lib/telegram-formato";
import {
  LIMIAR_CONCENTRACAO,
  lerNotificacoes,
  notificacaoAtiva,
  type MapaNotificacoes,
} from "@/lib/notificacoes";
import { registrarAuditoria, sessaoAtual } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fechamento do dia, enviado ao grupo do Telegram às 18h de Brasília
 * (o cron da Vercel roda em UTC: 21h UTC = 18h BRT).
 *
 * Pode ser disparado de dois jeitos:
 *  - pelo agendamento da Vercel (header Authorization: Bearer <CRON_SECRET>);
 *  - por um administrador logado, pelo botão em Configurações.
 */
function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (segredo) {
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${segredo}`) return true;
  }
  // Fallback: usuário logado (botão "Enviar resumo agora").
  return Boolean(sessaoAtual());
}

/** Abre um bloco novo: linha em branco, separador tracejado, título. */
function abrirBloco(linhas: string[], titulo: string) {
  linhas.push("", SEPARADOR, "", titulo);
}

/**
 * O fechamento é sobre O DIA: o que foi emitido, que prazo foi concedido e
 * quais pedidos saíram da política. A carteira inteira entra por último, como
 * pano de fundo.
 *
 * Escrito em blocos separados por linha tracejada, cada um com uma frase
 * dizendo do que se trata — a mensagem é lida rápido, no celular, por gente
 * que não abriu o sistema hoje.
 */
function montarResumo(
  boletos: Boleto[],
  limites: LimitesPrazo,
  hoje: string,
  avisos: MapaNotificacoes
): string {
  const doDia = boletos.filter((b) => b.data_importacao === hoje);
  const pedidosDoDia = agruparPedidos(doDia);
  const ind = indicadoresPolitica(
    pedidosDoDia.map((p) => ({
      prazo: p.prazo,
      valorTotal: p.valorTotal,
      media: prazoMedioPonderado(p.boletos),
    })),
    limites
  );

  const linhas: string[] = [
    `📊 Fechamento do dia · ${dataCurtaISO(hoje)}`,
    "",
    "Veja o que foi emitido hoje e como estamos em relação à meta de prazo médio concedido.",
  ];

  if (doDia.length === 0) {
    abrirBloco(linhas, "📥 O que entrou hoje");
    linhas.push(
      notificacaoAtiva(avisos, "dia_sem_importacao")
        ? "😴 Nenhum boleto foi importado hoje.\nSe houve emissão, o relatório do banco ainda não subiu no sistema."
        : "Nenhum boleto foi emitido hoje."
    );
  } else {
    const prazoDoDia = prazoMedioPonderado(doDia);
    const desvio = desvioDaMeta(prazoDoDia, limites.meta);

    abrirBloco(linhas, "📥 O que entrou hoje");
    linhas.push(
      `${pedidosDoDia.length} pedido${
        pedidosDoDia.length > 1 ? "s" : ""
      } · ${doDia.length} boleto${doDia.length > 1 ? "s" : ""} · ${moedaCurta(
        valorTotal(doDia)
      )} no total`,
      "",
      `${desvio?.emoji ?? "⏳"} Prazo médio concedido hoje: ${
        prazoDoDia != null ? `${diasCurto(prazoDoDia)} dias` : "—"
      }`,
      desvio
        ? `${desvio.texto} — a meta é ${limites.meta} dias`
        : `A meta é ${limites.meta} dias`
    );

    if (
      desvio &&
      !desvio.acimaDaMeta &&
      notificacaoAtiva(avisos, "meta_do_dia")
    ) {
      abrirBloco(linhas, "🎯 Meta do dia batida");
      linhas.push(
        `O prazo médio concedido hoje ficou dentro da meta de ${limites.meta} dias — ${desvio.texto}.`
      );
    }

    abrirBloco(linhas, "🚨 Pedidos fora do padrão");
    linhas.push(
      `Fora do padrão = o pedido produz prazo médio acima da meta de ${limites.meta} dias.`,
      ""
    );
    if (ind.foraDoPadrao.quantidade === 0) {
      linhas.push("✅ Nenhum pedido fora do padrão hoje.");
    } else {
      linhas.push(
        `${ind.foraDoPadrao.quantidade} pedido${
          ind.foraDoPadrao.quantidade > 1 ? "s" : ""
        } fora do padrão · ${moedaCurta(ind.foraDoPadrao.valor)}`
      );
      if (ind.naoPermitidos.quantidade > 0) {
        linhas.push(
          `  ⛔ ${ind.naoPermitidos.quantidade} dele${
            ind.naoPermitidos.quantidade > 1 ? "s" : ""
          } acima de ${limites.maximo} dias, o que não é permitido · ${moedaCurta(
            ind.naoPermitidos.valor
          )}`
        );
      }
    }

    // Quem puxou a média para cima hoje — é aqui que o trabalho continua.
    const porCliente = clientesDoDia(doDia, limites);
    const acimaDaMeta = porCliente.filter((c) => c.desvio?.acimaDaMeta);
    const dentro = porCliente.filter((c) => c.desvio && !c.desvio.acimaDaMeta);
    if (acimaDaMeta.length > 0 || dentro.length > 0) {
      abrirBloco(linhas, "👥 Quem puxou a média para cima hoje");
      if (acimaDaMeta.length > 0) {
        linhas.push(
          `Estes clientes emitiram boleto hoje com prazo acima da meta de ${limites.meta} dias:`,
          ""
        );
        for (const c of acimaDaMeta.slice(0, 5)) {
          linhas.push(
            `• ${c.nome} · ${diasCurto(c.prazo)} dias · ${c.desvio!.texto}`
          );
        }
      } else {
        linhas.push("Nenhum cliente ficou acima da meta hoje. 🎉");
      }
      if (dentro.length > 0) {
        linhas.push(
          "",
          `✅ ${dentro.length} cliente${
            dentro.length > 1 ? "s" : ""
          } ficou${dentro.length > 1 ? "ram" : ""} dentro da meta hoje.`
        );
      }
    }
  }

  // A carteira inteira, também contra a meta.
  const pmr = prazoMedioPonderado(boletos);
  const desvioCarteira = desvioDaMeta(pmr, limites.meta);
  abrirBloco(linhas, "📦 Carteira inteira (todos os boletos ativos)");
  linhas.push(
    `Prazo médio concedido: ${pmr != null ? `${diasCurto(pmr)} dias` : "—"}`
  );
  if (desvioCarteira) {
    linhas.push(`${desvioCarteira.texto} — a meta é ${limites.meta} dias`);
  }

  if (notificacaoAtiva(avisos, "concentracao_cliente")) {
    const concentrado = maiorConcentracao(boletos);
    if (concentrado && concentrado.fatia >= LIMIAR_CONCENTRACAO) {
      abrirBloco(linhas, "📈 Concentração de carteira");
      linhas.push(
        `${concentrado.nome} responde por ${Math.round(
          concentrado.fatia * 100
        )}% de tudo que há a receber (${moedaCurta(concentrado.valor)}).`
      );
    }
  }

  return linhas.join("\n");
}

/** O cliente com a maior fatia da carteira. */
function maiorConcentracao(
  boletos: Boleto[]
): { nome: string; valor: number; fatia: number } | null {
  const total = valorTotal(boletos);
  if (total <= 0) return null;

  const porCliente = new Map<string, number>();
  for (const b of boletos) {
    const nome = b.sacado || "—";
    porCliente.set(nome, (porCliente.get(nome) ?? 0) + (b.valor ?? 0));
  }

  let melhor: { nome: string; valor: number } | null = null;
  for (const [nome, valor] of porCliente) {
    if (!melhor || valor > melhor.valor) melhor = { nome, valor };
  }
  return melhor
    ? { nome: nomeCompleto(melhor.nome), valor: melhor.valor, fatia: melhor.valor / total }
    : null;
}

/** Prazo médio concedido de cada cliente que emitiu boleto hoje. */
function clientesDoDia(
  doDia: Boleto[],
  limites: LimitesPrazo
): { nome: string; prazo: number; desvio: DesvioMeta | null }[] {
  const grupos = new Map<string, Boleto[]>();
  for (const b of doDia) {
    const chave = b.sacado || "—";
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(b);
  }

  return Array.from(grupos.entries())
    .map(([nome, lista]) => {
      const prazo = prazoMedioPonderado(lista);
      return {
        nome: nomeCompleto(nome),
        prazo: prazo ?? 0,
        desvio: desvioDaMeta(prazo, limites.meta),
      };
    })
    .filter((c) => c.prazo > 0)
    .sort((a, b) => b.prazo - a.prazo);
}

async function enviar(token: string, chatId: string, texto: string) {
  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texto }),
  });
  const dados = (await resp.json().catch(() => null)) as { ok?: boolean } | null;
  return Boolean(resp.ok && dados?.ok);
}

async function executar(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim().replace(/^["']|["']$/g, "");
  if (!token) {
    return NextResponse.json({ ok: false, motivo: "sem_token" });
  }

  const supabase = getSupabaseAdmin();

  // `select("*")` para não quebrar caso a coluna do limite máximo ainda não
  // exista no banco — lerLimites cai no padrão da política.
  const [{ data: boletosData }, { data: config }] = await Promise.all([
    supabase.from("boletos").select("*"),
    supabase.from("configuracoes").select("*").limit(1).maybeSingle(),
  ]);

  const chatIds: string[] = Array.isArray(config?.telegram_chat_ids)
    ? (config!.telegram_chat_ids as string[]).filter(Boolean)
    : [];

  if (chatIds.length === 0) {
    return NextResponse.json({ ok: false, motivo: "sem_destinatarios" });
  }

  const avisos = lerNotificacoes(config);
  if (!notificacaoAtiva(avisos, "fechamento_dia")) {
    return NextResponse.json({ ok: false, motivo: "aviso_desligado" });
  }

  const texto = montarResumo(
    (boletosData ?? []) as Boleto[],
    lerLimites(config),
    hojeBrasilia(),
    avisos
  );

  let enviados = 0;
  for (const chatId of chatIds) {
    if (await enviar(token, chatId, texto)) enviados++;
  }

  await registrarAuditoria(
    "telegram.resumo",
    `Fechamento do dia enviado para ${enviados} destinatário(s).`
  );

  return NextResponse.json({ ok: true, enviados, motivo: "ok" });
}

export async function GET(req: Request) {
  return executar(req);
}

export async function POST(req: Request) {
  return executar(req);
}
