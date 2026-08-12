// ---------------------------------------------------------------------------
// lib/analytics.ts
// Agregações e insights para o Dashboard e o Histórico.
// ---------------------------------------------------------------------------

import {
  chaveVenda,
  documentoEParcela,
  formatarMoeda,
  type Boleto,
} from "./boletos";
import { hojeISO } from "./tempo";
import { agruparPedidos, type LimitesPrazo } from "./politica-prazo";

const MESES_PT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const soma = valores.reduce((a, b) => a + b, 0);
  return Math.round((soma / valores.length) * 10) / 10;
}



// ---------------------------------------------------------------------------
// Métricas simples
// ---------------------------------------------------------------------------

/**
 * Prazo médio SIMPLES: cada boleto pesa igual.
 * Responde "que prazo costumamos conceder por título".
 */
export function prazoMedio(boletos: Boleto[]): number | null {
  const prazos = boletos
    .map((b) => b.prazo_dias)
    .filter((p): p is number => typeof p === "number");
  return media(prazos);
}

/**
 * Prazo médio CONCEDIDO, ponderado pelo valor.
 *
 * Não confundir com o PMR da contabilidade (contas a receber ÷ receita × 365),
 * que mede quanto tempo a empresa LEVA para receber. Este mede o prazo que a
 * empresa DÁ — e é o que dá para calcular sem baixa dos títulos.
 * cada boleto pesa proporcionalmente ao quanto representa em dinheiro.
 *
 *   média = Σ(valor × prazo) ÷ Σ(valor)
 *
 * Responde "quanto tempo, em média, o dinheiro fica na rua". Um título de
 * R$ 10.000 a 90 dias pesa muito mais do que dez de R$ 100 a 30 dias.
 */
export function prazoMedioPonderado(boletos: Boleto[]): number | null {
  let somaValor = 0;
  let somaProduto = 0;
  for (const b of boletos) {
    const prazo = b.prazo_dias;
    const valor = b.valor ?? 0;
    if (typeof prazo !== "number" || valor <= 0) continue;
    somaValor += valor;
    somaProduto += valor * prazo;
  }
  if (somaValor <= 0) return null;
  return Math.round((somaProduto / somaValor) * 10) / 10;
}

/** Prazo médio simples filtrando por empresa. */
export function prazoMedioEmpresa(
  boletos: Boleto[],
  empresa: string
): number | null {
  return prazoMedio(boletos.filter((b) => b.empresa === empresa));
}

/** Prazo médio ponderado filtrando por empresa. */
export function prazoMedioPonderadoEmpresa(
  boletos: Boleto[],
  empresa: string
): number | null {
  return prazoMedioPonderado(boletos.filter((b) => b.empresa === empresa));
}

/** Valor total em carteira. */
export function valorTotal(boletos: Boleto[]): number {
  return boletos.reduce((soma, b) => soma + (b.valor ?? 0), 0);
}

export interface EstatisticaLimite {
  quantidade: number;
  percentual: number; // 0-100
  valor: number;
}

/** Quantidade, % e valor dos boletos acima do limite de prazo. */
/**
 * Conta BOLETOS acima do limite — título por título.
 *
 * Não confundir com os indicadores da política, que contam PEDIDOS pelo
 * vencimento do último título. São perguntas diferentes, e por isso os
 * rótulos na tela dizem explicitamente qual unidade está sendo contada.
 * A tolerância de calendário vale aqui também, para os números conversarem.
 */
export function estatisticasLimite(
  boletos: Boleto[],
  limites: LimitesPrazo
): EstatisticaLimite {
  const teto = limites.normal + limites.tolerancia;
  const acima = boletos.filter(
    (b) => typeof b.prazo_dias === "number" && b.prazo_dias > teto
  );
  const quantidade = acima.length;
  const percentual =
    boletos.length > 0
      ? Math.round((quantidade / boletos.length) * 1000) / 10
      : 0;
  const valor = acima.reduce((s, b) => s + (b.valor ?? 0), 0);
  return { quantidade, percentual, valor };
}

