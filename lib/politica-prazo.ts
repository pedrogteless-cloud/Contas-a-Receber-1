// ---------------------------------------------------------------------------
// lib/politica-prazo.ts
// A política de prazo de recebimento do Grupo Ley.
//
// A regra vale sobre o PEDIDO (a venda inteira), não parcela a parcela, e o
// que ela cobra é a META de prazo médio concedido:
//
//   média até a meta ............... DENTRO DO PADRÃO
//   média acima da meta ............ FORA DO PADRÃO   🚨 (gera alerta)
//   último vencimento > o teto ..... FORA DO PADRÃO   ⛔ não permitido
//
// São duas situações, não três. Antes existia uma faixa do meio chamada
// "exceção estratégica", e o nome soava a carimbo de aprovação para algo que
// está, na verdade, fugindo da meta — quem passa do teto em dias continua na
// mesma lista, só que com o selo ⛔.
//
// Medir pela média, e não pelo vencimento da última parcela, muda o que o
// sistema enxerga: uma condição 90/120 cabe folgada nos 150 dias, mas produz
// média 105 — quinze dias acima da meta. Pela régua antiga, passava batido.
//
// Mantido separado das telas e do Telegram porque é regra de negócio: muda por
// decisão da diretoria, não por causa de layout.
// ---------------------------------------------------------------------------

import {
  calcularPrazoDias,
  chaveVenda,
  documentoEParcela,
  type Boleto,
} from "./boletos";

export type StatusPrazo = "normal" | "fora_do_padrao" | "nao_permitido";

export interface LimitesPrazo {
  /** Até aqui o prazo é livre. Padrão da política: 150 dias. */
  normal: number;
  /** Acima daqui o prazo não é permitido. Padrão da política: 180 dias. */
  maximo: number;
  /**
   * Folga para dois motivos legítimos de o prazo passar um pouco do padrão
   * sem que o pedido esteja realmente fora dele:
   *
   *  1. Calendário: uma condição "5x mensal" (mesmo dia de cada mês) dá 150
   *     a 153 dias corridos, dependendo de quais meses ela atravessa — só
   *     quem entra em fevereiro fecha exatos 150. O vencimento em fim de
   *     semana, empurrado para segunda, soma mais 1 ou 2.
   *  2. Emissão da DAV: o boleto às vezes só é emitido depois que a
   *     mercadoria chega na loja do cliente — quem cobra é ele, não a data
   *     de saída daqui. Esse atraso entre a venda e a emissão empurra a
   *     primeira parcela (e, com ela, todas as seguintes) alguns dias.
   *
   * Sem esta folga, a regra de 150 reprovaria quase toda condição mensal
   * padrão e penalizaria vendas que só demoraram a emitir por causa do
   * cliente.
   */
  tolerancia: number;
  /** Dias até a PRIMEIRA parcela na condição padrão. Normalmente 30. */
  primeiraParcela: number;
  /**
   * Meta de prazo médio concedido — o número que a operação persegue.
   *
   * Não se escolhe no chute: uma condição parcelada mensalmente da primeira
   * parcela até o prazo padrão produz uma média exata. Para 30/150, as cinco
   * parcelas são 30/60/90/120/150 e a média é 90. Em geral:
   *
   *     meta = (prazo padrão + primeira parcela) / 2
   *
   * Ou seja, a meta é consequência da política — não um alvo independente.
   */
  meta: number;
}

/** A média que uma condição "primeira/última" mensal produz. */
export function mediaDaCondicao(primeira: number, ultima: number): number {
  if (primeira <= 0 || ultima < primeira) return ultima;
  return Math.round((ultima + primeira) / 2);
}

export interface DesvioMeta {
  /** Quanto por cento acima (positivo) ou abaixo (negativo) da meta. */
  percentual: number;
  acimaDaMeta: boolean;
  /** "33% acima da meta" / "13% melhor que a meta" */
  texto: string;
  emoji: string;
}

/**
 * Onde um prazo médio concedido está em relação à meta.
 *
 * É a leitura que orienta o trabalho do dia: não interessa o número solto,
 * interessa se está apertando ou afrouxando em relação ao que se persegue.
 */
export function desvioDaMeta(
  prazo: number | null | undefined,
  meta: number
): DesvioMeta | null {
  if (typeof prazo !== "number" || meta <= 0) return null;
  const percentual = Math.round(((prazo - meta) / meta) * 1000) / 10;
  const acimaDaMeta = percentual > 0;

  if (Math.abs(percentual) < 1) {
    return { percentual, acimaDaMeta: false, texto: "na meta", emoji: "🎯" };
  }
  const pct = Math.abs(percentual).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  });
  return {
    percentual,
    acimaDaMeta,
    texto: acimaDaMeta
      ? `${pct}% acima da meta`
      : `${pct}% melhor que a meta`,
    emoji: acimaDaMeta ? "🔺" : "✅",
  };
}

