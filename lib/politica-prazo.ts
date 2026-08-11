// ---------------------------------------------------------------------------
// lib/politica-prazo.ts
// A política de prazo de recebimento do Grupo Ley.
//
// A regra vale sobre o PEDIDO (a venda inteira), pelo vencimento do ÚLTIMO
// título — não parcela a parcela:
//
//   até o limite normal ............ NORMAL
//   entre o normal e o máximo ...... EXCEÇÃO ESTRATÉGICA  (gera alerta)
//   acima do máximo ................ NÃO PERMITIDO        (alerta crítico)
//
// Mantido separado das telas e do Telegram porque é regra de negócio: muda por
// decisão da diretoria, não por causa de layout.
// ---------------------------------------------------------------------------

import { chaveVenda, documentoEParcela, type Boleto } from "./boletos";

export type StatusPrazo = "normal" | "excecao" | "nao_permitido";

export interface LimitesPrazo {
  /** Até aqui o prazo é livre. Padrão da política: 150 dias. */
  normal: number;
  /** Acima daqui o prazo não é permitido. Padrão da política: 180 dias. */
  maximo: number;
}

export const LIMITES_PADRAO: LimitesPrazo = { normal: 150, maximo: 180 };

/**
 * Lê os limites da tabela `configuracoes`, tolerando o formato antigo (só
 * `limite_prazo_dias`) e a ausência da coluna do limite máximo.
 */
export function lerLimites(
  config:
    | { limite_prazo_dias?: number | null; limite_maximo_dias?: number | null }
    | null
    | undefined
): LimitesPrazo {
  const normal = config?.limite_prazo_dias ?? LIMITES_PADRAO.normal;
  const maximo = config?.limite_maximo_dias ?? LIMITES_PADRAO.maximo;
  // Um máximo abaixo do normal deixaria a faixa de exceção vazia e faria todo
  // pedido longo cair direto em "não permitido". Preferimos ignorar o valor.
  return { normal, maximo: Math.max(maximo, normal) };
}

/** Em que faixa da política esse prazo de recebimento cai. */
export function classificarPrazo(
  prazo: number | null | undefined,
  limites: LimitesPrazo
): StatusPrazo | null {
  if (typeof prazo !== "number") return null;
  if (prazo <= limites.normal) return "normal";
  if (prazo <= limites.maximo) return "excecao";
  return "nao_permitido";
}

export const STATUS: Record<
  StatusPrazo,
  { rotulo: string; curto: string; emoji: string }
> = {
  normal: { rotulo: "Normal", curto: "Normal", emoji: "🟢" },
  excecao: {
    rotulo: "Exceção estratégica",
    curto: "Exceção",
    emoji: "⚠️",
  },
  nao_permitido: {
    rotulo: "Não permitido",
    curto: "Não permitido",
    emoji: "🚨",
  },
};

/** "30/60/90" — a condição de pagamento, lida dos prazos das parcelas. */
export function condicaoPagamento(prazos: number[]): string {
  const ordenados = [...prazos].filter((p) => typeof p === "number").sort((a, b) => a - b);
  if (ordenados.length === 0) return "—";
  if (ordenados.length === 1) return `${ordenados[0]}`;
  // Listas muito longas não cabem numa linha de mensagem; resumimos as pontas.
  if (ordenados.length > 8) {
    return `${ordenados[0]}/${ordenados[1]}/…/${ordenados[ordenados.length - 1]} (${ordenados.length}x)`;
  }
  return ordenados.join("/");
}

// ---------------------------------------------------------------------------
// Pedidos (a venda inteira)
// ---------------------------------------------------------------------------

export interface Pedido {
  chave: string;
  /** Número do pedido — o documento, sem o sufixo da parcela. */
  documento: string;
  empresa: string;
  sacado: string;
  parcelas: number;
  valorTotal: number;
  /** Dias até o ÚLTIMO vencimento. É sobre ele que a política decide. */
  prazo: number | null;
  ultimoVencimento: string | null;
  /** Prazos de cada parcela, para montar a condição de pagamento. */
  prazosParcelas: number[];
  ids: string[];
  boletos: Boleto[];
}

/**
 * Agrupa boletos em pedidos, do maior prazo de recebimento para o menor.
 *
 * Usa o `prazo_recebimento` gravado na importação, que enxerga a venda inteira
 * — importante quando só parte das parcelas está no lote analisado.
 */
export function agruparPedidos(boletos: Boleto[]): Pedido[] {
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
      const vencimentos = ordenada
        .map((b) => b.data_vencimento)
        .filter((d): d is string => Boolean(d));

      return {
        chave,
        documento:
          primeiro.documento ||
          documentoEParcela(primeiro.seu_numero).documento ||
          String(primeiro.nosso_numero ?? "").trim() ||
          "—",
        empresa: primeiro.empresa || "Não classificado",
        sacado: primeiro.sacado || "—",
        parcelas: primeiro.total_parcelas ?? ordenada.length,
        valorTotal: ordenada.reduce((s, b) => s + (b.valor ?? 0), 0),
        prazo:
          primeiro.prazo_recebimento ??
          (prazos.length > 0 ? Math.max(...prazos) : null),
        ultimoVencimento: vencimentos[vencimentos.length - 1] ?? null,
        prazosParcelas: prazos,
        ids: ordenada.map((b) => b.id),
        boletos: ordenada,
      };
    })
    .sort((a, b) => (b.prazo ?? 0) - (a.prazo ?? 0));
}

// ---------------------------------------------------------------------------
// Indicadores do painel
// ---------------------------------------------------------------------------

export interface Contagem {
  quantidade: number;
  valor: number;
}

export interface IndicadoresPolitica {
  /** Tudo que passou do limite normal — exceções + não permitidos. */
  acimaDoNormal: Contagem;
  excecoes: Contagem;
  naoPermitidos: Contagem;
}

const ZERO: Contagem = { quantidade: 0, valor: 0 };

export function indicadoresPolitica(
  pedidos: Pick<Pedido, "prazo" | "valorTotal">[],
  limites: LimitesPrazo
): IndicadoresPolitica {
  const acc: IndicadoresPolitica = {
    acimaDoNormal: { ...ZERO },
    excecoes: { ...ZERO },
    naoPermitidos: { ...ZERO },
  };

  for (const p of pedidos) {
    const status = classificarPrazo(p.prazo, limites);
    if (status !== "excecao" && status !== "nao_permitido") continue;

    acc.acimaDoNormal.quantidade++;
    acc.acimaDoNormal.valor += p.valorTotal;

    const alvo = status === "excecao" ? acc.excecoes : acc.naoPermitidos;
    alvo.quantidade++;
    alvo.valor += p.valorTotal;
  }

  return acc;
}