export interface AVencer {
  quantidade: number;
  valor: number;
}

/** Boletos a vencer nos próximos `dias` (inclusive hoje). */
export function aVencerEmDias(
  boletos: Boleto[],
  dias = 7,
  refISO: string = hojeISO()
): AVencer {
  const ini = Date.parse(`${refISO}T00:00:00Z`);
  const fim = ini + dias * 86400000;
  let quantidade = 0;
  let valor = 0;
  for (const b of boletos) {
    if (!b.data_vencimento) continue;
    const v = Date.parse(`${b.data_vencimento}T00:00:00Z`);
    if (Number.isNaN(v)) continue;
    if (v >= ini && v <= fim) {
      quantidade++;
      valor += b.valor ?? 0;
    }
  }
  return { quantidade, valor };
}

// ---------------------------------------------------------------------------
// Agregações por empresa
// ---------------------------------------------------------------------------

export interface ResumoEmpresa {
  empresa: string;
  prazoMedio: number | null;
  quantidade: number;
  valor: number;
}

export function prazoMedioPorEmpresa(boletos: Boleto[]): ResumoEmpresa[] {
  const grupos = new Map<string, Boleto[]>();
  for (const b of boletos) {
    const chave = b.empresa || "Não classificado";
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(b);
  }
  return Array.from(grupos.entries())
    .map(([empresa, lista]) => ({
      empresa,
      prazoMedio: prazoMedioPonderado(lista),
      quantidade: lista.length,
      valor: valorTotal(lista),
    }))
    .sort((a, b) => b.valor - a.valor);
}

export interface ParticipacaoEmpresa {
  empresa: string;
  valor: number;
  percentual: number; // 0-100
}

export function participacaoPorEmpresa(boletos: Boleto[]): ParticipacaoEmpresa[] {
  const total = valorTotal(boletos) || 1;
  const grupos = new Map<string, number>();
  for (const b of boletos) {
    const chave = b.empresa || "Não classificado";
    grupos.set(chave, (grupos.get(chave) ?? 0) + (b.valor ?? 0));
  }
  return Array.from(grupos.entries())
    .map(([empresa, valor]) => ({
      empresa,
      valor,
      percentual: Math.round((valor / total) * 1000) / 10,
    }))
    .sort((a, b) => b.valor - a.valor);
}

// ---------------------------------------------------------------------------
// Distribuição por faixa de prazo
// ---------------------------------------------------------------------------

export interface FaixaPrazo {
  faixa: string;
  quantidade: number;
  valor: number;
}

/**
 * As faixas acompanham a POLÍTICA, não são fixas.
 *
 * Antes eram "até 30 / 31–45 / 46–60 / 61–90 / +90", desenhadas para um limite
 * de 60 dias. Com a política em 150/180 isso empilhava quase tudo em "+90" e o
 * gráfico deixava de informar. Agora os cortes saem dos próprios limites, e a
 * última faixa é exatamente o que passou do teto — o não permitido.
 */
export function faixasDaPolitica(
  limites: LimitesPrazo
): { faixa: string; min: number; max: number }[] {
  const cortes = Array.from(
    new Set([60, 90, 120, limites.normal, limites.maximo])
  )
    .filter((c) => c > 0)
    .sort((a, b) => a - b);

  const faixas: { faixa: string; min: number; max: number }[] = [];
  let anterior = 0;
  for (const corte of cortes) {
    faixas.push({
      faixa: anterior === 0 ? `Até ${corte}` : `${anterior + 1}–${corte}`,
      min: anterior === 0 ? -Infinity : anterior + 1,
      max: corte,
    });
    anterior = corte;
  }
  faixas.push({ faixa: `+${anterior}`, min: anterior + 1, max: Infinity });
  return faixas;
}

