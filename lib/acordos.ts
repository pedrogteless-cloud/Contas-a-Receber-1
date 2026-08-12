// ---------------------------------------------------------------------------
// lib/acordos.ts
// Acordo de prazo por cliente.
//
// A política geral (150/180) vale para todo mundo. Este módulo guarda as
// exceções combinadas com CADA cliente:
//
//   prazo_acordado -> "conversamos e a partir de agora este cliente é 150"
//   sem_alerta     -> "já estou ciente que este vai passar; não me avise"
//
// O cadastro se monta sozinho: os clientes vêm dos boletos importados, e aqui
// só ficam os que você tocou. Ninguém precisa cadastrar a carteira inteira.
// ---------------------------------------------------------------------------

import type { LimitesPrazo, StatusPrazo } from "./politica-prazo";
import { classificarPedido, mediaDaCondicao } from "./politica-prazo";

export interface Acordo {
  id?: string;
  cliente_chave: string;
  cliente_nome: string;
  /** Prazo combinado com o cliente daqui para frente. */
  prazo_acordado: number | null;
  /** A condição como foi conversada: "30/150". */
  condicao_acordada?: string | null;
  /** Retrato do que o cliente praticava ANTES — preenchido pelo sistema. */
  condicao_anterior?: string | null;
  prazo_anterior?: number | null;
  /** "Já estou ciente que este cliente vai passar do padrão." */
  sem_alerta: boolean;
  observacao?: string | null;
  /** Desde quando vale. Pedidos emitidos ANTES disso não são cobrados. */
  acordado_em: string;
  registrado_por?: string | null;
}

/**
 * Lê uma condição de pagamento escrita à mão.
 *
 * No comércio, "30/150" não são duas parcelas: é a FAIXA — da primeira aos 30
 * dias até a última aos 150, de 30 em 30. Ou seja, 30/60/90/120/150, cinco
 * parcelas. Então dois números em que o segundo é múltiplo do primeiro são
 * expandidos; qualquer outra coisa fica como foi escrita.
 *
 * Exemplos:
 *   "30/150"            -> 30/60/90/120/150   (5x)
 *   "28/168"            -> 28/56/.../168      (6x)
 *   "30/45"             -> 30/45              (45 não é múltiplo de 30)
 *   "30/60/90"          -> 30/60/90           (lista completa, respeitada)
 *   "150"               -> 150                (parcela única)
 */
