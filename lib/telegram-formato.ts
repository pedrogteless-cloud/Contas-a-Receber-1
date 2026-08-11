// ---------------------------------------------------------------------------
// lib/telegram-formato.ts
// Formatação curta das mensagens do Telegram.
//
// As mensagens são lidas no celular, no fim do expediente, logo depois da
// importação do dia. Por isso TUDO que passou do limite cabe em um aviso só,
// em vez de uma mensagem por prazo de recebimento. Compartilhado entre o
// alerta de limite e o fechamento do dia.
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

/** "10/09" — dia e mês bastam; o ano se entende pelo contexto. */
export function vencimentoCurto(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [, mes, dia] = iso.slice(0, 10).split("-");
  return mes && dia ? `${dia}/${mes}` : "—";
}

/** Um título (boleto) da venda, como aparece listado no alerta. */
export interface TituloResumido {
  parcela: number | null;
  totalParcelas: number;
  vencimento: string | null;
  valor: number;
  prazo: number | null;
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
  /** Os títulos que compõem esse prazo de recebimento, do 1º ao último. */
  titulos: TituloResumido[];
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
      const ordenada = [...lista].sort((a, b) =>
        (a.data_vencimento ?? "").localeCompare(b.data_vencimento ?? "")
      );
      const primeiro = ordenada[0];
      const prazos = ordenada
        .map((b) => b.prazo_dias)
        .filter((p): p is number => typeof p === "number");
      const totalParcelas = primeiro.total_parcelas ?? ordenada.length;
      return {
        chave,
        sacado: abreviarNome(primeiro.sacado ?? ""),
        empresa: empresaCurta(primeiro.empresa),
        valorTotal: ordenada.reduce((s, b) => s + (b.valor ?? 0), 0),
        parcelas: totalParcelas,
        prazo:
          primeiro.prazo_recebimento ??
          (prazos.length > 0 ? Math.max(...prazos) : null),
        ids: ordenada.map((b) => b.id),
        titulos: ordenada.map((b) => ({
          parcela: b.parcela ?? null,
          totalParcelas,
          vencimento: b.data_vencimento ?? null,
          valor: b.valor ?? 0,
          prazo: b.prazo_dias ?? null,
        })),
      };
    })
    .sort((a, b) => (b.prazo ?? 0) - (a.prazo ?? 0));
}

/**
 * Um prazo de recebimento acima do limite, com TODOS os seus títulos listados
 * logo abaixo — é o detalhe que o time precisa para conferir sem abrir o app.
 */
export function linhaVenda(v: VendaResumida): string {
  const linhas = [
    `• ${v.sacado} · ${v.empresa}`,
    `  ${moedaCurta(v.valorTotal)} · ${v.parcelas}x · recebimento em ${
      v.prazo != null ? `${v.prazo}d` : "—"
    }`,
  ];
  for (const t of v.titulos) {
    const ordem =
      t.parcela != null ? `${t.parcela}/${t.totalParcelas}` : `·/${t.totalParcelas}`;
    linhas.push(
      `    ${ordem} · ${vencimentoCurto(t.vencimento)} · ${moedaCurta(
        t.valor
      )} · ${t.prazo != null ? `${t.prazo}d` : "—"}`
    );
  }
  return linhas.join("\n");
}