export function distribuicaoPorFaixa(
  boletos: Boleto[],
  limites: LimitesPrazo
): FaixaPrazo[] {
  const FAIXAS = faixasDaPolitica(limites);
  const base = FAIXAS.map((f) => ({ faixa: f.faixa, quantidade: 0, valor: 0 }));
  for (const b of boletos) {
    if (typeof b.prazo_dias !== "number") continue;
    const idx = FAIXAS.findIndex(
      (f) => b.prazo_dias! >= f.min && b.prazo_dias! <= f.max
    );
    if (idx >= 0) {
      base[idx].quantidade++;
      base[idx].valor += b.valor ?? 0;
    }
  }
  return base;
}

// ---------------------------------------------------------------------------
// Evolução mensal do prazo médio (por mês de vencimento)
// ---------------------------------------------------------------------------

export interface PontoEvolucao {
  mes: string; // rótulo "mmm/aa"
  mesISO: string; // "yyyy-mm"
  [empresa: string]: number | string | null;
}

/**
 * Evolução do prazo concedido, pelo mês da VENDA.
 *
 * A versão por mês de vencimento distorce a leitura: numa venda parcelada as
 * parcelas caem em meses diferentes, e os meses mais à frente só recebem as
 * parcelas finais — a linha sobe sozinha na ponta direita sem ninguém ter
 * alongado nada. Agrupando pela entrada e usando o prazo de recebimento do
 * PEDIDO, cada venda entra uma vez, no mês em que foi feita.
 */
export function evolucaoPrazoConcedido(
  boletos: Boleto[],
  empresas: string[]
): PontoEvolucao[] {
  const pedidos = agruparPedidos(boletos);

  // mesISO -> empresa -> [{ prazo, valor }]
  const mapa = new Map<string, Map<string, { prazo: number; valor: number }[]>>();
  for (const p of pedidos) {
    const entrada = p.boletos[0]?.data_entrada;
    if (!entrada || typeof p.prazo !== "number") continue;
    const mesISO = entrada.slice(0, 7);
    const empresa = p.empresa || "Não classificado";
    if (!mapa.has(mesISO)) mapa.set(mesISO, new Map());
    const porEmpresa = mapa.get(mesISO)!;
    if (!porEmpresa.has(empresa)) porEmpresa.set(empresa, []);
    porEmpresa.get(empresa)!.push({ prazo: p.prazo, valor: p.valorTotal });
  }

  const lista =
    empresas.length > 0
      ? empresas
      : Array.from(new Set(pedidos.map((p) => p.empresa || "Não classificado")));

  return Array.from(mapa.keys())
    .sort()
    .map((mesISO) => {
      const [ano, mes] = mesISO.split("-");
      const ponto: PontoEvolucao = {
        mes: `${MESES_PT[Number(mes) - 1]}/${ano.slice(2)}`,
        mesISO,
      };
      for (const emp of lista) {
        const itens = mapa.get(mesISO)!.get(emp) ?? [];
        const somaValor = itens.reduce((s, i) => s + i.valor, 0);
        ponto[emp] =
          somaValor > 0
            ? Math.round(
                (itens.reduce((s, i) => s + i.valor * i.prazo, 0) / somaValor) * 10
              ) / 10
            : null;
      }
      return ponto;
    });
}

export function evolucaoMensalPrazo(
  boletos: Boleto[],
  empresas: string[]
): PontoEvolucao[] {
  // mapa mesISO -> empresa -> boletos (ponderamos pelo valor no fim)
  const mapa = new Map<string, Map<string, Boleto[]>>();

  for (const b of boletos) {
    if (!b.data_vencimento || typeof b.prazo_dias !== "number") continue;
    const mesISO = b.data_vencimento.slice(0, 7); // yyyy-mm
    const empresa = b.empresa || "Não classificado";
    if (!mapa.has(mesISO)) mapa.set(mesISO, new Map());
    const porEmpresa = mapa.get(mesISO)!;
    if (!porEmpresa.has(empresa)) porEmpresa.set(empresa, []);
    porEmpresa.get(empresa)!.push(b);
  }

  const listaEmpresas =
    empresas.length > 0
      ? empresas
      : Array.from(new Set(boletos.map((b) => b.empresa || "Não classificado")));

  return Array.from(mapa.keys())
    .sort()
    .map((mesISO) => {
      const [ano, mes] = mesISO.split("-");
      const rotulo = `${MESES_PT[Number(mes) - 1]}/${ano.slice(2)}`;
      const ponto: PontoEvolucao = { mes: rotulo, mesISO };
      const porEmpresa = mapa.get(mesISO)!;
      for (const emp of listaEmpresas) {
        ponto[emp] = prazoMedioPonderado(porEmpresa.get(emp) ?? []);
      }
      return ponto;
    });
}

