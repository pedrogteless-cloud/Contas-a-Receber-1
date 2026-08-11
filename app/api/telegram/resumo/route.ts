import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { prazoMedioPonderado, valorTotal } from "@/lib/analytics";
import { type Boleto } from "@/lib/boletos";
import { dataCurtaISO, diasAte, hojeBrasilia } from "@/lib/tempo";
import {
  agruparParaTelegram,
  diasCurto,
  moedaCurta,
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
 * O resumo é sobre O DIA: quanto foi importado, que prazo foi concedido hoje e
 * quais vendas puxaram esse prazo para cima. A carteira inteira entra só como
 * uma linha de contexto no rodapé.
 */
function montarResumo(boletos: Boleto[], limite: number, hoje: string): string {
  const doDia = boletos.filter((b) => b.data_importacao === hoje);
  const vendasDoDia = agruparParaTelegram(doDia);

  const linhas: string[] = [`📊 Fechamento do dia · ${dataCurtaISO(hoje)}`, ""];

  if (doDia.length === 0) {
    linhas.push("Nenhuma importação hoje.");
  } else {
    const prazoDoDia = prazoMedioPonderado(doDia);
    const acima = vendasDoDia.filter(
      (v) => v.prazo != null && v.prazo > limite
    );

    linhas.push(
      `📥 ${vendasDoDia.length} venda${
        vendasDoDia.length > 1 ? "s" : ""
      } · ${doDia.length} boleto${doDia.length > 1 ? "s" : ""} · ${moedaCurta(
        valorTotal(doDia)
      )}`,
      `⏳ Prazo médio dado hoje: ${
        prazoDoDia != null ? `${diasCurto(prazoDoDia)} dias` : "—"
      }`,
      acima.length > 0
        ? `🔴 ${acima.length} prazo${
            acima.length > 1 ? "s" : ""
          } de recebimento acima de ${limite}d · ${moedaCurta(
            acima.reduce((s, v) => s + v.valorTotal, 0)
          )}`
        : `🟢 Nenhum prazo de recebimento acima de ${limite}d`
    );

    // agruparParaTelegram já devolve ordenado do maior prazo para o menor.
    const destaques = vendasDoDia.filter((v) => v.prazo != null).slice(0, 3);
    if (destaques.length > 0) {
      linhas.push("", "🔝 Maiores prazos de recebimento de hoje");
      destaques.forEach((v, i) => {
        linhas.push(
          `${i + 1}. ${v.sacado} · ${v.empresa} · ${moedaCurta(
            v.valorTotal
          )} · ${v.prazo}d`
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
    `📦 Carteira ${moedaCurta(valorTotal(boletos))} · PMR ${
      pmr != null ? `${diasCurto(pmr)}d` : "—"
    } · ${proximos7.length} vence(m) em 7d`
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

  const [{ data: boletosData }, { data: config }] = await Promise.all([
    supabase.from("boletos").select("*"),
    supabase
      .from("configuracoes")
      .select("limite_prazo_dias, telegram_chat_ids")
      .limit(1)
      .maybeSingle(),
  ]);

  const chatIds: string[] = Array.isArray(config?.telegram_chat_ids)
    ? (config!.telegram_chat_ids as string[]).filter(Boolean)
    : [];

  if (chatIds.length === 0) {
    return NextResponse.json({ ok: false, motivo: "sem_destinatarios" });
  }

  const texto = montarResumo(
    (boletosData ?? []) as Boleto[],
    config?.limite_prazo_dias ?? 60,
    hojeBrasilia()
  );

  let enviados = 0;
  for (const chatId of chatIds) {
    if (await enviar(token, chatId, texto)) enviados++;
  }

  await registrarAuditoria(
    "telegram.resumo",
    `Resumo do dia enviado para ${enviados} destinatário(s).`
  );

  return NextResponse.json({ ok: true, enviados, motivo: "ok" });
}

export async function GET(req: Request) {
  return executar(req);
}

export async function POST(req: Request) {
  return executar(req);
}
