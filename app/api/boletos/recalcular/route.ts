import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { lerLimites } from "@/lib/politica-prazo";
import { ehAdmin } from "@/lib/auth";
import { calcularDadosVenda, type Boleto } from "@/lib/boletos";
import { registrarAuditoria, sessaoAtual } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reaplica o limite e a regra atuais a TODOS os boletos já importados.
 *
 * `excedeu_limite` é gravado no momento da importação; quando o limite muda
 * (ex.: 60 -> 120 dias), os registros antigos ficariam com a marcação velha.
 * Esta rota recalcula o prazo de recebimento de cada venda e a marcação.
 *
 * Não mexe em `alerta_enviado`: o que já foi avisado continua avisado (não
 * reenvia), e o que passa a exceder entra na fila de alertas normalmente.
 */
export async function POST() {
  const s = sessaoAtual();
  if (!ehAdmin(s?.papel)) {
    return NextResponse.json(
      { erro: "Apenas o administrador pode recalcular." },
      { status: 403 }
    );
  }

  const supabase = getSupabaseAdmin();

  const [{ data: boletosData, error }, { data: config }] = await Promise.all([
    supabase.from("boletos").select("*"),
    supabase
      .from("configuracoes")
      .select("*")
      .limit(1)
      .maybeSingle(),
  ]);

  if (error) {
    console.error("[recalcular] erro ao ler boletos:", error);
    return NextResponse.json({ erro: "Erro ao ler os boletos." }, { status: 500 });
  }

  const boletos = (boletosData ?? []) as Boleto[];
  if (boletos.length === 0) {
    return NextResponse.json({ ok: true, atualizados: 0, acima: 0 });
  }

  const limites = lerLimites(config);
  const limite = limites.normal;
  const regra = (config?.regra_limite as "venda" | "boleto") ?? "venda";

  // Recalcula documento/parcela/prazo de recebimento agrupando por venda.
  const dados = calcularDadosVenda(boletos);

  let atualizados = 0;
  let acima = 0;

  for (const [i, b] of boletos.entries()) {
    const v = dados[i];
    const prazoAvaliado =
      regra === "venda" ? (v.prazo_recebimento ?? b.prazo_dias) : b.prazo_dias;
    const excedeu = prazoAvaliado != null && prazoAvaliado > limite;
    if (excedeu) acima++;

    const mudou =
      b.excedeu_limite !== excedeu ||
      b.prazo_recebimento !== v.prazo_recebimento ||
      (b.documento ?? null) !== (v.documento || null) ||
      (b.parcela ?? null) !== v.parcela ||
      (b.total_parcelas ?? null) !== v.total_parcelas;

    if (!mudou) continue;

    const { error: updErr } = await supabase
      .from("boletos")
      .update({
        documento: v.documento || null,
        parcela: v.parcela,
        total_parcelas: v.total_parcelas,
        prazo_recebimento: v.prazo_recebimento,
        excedeu_limite: excedeu,
      })
      .eq("id", b.id);

    if (updErr) {
      console.error("[recalcular] erro ao atualizar boleto:", updErr);
      continue;
    }
    atualizados++;
  }

  await registrarAuditoria(
    "boletos.recalculados",
    `Reaplicou o limite de ${limite} dias (regra: ${regra}). ${atualizados} boleto(s) atualizado(s); ${acima} acima do limite.`,
    s
  );

  return NextResponse.json({ ok: true, atualizados, acima, limite, regra });
}
