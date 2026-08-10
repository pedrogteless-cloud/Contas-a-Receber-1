import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { agruparVendas, prazoMedioPonderado, valorTotal } from "@/lib/analytics";
import { formatarMoeda, type Boleto } from "@/lib/boletos";
import { dataPorExtenso, diasAte, hojeISO } from "@/lib/tempo";
import { registrarAuditoria, sessaoAtual } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resumo diário da carteira, enviado ao grupo do Telegram.
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

function montarResumo(boletos: Boleto[], limite: number): string {
  const hoje = hojeISO();

  const importadosHoje = boletos.filter((b) => b.data_importacao === hoje);
  const vendasHoje = agruparVendas(importadosHoje, limite);
  const vendasHojeAcima = vendasHoje.filter((v) => v.acimaLimite > 0);

  const carteira = valorTotal(boletos);
  const pmr = prazoMedioPonderado(boletos);

  const vencidos = boletos.filter((b) => {
    const d = diasAte(b.data_vencimento, hoje);
    return d != null && d < 0;
  });
  const proximos7 = boletos.filter((b) => {
    const d = diasAte(b.data_vencimento, hoje);
    return d != null && d >= 0 && d <= 7;
  });

  const linhas: string[] = [
    "📊 Resumo diário · Contas a Receber",
    `📅 ${dataPorExtenso()}`,
    "",
    "— Movimento de hoje —",
  ];

  if (importadosHoje.length === 0) {
    linhas.push("Nenhum boleto importado hoje.");
  } else {
    linhas.push(
      `📥 ${vendasHoje.length} venda(s) · ${importadosHoje.length} boleto(s) · ${formatarMoeda(
        valorTotal(importadosHoje)
      )}`
    );
    linhas.push(
      vendasHojeAcima.length > 0
        ? `🔴 ${vendasHojeAcima.length} venda(s) acima do limite de ${limite} dias`
        : `✅ Nenhuma venda acima do limite de ${limite} dias`
    );

    // Destaque das vendas mais longas do dia.
    const maisLongas = [...vendasHoje]
      .filter((v) => v.prazoUltima != null)
      .sort((a, b) => (b.prazoUltima ?? 0) - (a.prazoUltima ?? 0))
      .slice(0, 3);
    if (maisLongas.length > 0) {
      linhas.push("", "Maiores prazos de hoje:");
      for (const v of maisLongas) {
        const marca = v.acimaLimite > 0 ? "🔴" : "🟢";
        linhas.push(
          `${marca} ${v.sacado} · ${v.parcelas}x · ${formatarMoeda(
            v.valorTotal
          )} · ${v.prazoUltima}d`
        );
      }
    }
  }

  linhas.push(
    "",
    "— Carteira —",
    `💰 Total a receber: ${formatarMoeda(carteira)}`,
    `⏳ Prazo médio de recebimento: ${pmr != null ? `${pmr} dias` : "—"} (limite ${limite})`,
    `📆 Vencem em até 7 dias: ${proximos7.length} · ${formatarMoeda(
      valorTotal(proximos7)
    )}`
  );

  if (vencidos.length > 0) {
    linhas.push(
      `⚠️ Já vencidos: ${vencidos.length} · ${formatarMoeda(valorTotal(vencidos))}`
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

  const token = process.env.TELEGRAM_BOT_TOKEN;
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
    config?.limite_prazo_dias ?? 60
  );

  let enviados = 0;
  for (const chatId of chatIds) {
    if (await enviar(token, chatId, texto)) enviados++;
  }

  await registrarAuditoria(
    "telegram.resumo",
    `Resumo diário enviado para ${enviados} destinatário(s).`
  );

  return NextResponse.json({ ok: true, enviados, motivo: "ok" });
}

export async function GET(req: Request) {
  return executar(req);
}

export async function POST(req: Request) {
  return executar(req);
}