// ---------------------------------------------------------------------------
// Top clientes
// ---------------------------------------------------------------------------

export interface ClienteResumo {
  sacado: string;
  valor: number;
  quantidade: number;
  prazoMedio: number | null;
}

export function topClientes(boletos: Boleto[], limite = 10): ClienteResumo[] {
  const grupos = new Map<string, Boleto[]>();
  for (const b of boletos) {
    const chave = b.sacado || "—";
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(b);
  }
  return Array.from(grupos.entries())
    .map(([sacado, lista]) => ({
      sacado,
      valor: valorTotal(lista),
      quantidade: lista.length,
      prazoMedio: prazoMedioPonderado(lista),
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, limite);
}

// ---------------------------------------------------------------------------
// Resumo por cliente (sacado)
// ---------------------------------------------------------------------------

export interface ClienteDetalhe {
  sacado: string;
  empresas: string[];
  quantidade: number;
  valor: number;
  prazoMedio: number | null; // concedido, ponderado pelo valor
  prazoMedioSimples: number | null; // cada boleto pesa igual
  acimaLimite: number;
  percentualAcima: number; // 0-100
  ultimoVencimento: string | null; // ISO
}

export function resumoClientes(
  boletos: Boleto[],
  limite: number
): ClienteDetalhe[] {
  const grupos = new Map<string, Boleto[]>();
  for (const b of boletos) {
    const chave = b.sacado || "—";
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(b);
  }

  return Array.from(grupos.entries())
    .map(([sacado, lista]) => {
      const acima = lista.filter(
        (b) => typeof b.prazo_dias === "number" && b.prazo_dias > limite
      ).length;
      const vencs = lista
        .map((b) => b.data_vencimento)
        .filter((v): v is string => Boolean(v))
        .sort();
      return {
        sacado,
        empresas: Array.from(
          new Set(lista.map((b) => b.empresa || "Não classificado"))
        ),
        quantidade: lista.length,
        valor: valorTotal(lista),
        prazoMedio: prazoMedioPonderado(lista),
        prazoMedioSimples: prazoMedio(lista),
        acimaLimite: acima,
        percentualAcima:
          lista.length > 0 ? Math.round((acima / lista.length) * 1000) / 10 : 0,
        ultimoVencimento: vencs.length ? vencs[vencs.length - 1] : null,
      };
    })
    .sort((a, b) => b.valor - a.valor);
}

// ---------------------------------------------------------------------------
// Vendas a prazo (parcelamentos) — boletos do mesmo documento
// ---------------------------------------------------------------------------

export interface VendaAPrazo {
  chave: string;
  documento: string;
  empresa: string;
  sacado: string;
  parcelas: number;
  valorTotal: number;
  valorParcela: number | null; // quando todas as parcelas têm o mesmo valor
  entrada: string | null; // ISO
  primeiroVencimento: string | null; // ISO
  ultimoVencimento: string | null; // ISO
  prazoMedio: number | null;
  prazoUltima: number | null;
  acimaLimite: number;
  boletos: Boleto[];
}

export function agruparVendas(boletos: Boleto[], limite: number): VendaAPrazo[] {
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
      const valores = ordenada.map((b) => b.valor ?? 0);
      const iguais =
        valores.length > 0 &&
        valores.every((v) => Math.abs(v - valores[0]) < 0.011);
      const entradas = ordenada
        .map((b) => b.data_entrada)
        .filter((d): d is string => Boolean(d))
        .sort();
      const vencs = ordenada
        .map((b) => b.data_vencimento)
        .filter((d): d is string => Boolean(d))
        .sort();
      const prazos = ordenada
        .map((b) => b.prazo_dias)
        .filter((p): p is number => typeof p === "number");

      return {
        chave,
        documento: documentoEParcela(ordenada[0]?.seu_numero).documento || "—",
        empresa: ordenada[0]?.empresa || "Não classificado",
        sacado: ordenada[0]?.sacado || "—",
        parcelas: ordenada.length,
        valorTotal: valores.reduce((s, v) => s + v, 0),
        valorParcela: iguais ? valores[0] : null,
        entrada: entradas[0] ?? null,
        primeiroVencimento: vencs[0] ?? null,
        ultimoVencimento: vencs[vencs.length - 1] ?? null,
        prazoMedio: prazoMedioPonderado(ordenada),
        prazoUltima: prazos.length ? Math.max(...prazos) : null,
        acimaLimite: prazos.filter((p) => p > limite).length,
        boletos: ordenada,
      };
    })
    .sort((a, b) => b.valorTotal - a.valorTotal);
}

