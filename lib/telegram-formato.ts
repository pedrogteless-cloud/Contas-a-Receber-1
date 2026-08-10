// ---------------------------------------------------------------------------
// lib/telegram-formato.ts
// Formatação curta das mensagens do Telegram.
//
// As mensagens são lidas no celular, no fim do expediente, logo depois da
// importação do dia. Por isso cada venda ocupa duas linhas — não um bloco com
// todas as parcelas. Compartilhado entre o alerta de limite e o resumo diário.
// ---------------------------------------------------------------------------

import { abreviarNome, chaveVenda, type Boleto } from "./boletos";

/** "Ley Móveis" → "Móveis". O grupo já sabe de que empresa se trata. */
export function empresaCurta(nome: string | null | undefined): string {
  const n = (nome ?? "").trim();
  if (!n) return "—";
  return n.replace(/^ley\s+/i, "");
}

/** "R$ 10.000" — sem centavos, que só atrapalham a leitura rápida. */
export function moedaCurta(valor: number): string {
  return `R$ ${Math.round(valor).toLocaleString("pt-BR")}`;
}

/** "68,4" — vírgula decimal, como todo número em português. */
export function diasCurto(dias: number): string {
  return dias.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export interface VendaResumida {
  chave: string;
  sacado: string;
  empresa: string;
  valorTotal: number;
  parcelas: number;
  /** Dias até a última parcela — o prazo que representa a decisão de crédito. */
  prazo: number | null;
  ids: string[];
}

/**
 * Agrupa boletos por venda, já ordenados do maior prazo para o menor.
 *
 * Usa o `prazo_recebimento` gravado na importação, que considera a venda
 * inteira — importante quando só parte das parcelas está neste lote.
 */
export function agruparParaTelegram(boletos: Boleto[]): VendaResumida[] {
  const grupos = new Map<string, Boleto[]>();
  for (const b of boletos) {
    const chave = chaveVenda(b);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(b);
  }

  return Array.from(grupos.entries())
    .map(([chave, lista]) => {
      const primeiro = lista[0];
      const prazos = lista
        .map((b) => b.prazo_dias)
        .filter((p): p is number => typeof p === "number");
      return {
        chave,
        sacado: abreviarNome(primeiro.sacado ?? ""),
        empresa: empresaCurta(primeiro.empresa),
        valorTotal: lista.reduce((s, b) => s + (b.valor ?? 0), 0),
        parcelas: primeiro.total_parcelas ?? lista.length,
        prazo:
          primeiro.prazo_recebimento ??
          (prazos.length > 0 ? Math.max(...prazos) : null),
        ids: lista.map((b) => b.id),
      };
    })
    .sort((a, b) => (b.prazo ?? 0) - (a.prazo ?? 0));
}

/** Duas linhas por venda: quem e onde, depois valor, parcelas e prazo. */
export function linhaVenda(v: VendaResumida): string {
  const dados = [moedaCurta(v.valorTotal), `${v.parcelas}x`];
  if (v.prazo != null) dados.push(`${v.prazo}d`);
  return `• ${v.sacado} · ${v.empresa}\n  ${dados.join(" · ")}`;
}