export const LIMITES_PADRAO: LimitesPrazo = {
  normal: 150,
  maximo: 180,
  tolerancia: 7,
  primeiraParcela: 30,
  meta: 90, // (150 + 30) / 2
};

/**
 * Lê os limites da tabela `configuracoes`, tolerando o formato antigo (só
 * `limite_prazo_dias`) e a ausência da coluna do limite máximo.
 */
export function lerLimites(
  config:
    | {
        limite_prazo_dias?: number | null;
        limite_maximo_dias?: number | null;
        tolerancia_dias?: number | null;
        meta_prazo_medio?: number | null;
        primeira_parcela_dias?: number | null;
      }
    | null
    | undefined
): LimitesPrazo {
  const normal = config?.limite_prazo_dias ?? LIMITES_PADRAO.normal;
  const maximo = config?.limite_maximo_dias ?? LIMITES_PADRAO.maximo;
  const tolerancia = config?.tolerancia_dias ?? LIMITES_PADRAO.tolerancia;
  const primeiraParcela =
    config?.primeira_parcela_dias ?? LIMITES_PADRAO.primeiraParcela;
  // Sem meta gravada, ela sai da própria política — assim os dois números
  // nunca ficam contando histórias diferentes.
  const meta =
    config?.meta_prazo_medio ?? mediaDaCondicao(primeiraParcela, normal);

  // Um máximo abaixo do normal deixaria a faixa de exceção vazia e faria todo
  // pedido longo cair direto em "não permitido". Preferimos ignorar o valor.
  return {
    normal,
    maximo: Math.max(maximo, normal),
    tolerancia: Math.max(0, tolerancia),
    primeiraParcela,
    meta,
  };
}

/**
 * Em que faixa da política um pedido cai.
 *
 * O gatilho é a META: o que importa é o pedido fugir do prazo médio concedido
 * que a operação persegue, não apenas o último boleto passar de uma data. Uma
 * condição com entrada esticada (90/120, por exemplo) fica dentro dos 150 mas
 * produz média 105 — está fugindo da meta, e agora aparece como tal.
 *
 * Por cima disso, o teto continua sendo regra dura: passou do máximo em dias,
 * é "não permitido", independentemente da média.
 *
 * As duas comparações levam a tolerância de calendário.
 */
export function classificarPedido(
  mediaPedido: number | null | undefined,
  ultimoVencimento: number | null | undefined,
  limites: LimitesPrazo
): StatusPrazo | null {
  const temMedia = typeof mediaPedido === "number";
  const temUltimo = typeof ultimoVencimento === "number";
  if (!temMedia && !temUltimo) return null;

  if (temUltimo && ultimoVencimento! > limites.maximo + limites.tolerancia) {
    return "nao_permitido";
  }
  if (temMedia && mediaPedido! > limites.meta + limites.tolerancia) {
    return "fora_do_padrao";
  }
  return "normal";
}

/** O prazo passou do limite, mas só pela folga de calendário. */
export function dentroDaTolerancia(
  prazo: number | null | undefined,
  limites: LimitesPrazo
): boolean {
  if (typeof prazo !== "number") return false;
  return prazo > limites.normal && prazo <= limites.normal + limites.tolerancia;
}

/**
 * Rótulos das faixas.
 *
 * Não existe mais "exceção estratégica": o nome soava a carimbo de aprovação,
 * quando o que acontece é um pedido FUGINDO do padrão. Tudo que passa do prazo
 * padrão é "Fora do padrão", com sirene. O teto de 180 continua sendo regra
 * dura, mas vira um selo dentro da mesma categoria — não uma categoria à parte
 * que pudesse soar mais aceitável que a outra.
 */
export const STATUS: Record<
  StatusPrazo,
  { rotulo: string; curto: string; emoji: string }
> = {
  normal: { rotulo: "Dentro do padrão", curto: "No padrão", emoji: "🟢" },
  fora_do_padrao: {
    rotulo: "Fora do padrão",
    curto: "Fora do padrão",
    emoji: "🚨",
  },
  nao_permitido: {
    rotulo: "Fora do padrão · não permitido",
    curto: "Não permitido",
    emoji: "⛔",
  },
};

/** O selo extra de quem passou do teto — some quando está só fora do padrão. */
export function seloNaoPermitido(
  status: StatusPrazo | null,
  limites: LimitesPrazo
): string | null {
  return status === "nao_permitido"
    ? `⛔ Acima de ${limites.maximo} dias — não permitido`
    : null;
}

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
// A marcação gravada na importação
// ---------------------------------------------------------------------------