// ---------------------------------------------------------------------------
// Insights automáticos
// ---------------------------------------------------------------------------

export function gerarInsights(
  boletos: Boleto[],
  limites: LimitesPrazo
): string[] {
  const insights: string[] = [];
  if (boletos.length === 0) return insights;

  const pm = prazoMedioPonderado(boletos);
  const pmSimples = prazoMedio(boletos);
  if (pm != null) {
    if (pm > limites.normal) {
      insights.push(
        `O prazo médio concedido na carteira (${pm} dias) está acima do padrão de ${limites.normal} dias.`
      );
    } else {
      insights.push(
        `O prazo médio concedido na carteira (${pm} dias) está dentro do padrão de ${limites.normal} dias.`
      );
    }
    // Diferença relevante entre as duas médias indica concentração de valor
    // nos títulos mais longos (ou mais curtos).
    if (pmSimples != null && Math.abs(pm - pmSimples) >= 7) {
      insights.push(
        pm > pmSimples
          ? `Atenção: o valor está concentrado nos títulos mais longos — ponderado ${pm} dias contra ${pmSimples} dias na média simples.`
          : `O valor está concentrado nos títulos mais curtos — ponderado ${pm} dias contra ${pmSimples} dias na média simples.`
      );
    }
  }

  const porEmpresa = prazoMedioPorEmpresa(boletos).filter(
    (e) => e.prazoMedio != null
  );
  if (porEmpresa.length >= 2) {
    const ordenado = [...porEmpresa].sort(
      (a, b) => (b.prazoMedio ?? 0) - (a.prazoMedio ?? 0)
    );
    const maior = ordenado[0];
    const menor = ordenado[ordenado.length - 1];
    insights.push(
      `${maior.empresa} tem o maior prazo médio (${maior.prazoMedio} dias), ` +
        `enquanto ${menor.empresa} tem o menor (${menor.prazoMedio} dias).`
    );
  }

  const est = estatisticasLimite(boletos, limites);
  if (est.quantidade > 0) {
    insights.push(
      `${est.quantidade} boleto(s) acima de ${limites.normal} dias (${est.percentual}% da carteira), ` +
        `somando ${formatarMoeda(est.valor)}.`
    );
  } else {
    insights.push(`Nenhum boleto acima de ${limites.normal} dias. 👍`);
  }

  const aVencer = aVencerEmDias(boletos, 7);
  if (aVencer.quantidade > 0) {
    insights.push(
      `${aVencer.quantidade} boleto(s) a vencer em 7 dias, totalizando ${formatarMoeda(
        aVencer.valor
      )}.`
    );
  }

  const top = topClientes(boletos, 1)[0];
  const total = valorTotal(boletos);
  if (top && total > 0) {
    const perc = Math.round((top.valor / total) * 1000) / 10;
    if (perc >= 20) {
      insights.push(
        `Concentração: ${top.sacado} representa ${perc}% do valor em carteira.`
      );
    }
  }

  return insights;
}