export function interpretarCondicao(texto: string): {
  /** Como se escreve e se lê: "30/150". */
  condicao: string;
  /** A lista inteira, para conferência: "30/60/90/120/150". */
  expandida: string;
  prazo: number | null;
  parcelas: number;
} {
  const numeros = (texto.match(/\d+/g) ?? [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);

  if (numeros.length === 0)
    return { condicao: "", expandida: "", prazo: null, parcelas: 0 };

  // A notação de faixa: "primeira/última", com o passo igual à primeira.
  if (numeros.length === 2) {
    const [passo, ultima] = numeros;
    const cabe = ultima > passo && ultima % passo === 0;
    const qtd = cabe ? ultima / passo : 0;
    // Até 24 parcelas; acima disso é mais provável ser engano de digitação.
    if (cabe && qtd >= 2 && qtd <= 24) {
      const lista = Array.from({ length: qtd }, (_, i) => passo * (i + 1));
      return {
        condicao: `${passo}/${ultima}`,
        expandida: lista.join("/"),
        prazo: ultima,
        parcelas: qtd,
      };
    }
  }

  const ordenados = [...numeros].sort((a, b) => a - b);
  return {
    condicao: resumirCondicao(ordenados),
    expandida: ordenados.join("/"),
    prazo: ordenados[ordenados.length - 1],
    parcelas: ordenados.length,
  };
}

/**
 * Escreve uma lista de prazos no formato curto do comércio: "30/240".
 *
 * Só encurta quando as parcelas são regulares e o intervalo bate com a
 * primeira — que é o caso de todo parcelamento mensal. Repare que os prazos
 * REAIS vêm do calendário (30/61/91/122/153, não 30/60/90/120/150), então a
 * regularidade é medida com folga de alguns dias. Condições irregulares são
 * mostradas por extenso, porque encurtá-las esconderia informação.
 */
export function resumirCondicao(prazos: number[]): string {
  const l = [...prazos].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (l.length === 0) return "";
  if (l.length <= 2) return l.join("/");

  const intervalos = l.slice(1).map((v, i) => v - l[i]);
  const regular = intervalos.every((g) => Math.abs(g - intervalos[0]) <= 5);
  const comecaNoIntervalo = Math.abs(intervalos[0] - l[0]) <= 5;

  return regular && comecaNoIntervalo
    ? `${l[0]}/${l[l.length - 1]}`
    : l.join("/");
}

/**
 * Chave de um cliente a partir do nome no boleto.
 *
 * Os relatórios do banco variam a grafia (acento, caixa, espaço duplo, e o
 * código que às vezes vem colado: "38026 - REGINA LUCIA"). Normalizamos para
 * que o mesmo cliente não vire dois acordos.
 */
export function chaveCliente(nome: string | null | undefined): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tira acentos
    .replace(/^\s*\d+\s*-\s*/, "") // tira "38026 - " do começo
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type MotivoAlerta =
  | "nao_permitido" // acima do teto da política — sempre avisa
  | "fora_do_acordo" // passou do que foi combinado com o cliente
  | "fora_do_padrao" // fugiu da meta, sem acordo registrado
  | "silenciado" // cliente marcado como "estou ciente"
  | "dentro"; // nada a avisar

export interface Avaliacao {
  status: StatusPrazo | null;
  motivo: MotivoAlerta;
  /** Se entra nos alertas do Telegram. */
  alertar: boolean;
  /**
   * A meta de prazo médio que valeu para este cliente, para explicar na
   * mensagem. É a da política, ou a do acordo quando ele for mais rígido.
   */
  metaAplicada: number;
  /** O teto em dias — regra dura, igual para todos. */
  tetoAplicado: number;
}

/**
 * Decide o que fazer com um pedido, considerando o acordo do cliente.
 *
 * O gatilho é o desvio da META de prazo médio concedido — não o vencimento da
 * última parcela. Quando a média não vem calculada, ela é derivada da condição
 * padrão, que é exata para parcelamento mensal.
 *
 * Regras, nesta ordem:
 *  1. acima do teto da política  -> alerta crítico SEMPRE, mesmo silenciado.
 *     "Não permitido" não pode ser desligado por engano.
 *  2. cliente marcado "estou ciente" -> não alerta (só aparece na tela).
 *  3. tem acordo -> vale o acordo, quando ele for mais rígido que o padrão.
 *  4. sem acordo -> vale a meta da política.
 */
export function avaliarPedido(
  prazo: number | null | undefined,
  acordo: Acordo | undefined,
  limites: LimitesPrazo,
  dataImportacao?: string | null,
  mediaPedido?: number | null
): Avaliacao {
  const media =
    typeof mediaPedido === "number"
      ? mediaPedido
      : typeof prazo === "number"
        ? mediaDaCondicao(limites.primeiraParcela, prazo)
        : null;

  const status = classificarPedido(media, prazo, limites);
  if (status == null || typeof prazo !== "number") {
    return {
      status: null,
      motivo: "dentro",
      alertar: false,
      metaAplicada: limites.meta,
      tetoAplicado: limites.maximo,
    };
  }

  // 1. O teto da política nunca é silenciado.
  if (status === "nao_permitido") {
    return {
      status,
      motivo: "nao_permitido",
      alertar: true,
      metaAplicada: limites.meta,
      tetoAplicado: limites.maximo,
    };
  }

  // O acordo só vale para o que foi emitido DEPOIS de combinado — o que já
  // estava dentro de casa com a condição antiga não vira alerta retroativo.
  const valeAgora =
    acordo != null &&
    (!dataImportacao ||
      !acordo.acordado_em ||
      dataImportacao >= acordo.acordado_em.slice(0, 10));

  // 2. Cliente que você já sabe que vai passar.
  if (valeAgora && acordo!.sem_alerta) {
    return {
      status,
      motivo: "silenciado",
      alertar: false,
      metaAplicada: limites.meta,
      tetoAplicado: limites.maximo,
    };
  }

  // 3. Acordo mais rígido que o padrão (o caso do 8x que virou 150).
  //
  // O acordo é combinado em CONDIÇÃO ("30/150"), então o que ele fixa é o
  // último vencimento. A meta correspondente é a média que essa condição
  // produz — a mesma conta da política, só que com o número do cliente.
  const combinado = valeAgora ? acordo!.prazo_acordado : null;
  const metaAplicada =
    combinado != null
      ? Math.min(
          mediaDaCondicao(limites.primeiraParcela, combinado),
          limites.meta
        )
      : limites.meta;

  // A mesma folga de calendário vale para o acordo: um "5x mensal" combinado
  // em 150 chega a 153 sem ninguém ter mudado a condição.
  if (media != null && media > metaAplicada + limites.tolerancia) {
    return {
      status,
      motivo: combinado != null ? "fora_do_acordo" : "fora_do_padrao",
      alertar: true,
      metaAplicada,
      tetoAplicado: limites.maximo,
    };
  }

  return {
    status,
    motivo: "dentro",
    alertar: false,
    metaAplicada,
    tetoAplicado: limites.maximo,
  };
}

/**
 * Descobre, sozinho, a condição que um cliente vinha praticando.
 *
 * Pega o pedido de MAIOR prazo de recebimento — é ele que motiva a conversa —
 * e devolve a condição dele. Serve para preencher o "antes" do acordo sem que
 * ninguém precise digitar, e vira um retrato: fica gravado no acordo, então
 * sobrevive à limpeza do histórico.
 */
export function condicaoPraticada(
  pedidos: { sacado: string; prazo: number | null; prazosParcelas: number[] }[],
  nome: string
): { condicao: string | null; prazo: number | null } {
  const chave = chaveCliente(nome);
  const doCliente = pedidos.filter((p) => chaveCliente(p.sacado) === chave);
  if (doCliente.length === 0) return { condicao: null, prazo: null };

  const pior = doCliente.reduce((a, b) => ((b.prazo ?? 0) > (a.prazo ?? 0) ? b : a));
  const resumo = resumirCondicao(pior.prazosParcelas);
  return {
    condicao: resumo || null,
    prazo: pior.prazo ?? null,
  };
}

/** Indexa os acordos por chave de cliente, para consulta rápida. */
export function indexarAcordos(acordos: Acordo[]): Map<string, Acordo> {
  const mapa = new Map<string, Acordo>();
  for (const a of acordos) mapa.set(a.cliente_chave, a);
  return mapa;
}
