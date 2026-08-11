import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { prazoMedioPonderado, valorTotal } from "@/lib/analytics";
import { abreviarNome, type Boleto } from "@/lib/boletos";
import {
  agruparPedidos,
  indicadoresPolitica,
  lerLimites,
  type LimitesPrazo,
} from "@/lib/politica-prazo";
import { dataCurtaISO, diasAte, hojeBrasilia } from "@/lib/tempo";
import {
  diasCurto,
  empresaCurta,
  moedaCurta,
  vencimentoCurto,
} from "@/lib/telegram-formato";
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

/**
 * O fechamento é sobre O DIA: o que foi emitido, que prazo foi concedido e
 * quais pedidos saíram da política. A carteira inteira entra só como uma linha
 * de contexto no rodapé.
 */
function montarResumo(
  boletos: Boleto[],
  limites: LimitesPrazo,
  hoje: string
): string {
  const doDia = boletos.filter((b) => b.data_importacao === hoje);
  const pedidosDoDia = agruparPedidos(doDia);
  const ind = indicadoresPolitica(pedidosDoDia, limites);

  const linhas: string[] = [`📊 Fechamento do dia · ${dataCurtaISO(hoje)}`, ""];

  if (doDia.length === 0) {
    linhas.push("Nenhum boleto emitido hoje.");
  } else {
    const prazoDoDia = prazoMedioPonderado(doDia);

    linhas.push(
      `📥 ${pedidosDoDia.length} pedido${
        pedidosDoDia.length > 1 ? "s" : ""
      } · ${doDia.length} boleto${doDia.length > 1 ? "s" : ""} · ${moedaCurta(
        valorTotal(doDia)
      )}`,
      `⏳ Prazo médio concedido hoje: ${
        prazoDoDia != null
          ? `${diasCurto(prazoDoDia)} dias ${
              prazoDoDia <= limites.meta ? "✅" : "🔺"
            } (meta ${limites.meta})`
          : "—"
      }`,
      ""
    );

    if (ind.acimaDoNormal.quantidade === 0) {
      linhas.push(`✅ Nenhum pedido acima de ${limites.normal} dias.`);
    } else {
      linhas.push(
        `Último vencimento acima de ${limites.normal} dias: ${
          ind.acimaDoNormal.quantidade
        } · ${moedaCurta(ind.acimaDoNormal.valor)}`,
        `  ⚠️ Exceções estratégicas (${limites.normal + 1}–${
          limites.maximo
        }d): ${ind.excecoes.quantidade} · ${moedaCurta(ind.excecoes.valor)}`,
        `  🚨 Acima de ${limites.maximo}d: ${
          ind.naoPermitidos.quantidade
        } · ${moedaCurta(ind.naoPermitidos.valor)}`
      );
    }

    // agruparPedidos já devolve ordenado do maior prazo para o menor.
    const destaques = pedidosDoDia.filter((p) => p.prazo != null).slice(0, 3);
    if (destaques.length > 0) {
      linhas.push("", "🔝 Maiores prazos de recebimento de hoje");
      destaques.forEach((p, i) => {
        linhas.push(
          `${i + 1}. ${abreviarNome(p.sacado)} · ${empresaCurta(
            p.empresa
          )} · ${moedaCurta(p.valorTotal)} · ${
            p.prazo
          }d (venc. ${vencimentoCurto(p.ultimoVencimento)})`
        );
      });
    }
  }

  // Rodapé: a carteira toda em uma linha, para não perder a visão do conjunto.
  const pmr = prazoMedioPonderado(boletos);
  const proximos7 = boletos.filter((b) => {
    const d = diasAte(b.data_vencimento, hoje);
    return d != null && d >= 0 && d <= 7;
  });
  linhas.push(
    "",
    `📦 Carteira ${moedaCurta(valorTotal(boletos))} · prazo médio concedido ${
      pmr != null ? `${diasCurto(pmr)}d` : "—"
    } (meta ${limites.meta}d) · ${proximos7.length} vence(m) em 7d`
  );

  const vencidos = boletos.filter((b) => {
    const d = diasAte(b.data_vencimento, hoje);
    return d != null && d < 0;
  });
  if (vencidos.length > 0) {
    linhas.push(
      `⚠️ ${vencidos.length} vencido(s) · ${moedaCurta(valorTotal(vencidos))}`
    );
  }

  return linhas.join("\n");
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

  const texto = montarResumo(
    (boletosData ?? []) as Boleto[],
    lerLimites(config),
    hojeBrasilia()
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