/** O mínimo que uma linha precisa ter para ser avaliada pela política. */
export interface LinhaVenda {
  empresa?: string | null;
  sacado?: string | null;
  seu_numero?: string | null;
  nosso_numero?: string | null;
  data_entrada?: string | null;
  data_vencimento?: string | null;
  valor?: number | null;
  prazo_dias?: number | null;
}

/**
 * Diz, linha a linha, se o PEDIDO a que ela pertence está fora do padrão.
 *
 * É esta marcação que a importação grava em `excedeu_limite` e que decide
 * quem entra na fila de alertas — por isso ela precisa usar exatamente a
 * mesma régua das telas: o desvio da META, medido sobre a média ponderada
 * real do pedido, e não sobre o vencimento da última parcela.
 *
 * A diferença não é acadêmica: uma condição 90/120 cabe folgada nos 150 dias
 * e passaria batido pela régua antiga, mas produz média 105 — quinze dias
 * acima da meta. Com a régua antiga o alerta nunca chegaria a existir.
 *
 * `extras` são os boletos já gravados das mesmas vendas, para que uma parcela
 * importada hoje seja avaliada junto com as irmãs importadas ontem.
 */
export function foraDoPadraoPorLinha<T extends LinhaVenda>(
  linhas: T[],
  extras: T[],
  limites: LimitesPrazo
): boolean[] {
  const grupos = new Map<string, T[]>();
  for (const l of [...linhas, ...extras]) {
    const chave = chaveVenda(l);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(l);
  }

  // Uma venda só é classificada uma vez; todas as parcelas herdam o resultado.
  const decidido = new Map<string, boolean>();

  return linhas.map((l) => {
    const chave = chaveVenda(l);
    const jaSabe = decidido.get(chave);
    if (jaSabe !== undefined) return jaSabe;

    const grupo = grupos.get(chave) ?? [l];
    const prazoDe = (g: T) =>
      typeof g.prazo_dias === "number"
        ? g.prazo_dias
        : calcularPrazoDias(g.data_entrada ?? null, g.data_vencimento ?? null);

    let somaValor = 0;
    let somaProduto = 0;
    for (const g of grupo) {
      const prazo = prazoDe(g);
      const valor = g.valor ?? 0;
      if (typeof prazo !== "number" || valor <= 0) continue;
      somaValor += valor;
      somaProduto += valor * prazo;
    }
    const media =
      somaValor > 0 ? Math.round((somaProduto / somaValor) * 10) / 10 : null;

    // O último vencimento da venda inteira — é ele que o teto duro cobra.
    const entradas = grupo
      .map((g) => g.data_entrada)
      .filter((d): d is string => Boolean(d))
      .sort();
    const vencimentos = grupo
      .map((g) => g.data_vencimento)
      .filter((d): d is string => Boolean(d))
      .sort();
    const ultimo = calcularPrazoDias(
      entradas[0] ?? l.data_entrada ?? null,
      vencimentos[vencimentos.length - 1] ?? l.data_vencimento ?? null
    );

    const status = classificarPedido(media, ultimo, limites);
    const fora = status === "fora_do_padrao" || status === "nao_permitido";
    decidido.set(chave, fora);
    return fora;
  });
}

// ---------------------------------------------------------------------------
// Indicadores do painel
// ---------------------------------------------------------------------------

export interface Contagem {
  quantidade: number;
  valor: number;
}

export interface IndicadoresPolitica {
  /** Tudo fora do padrão, incluindo os que passaram do teto. */
  foraDoPadrao: Contagem;
  /** Subconjunto: os que passaram do teto em dias. */
  naoPermitidos: Contagem;
}

const ZERO: Contagem = { quantidade: 0, valor: 0 };

/**
 * Conta os pedidos fora do padrão. Aceita a média já calculada; sem ela,
 * deriva da condição padrão.
 */
export function indicadoresPolitica(
  pedidos: (Pick<Pedido, "prazo" | "valorTotal"> & { media?: number | null })[],
  limites: LimitesPrazo
): IndicadoresPolitica {
  const acc: IndicadoresPolitica = {
    foraDoPadrao: { ...ZERO },
    naoPermitidos: { ...ZERO },
  };

  for (const p of pedidos) {
    const media =
      p.media ??
      (typeof p.prazo === "number"
        ? mediaDaCondicao(limites.primeiraParcela, p.prazo)
        : null);
    const status = classificarPedido(media, p.prazo, limites);
    if (status !== "fora_do_padrao" && status !== "nao_permitido") continue;

    acc.foraDoPadrao.quantidade++;
    acc.foraDoPadrao.valor += p.valorTotal;

    if (status === "nao_permitido") {
      acc.naoPermitidos.quantidade++;
      acc.naoPermitidos.valor += p.valorTotal;
    }
  }

  return acc;
}
