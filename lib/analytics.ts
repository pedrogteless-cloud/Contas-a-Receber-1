// ---------------------------------------------------------------------------
// lib/analytics.ts
// Agregações e insights para o Dashboard e o Histórico.
// ---------------------------------------------------------------------------

import { formatarMoeda, type Boleto } from "./boletos";

const MESES_PT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const soma = valores.reduce((a, b) => a + b, 0);
  return Math.round((soma / valores.length) * 10) / 10;
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Métricas simples
// ---------------------------------------------------------------------------

/** Prazo médio (dias corridos) de todos os boletos com prazo definido. */
export function prazoMedio(boletos: Boleto[]): number | null {
  const prazos = boletos
    .map((b) => b.prazo_dias)
    .filter((p): p is number => typeof p === "number");
  return media(prazos);
}

/** Prazo médio filtrando por empresa. */
export function prazoMedioEmpresa(
  boletos: Boleto[],
  empresa: string
): number | null {
  return prazoMedio(boletos.filter((b) => b.empresa === empresa));
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
export function estatisticasLimite(
  boletos: Boleto[],
  limite: number
): EstatisticaLimite {
  const acima = boletos.filter(
    (b) => typeof b.prazo_dias === "number" && b.prazo_dias > limite
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
      prazoMedio: prazoMedio(lista),
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

const FAIXAS: { faixa: string; min: number; max: number }[] = [
  { faixa: "Até 30", min: -Infinity, max: 30 },
  { faixa: "31–45", min: 31, max: 45 },
  { faixa: "46–60", min: 46, max: 60 },
  { faixa: "61–90", min: 61, max: 90 },
  { faixa: "+90", min: 91, max: Infinity },
];

export function distribuicaoPorFaixa(boletos: Boleto[]): FaixaPrazo[] {
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

export function evolucaoMensalPrazo(
  boletos: Boleto[],
  empresas: string[]
): PontoEvolucao[] {
  // mapa mesISO -> empresa -> prazos[]
  const mapa = new Map<string, Map<string, number[]>>();

  for (const b of boletos) {
    if (!b.data_vencimento || typeof b.prazo_dias !== "number") continue;
    const mesISO = b.data_vencimento.slice(0, 7); // yyyy-mm
    const empresa = b.empresa || "Não classificado";
    if (!mapa.has(mesISO)) mapa.set(mesISO, new Map());
    const porEmpresa = mapa.get(mesISO)!;
    if (!porEmpresa.has(empresa)) porEmpresa.set(empresa, []);
    porEmpresa.get(empresa)!.push(b.prazo_dias);
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
        ponto[emp] = media(porEmpresa.get(emp) ?? []);
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
      prazoMedio: prazoMedio(lista),
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
  prazoMedio: number | null;
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
        prazoMedio: prazoMedio(lista),
        acimaLimite: acima,
        percentualAcima:
          lista.length > 0 ? Math.round((acima / lista.length) * 1000) / 10 : 0,
        ultimoVencimento: vencs.length ? vencs[vencs.length - 1] : null,
      };
    })
    .sort((a, b) => b.valor - a.valor);
}

// ---------------------------------------------------------------------------
// Insights automáticos
// ---------------------------------------------------------------------------

export function gerarInsights(boletos: Boleto[], limite: number): string[] {
  const insights: string[] = [];
  if (boletos.length === 0) return insights;

  const pm = prazoMedio(boletos);
  if (pm != null) {
    if (pm > limite) {
      insights.push(
        `O prazo médio da carteira (${pm} dias) está acima do limite de ${limite} dias.`
      );
    } else {
      insights.push(
        `O prazo médio da carteira (${pm} dias) está dentro do limite de ${limite} dias.`
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

  const est = estatisticasLimite(boletos, limite);
  if (est.quantidade > 0) {
    insights.push(
      `${est.quantidade} boleto(s) acima do limite (${est.percentual}% da carteira), ` +
        `somando ${formatarMoeda(est.valor)}.`
    );
  } else {
    insights.push("Nenhum boleto acima do limite de prazo. 👍");
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
