// ---------------------------------------------------------------------------
// lib/relatorio-excel.ts
// Gera o relatório em Excel (.xlsx).
//
// Três coisas guiam o desenho daqui:
//
//  1. O Resumo é um PAINEL, não uma lista de rótulos soltos: os números que
//     interessam vêm em cartões, grandes e coloridos, e o resto em tabelas de
//     verdade (ListObject do Excel — com faixa zebrada e a setinha de filtro).
//  2. Todo número é NÚMERO, nunca texto já formatado. Quem abre a planilha
//     precisa poder somar, filtrar e fazer gráfico em cima.
//  3. Nada de largura de coluna improvisada por seção: existe UMA grade, e
//     todas as tabelas se encaixam nela. Foi o que quebrou a primeira versão,
//     que mostrava "###" na coluna de valor.
//
// Roda no navegador (chamado por app/relatorios/page.tsx): monta o arquivo em
// memória e devolve os bytes prontos pro download.
// ---------------------------------------------------------------------------

import ExcelJS from "exceljs";

import {
  chaveCliente,
  condicaoPraticada,
  indexarHistorico,
  linhaDoTempo,
  resultadoAcordo,
  type Acordo,
  type AcordoHistorico,
} from "./acordos";
import { type Boleto } from "./boletos";
import {
  agruparVendas,
  distribuicaoPorFaixa,
  prazoMedio,
  prazoMedioPonderado,
  resumoClientes,
  topClientes,
  valorTotal,
  type VendaAPrazo,
} from "./analytics";
import {
  STATUS,
  agruparPedidos,
  classificarPedido,
  desvioDaMeta,
  type LimitesPrazo,
  type StatusPrazo,
} from "./politica-prazo";

// ---------------------------------------------------------------------------
// Opções
// ---------------------------------------------------------------------------

export type AbaRelatorio =
  | "resumo"
  | "clientes"
  | "vendas"
  | "boletos"
  | "acordos";
export type Agrupamento = "nenhum" | "cliente" | "empresa" | "status";
export type Ordenacao = "valor" | "prazo" | "nome" | "vencimento";

export interface OpcoesRelatorio {
  abas: Record<AbaRelatorio, boolean>;
  agrupar: Agrupamento;
  ordenar: Ordenacao;
  /** O recorte que o usuário aplicou, escrito para o cabeçalho do Resumo. */
  filtroDescricao: string;
}

// ---------------------------------------------------------------------------
// Paleta e formatos — uma só, para as abas conversarem entre si
// ---------------------------------------------------------------------------

const COR = {
  marca: "FF5048E5",
  marcaEscura: "FF3730A3",
  marcaClara: "FFEEF0FF",
  branco: "FFFFFFFF",
  tinta: "FF0F172A",
  cinza: "FF64748B",
  cinzaClaro: "FFF1F5F9",
  borda: "FFE2E8F0",
  verde: "FF15803D",
  verdeFundo: "FFDCFCE7",
  ambar: "FFB45309",
  ambarFundo: "FFFEF3C7",
  vermelho: "FF991B1B",
  vermelhoFundo: "FFFEE2E2",
  vermelhoForte: "FF7F1D1D",
  vermelhoForteFundo: "FFFECACA",
} as const;

const FMT = {
  moeda: '"R$" #,##0.00',
  dias: '0" d"',
  diasDecimal: '0.0" d"',
  data: "dd/mm/yyyy",
  pct: "0.0%",
  inteiro: "#,##0",
  variacao: '+0" d";-0" d";"—"',
} as const;

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

const BORDA: Partial<ExcelJS.Border> = { style: "thin", color: { argb: COR.borda } };

/** Cores da célula de status, seguindo a mesma leitura das telas. */
function corStatus(status: StatusPrazo | null): { fundo: string; texto: string } {
  if (status === "nao_permitido")
    return { fundo: COR.vermelhoForteFundo, texto: COR.vermelhoForte };
  if (status === "fora_do_padrao")
    return { fundo: COR.vermelhoFundo, texto: COR.vermelho };
  return { fundo: COR.verdeFundo, texto: COR.verde };
}

/**
 * Gravidade de um status — é isto que ordena os grupos.
 *
 * "Não permitido" também é fora do padrão, então os dois têm de ficar
 * grudados no topo. Ordenar grupo por valor, como era antes, jogava o "não
 * permitido" pro fim da planilha, longe do "fora do padrão" — exatamente o
 * contrário do que a leitura pede.
 */
function gravidade(status: StatusPrazo | null): number {
  if (status === "nao_permitido") return 0;
  if (status === "fora_do_padrao") return 1;
  return 2;
}

// ---------------------------------------------------------------------------
// Blocos de montagem
// ---------------------------------------------------------------------------

interface Coluna {
  cabecalho: string;
  chave: string;
  largura: number;
  formato?: string;
  alinhar?: "left" | "center" | "right";
}

/** Título grande + subtítulo, no topo de uma aba. */
function titulo(
  ws: ExcelJS.Worksheet,
  linha: number,
  colInicio: number,
  colFim: number,
  texto: string,
  subtexto?: string
): number {
  const c1 = ws.getRow(linha).getCell(colInicio);
  ws.mergeCells(linha, colInicio, linha, colFim);
  c1.value = texto;
  c1.font = { name: "Calibri", size: 18, bold: true, color: { argb: COR.marca } };
  ws.getRow(linha).height = 26;

  if (subtexto) {
    const c2 = ws.getRow(linha + 1).getCell(colInicio);
    ws.mergeCells(linha + 1, colInicio, linha + 1, colFim);
    c2.value = subtexto;
    c2.font = { name: "Calibri", size: 10, color: { argb: COR.cinza } };
    return linha + 2;
  }
  return linha + 1;
}

/** Título de seção dentro de uma aba. */
function secao(
  ws: ExcelJS.Worksheet,
  linha: number,
  colInicio: number,
  colFim: number,
  texto: string
): number {
  const cell = ws.getRow(linha).getCell(colInicio);
  ws.mergeCells(linha, colInicio, linha, colFim);
  cell.value = texto;
  cell.font = { name: "Calibri", size: 12, bold: true, color: { argb: COR.tinta } };
  cell.border = { bottom: { style: "medium", color: { argb: COR.marca } } };
  ws.getRow(linha).height = 20;
  return linha + 1;
}

type Tom = "neutro" | "bom" | "atencao" | "critico";

interface Kpi {
  rotulo: string;
  valor: number | string;
  formato?: string;
  nota?: string;
  tom?: Tom;
}

const TINTA_TOM: Record<Tom, string> = {
  neutro: COR.tinta,
  bom: COR.verde,
  atencao: COR.ambar,
  critico: COR.vermelho,
};
const FUNDO_TOM: Record<Tom, string> = {
  neutro: COR.cinzaClaro,
  bom: COR.verdeFundo,
  atencao: COR.ambarFundo,
  critico: COR.vermelhoFundo,
};

/**
 * Um cartão de KPI: rótulo pequeno em cima, número grande no meio, nota
 * embaixo — dentro de uma caixa com borda. Ocupa 2 colunas × 3 linhas.
 *
 * O valor entra como NÚMERO com formato, não como texto: o "R$" e o " d" vêm
 * do numFmt, então a célula continua servindo para conta e para gráfico.
 */
function cartaoKpi(
  ws: ExcelJS.Worksheet,
  linha: number,
  col: number,
  kpi: Kpi
) {
  const tom = kpi.tom ?? "neutro";
  const colFim = col + 1;

  // Depois de mesclar, as duas colunas viram a MESMA célula: escrever borda
  // em cada uma faz a segunda apagar a primeira (foi assim que a borda
  // esquerda sumiu). Então a caixa vai de uma vez na célula-mestre, que é
  // quem o Excel usa para desenhar a moldura do bloco inteiro.
  for (let r = linha; r <= linha + 2; r++) {
    ws.mergeCells(r, col, r, colFim);
    const cell = ws.getRow(r).getCell(col);
    cell.fill = fill(FUNDO_TOM[tom]);
    cell.border = {
      left: BORDA,
      right: BORDA,
      ...(r === linha ? { top: BORDA } : {}),
      ...(r === linha + 2 ? { bottom: BORDA } : {}),
    };
  }

  const rotulo = ws.getRow(linha).getCell(col);
  rotulo.value = kpi.rotulo;
  rotulo.font = { size: 9, bold: true, color: { argb: COR.cinza } };
  rotulo.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(linha).height = 16;

  const valor = ws.getRow(linha + 1).getCell(col);
  valor.value = kpi.valor;
  if (kpi.formato) valor.numFmt = kpi.formato;
  valor.font = { size: 18, bold: true, color: { argb: TINTA_TOM[tom] } };
  valor.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(linha + 1).height = 26;

  const nota = ws.getRow(linha + 2).getCell(col);
  nota.value = kpi.nota ?? "";
  nota.font = { size: 9, italic: true, color: { argb: COR.cinza } };
  nota.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(linha + 2).height = 15;
}

/**
 * Uma tabela de verdade (ListObject): faixa zebrada, cabeçalho com a setinha
 * de filtro e nome próprio — o Excel passa a tratar o bloco como tabela, com
 * referência estruturada e tudo.
 */
function tabela(
  ws: ExcelJS.Worksheet,
  nome: string,
  linha: number,
  col: number,
  colunas: Coluna[],
  linhas: unknown[][]
): number {
  if (linhas.length === 0) {
    const c = ws.getRow(linha).getCell(col);
    c.value = "Nada neste recorte.";
    c.font = { italic: true, size: 10, color: { argb: COR.cinza } };
    return linha + 2;
  }

  ws.addTable({
    name: nome,
    ref: ws.getRow(linha).getCell(col).address,
    headerRow: true,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: colunas.map((c) => ({ name: c.cabecalho, filterButton: true })),
    rows: linhas as ExcelJS.RowValues[][],
  });

  // O tema da tabela cuida das faixas; o formato de número e o alinhamento
  // continuam por conta nossa.
  colunas.forEach((c, i) => {
    for (let r = linha + 1; r <= linha + linhas.length; r++) {
      const cell = ws.getRow(r).getCell(col + i);
      if (c.formato) cell.numFmt = c.formato;
      cell.alignment = { vertical: "middle", horizontal: c.alinhar ?? "left" };
    }
    const cab = ws.getRow(linha).getCell(col + i);
    cab.alignment = { vertical: "middle", horizontal: c.alinhar ?? "left", wrapText: true };
  });
  ws.getRow(linha).height = 20;

  return linha + linhas.length + 2;
}

/** Cabeçalho manual — usado só nas abas agrupadas, onde não cabe ListObject. */
function cabecalhoManual(ws: ExcelJS.Worksheet, colunas: Coluna[], linha: number) {
  const row = ws.getRow(linha);
  colunas.forEach((c, i) => {
    const cell = row.getCell(i + 1);
    cell.value = c.cabecalho;
    cell.font = { size: 10, bold: true, color: { argb: COR.branco } };
    cell.fill = fill(COR.marca);
    cell.alignment = {
      vertical: "middle",
      horizontal: c.alinhar ?? "left",
      wrapText: true,
    };
  });
  row.height = 22;
  ws.autoFilter = {
    from: { row: linha, column: 1 },
    to: { row: linha, column: colunas.length },
  };
  ws.views = [{ state: "frozen", ySplit: linha }];
}

function linhaManual(
  ws: ExcelJS.Worksheet,
  colunas: Coluna[],
  linha: number,
  dados: Record<string, unknown>,
  opcoes: { zebra?: boolean; nivel?: number } = {}
) {
  const row = ws.getRow(linha);
  if (opcoes.nivel) row.outlineLevel = opcoes.nivel;
  colunas.forEach((c, i) => {
    const cell = row.getCell(i + 1);
    cell.value = dados[c.chave] as ExcelJS.CellValue;
    if (c.formato) cell.numFmt = c.formato;
    cell.alignment = { vertical: "middle", horizontal: c.alinhar ?? "left" };
    cell.border = { bottom: BORDA };
    if (opcoes.zebra) cell.fill = fill(COR.cinzaClaro);
  });
}

/** Linha de grupo: é ela que fica visível quando o "+/-" está recolhido. */
function linhaGrupo(
  ws: ExcelJS.Worksheet,
  colunas: Coluna[],
  linha: number,
  dados: Record<string, unknown>
) {
  const row = ws.getRow(linha);
  colunas.forEach((c, i) => {
    const cell = row.getCell(i + 1);
    cell.value = dados[c.chave] as ExcelJS.CellValue;
    if (c.formato) cell.numFmt = c.formato;
    cell.font = { bold: true, color: { argb: COR.marcaEscura } };
    cell.fill = fill(COR.marcaClara);
    cell.alignment = { vertical: "middle", horizontal: c.alinhar ?? "left" };
    cell.border = { top: BORDA, bottom: BORDA };
  });
  row.height = 19;
}

function pintarStatus(
  ws: ExcelJS.Worksheet,
  colunas: Coluna[],
  linha: number,
  status: StatusPrazo | null
) {
  const idx = colunas.findIndex((c) => c.chave === "status");
  if (idx < 0) return;
  const { fundo, texto } = corStatus(status);
  const cell = ws.getRow(linha).getCell(idx + 1);
  cell.value = status ? STATUS[status].rotulo : "—";
  cell.fill = fill(fundo);
  cell.font = { bold: true, color: { argb: texto } };
  cell.alignment = { vertical: "middle", horizontal: "center" };
}

/** Larguras da aba, aplicadas de uma vez só. */
function larguras(ws: ExcelJS.Worksheet, colunas: Coluna[]) {
  ws.columns = colunas.map((c) => ({ width: c.largura }));
}

// ---------------------------------------------------------------------------
// Agrupamento e ordenação
// ---------------------------------------------------------------------------

interface Agrupavel {
  sacado?: string;
  empresa?: string;
  status?: StatusPrazo | null;
  valor?: number;
  prazo?: number | null;
  vencimento?: string | null;
}

function chaveDoGrupo(item: Agrupavel, agrupar: Agrupamento): string {
  if (agrupar === "cliente") return item.sacado || "—";
  if (agrupar === "empresa") return item.empresa || "Não classificado";
  if (agrupar === "status")
    return item.status ? STATUS[item.status].rotulo : "—";
  return "—";
}

function comparador<T extends Agrupavel>(ordenar: Ordenacao): (a: T, b: T) => number {
  switch (ordenar) {
    case "nome":
      return (a, b) => (a.sacado ?? "").localeCompare(b.sacado ?? "", "pt-BR");
    case "prazo":
      return (a, b) => (b.prazo ?? -1) - (a.prazo ?? -1);
    case "vencimento":
      return (a, b) => (b.vencimento ?? "").localeCompare(a.vencimento ?? "");
    case "valor":
    default:
      return (a, b) => (b.valor ?? 0) - (a.valor ?? 0);
  }
}

interface Grupo<T> {
  grupo: string | null;
  itens: T[];
  total: number;
}

function agruparEOrdenar<T extends Agrupavel>(
  itens: T[],
  agrupar: Agrupamento,
  ordenar: Ordenacao
): Grupo<T>[] {
  const cmp = comparador<T>(ordenar);
  if (agrupar === "nenhum") {
    const lista = [...itens].sort(cmp);
    return [
      { grupo: null, itens: lista, total: lista.reduce((s, i) => s + (i.valor ?? 0), 0) },
    ];
  }

  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    const chave = chaveDoGrupo(item, agrupar);
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave)!.push(item);
  }

  const grupos: Grupo<T>[] = Array.from(mapa.entries()).map(([grupo, lista]) => ({
    grupo,
    itens: [...lista].sort(cmp),
    total: lista.reduce((s, i) => s + (i.valor ?? 0), 0),
  }));

  if (agrupar === "status") {
    // Pela gravidade: os dois "fora do padrão" saem juntos, no topo.
    grupos.sort(
      (a, b) =>
        gravidade(a.itens[0]?.status ?? null) - gravidade(b.itens[0]?.status ?? null)
    );
  } else {
    grupos.sort((a, b) => b.total - a.total);
  }
  return grupos;
}

/** Escreve uma aba agrupável — a mesma mecânica nas três de dados. */
function escreverAba<T extends Agrupavel>(
  ws: ExcelJS.Worksheet,
  colunas: Coluna[],
  itens: T[],
  agrupar: Agrupamento,
  ordenar: Ordenacao,
  paraLinha: (item: T) => Record<string, unknown>,
  nomeTabela: string
) {
  larguras(ws, colunas);
  const grupos = agruparEOrdenar(itens, agrupar, ordenar);

  // Sem agrupamento cabe uma tabela de verdade, que é melhor de usar.
  if (agrupar === "nenhum") {
    const linhas = grupos[0].itens.map((item) => {
      const d = paraLinha(item);
      return colunas.map((c) =>
        c.chave === "status"
          ? item.status
            ? STATUS[item.status].rotulo
            : "—"
          : (d[c.chave] ?? null)
      );
    });
    tabela(ws, nomeTabela, 1, 1, colunas, linhas);
    grupos[0].itens.forEach((item, i) => pintarStatus(ws, colunas, 2 + i, item.status ?? null));
    ws.views = [{ state: "frozen", ySplit: 1 }];
    return;
  }

  cabecalhoManual(ws, colunas, 1);
  let linha = 2;
  for (const grupo of grupos) {
    linhaGrupo(ws, colunas, linha, {
      [colunas[0].chave]: `${grupo.grupo} (${grupo.itens.length})`,
      ...(colunas.some((c) => c.chave === "valor")
        ? { valor: grupo.total }
        : { valorTotal: grupo.total }),
    });
    linha += 1;
    grupo.itens.forEach((item, i) => {
      linhaManual(ws, colunas, linha, paraLinha(item), {
        zebra: i % 2 === 1,
        nivel: 1,
      });
      pintarStatus(ws, colunas, linha, item.status ?? null);
      linha += 1;
    });
  }
  ws.properties.outlineLevelRow = 1;
}

// ---------------------------------------------------------------------------
// Aba: Resumo (painel)
// ---------------------------------------------------------------------------

function montarResumo(
  ws: ExcelJS.Worksheet,
  boletos: Boleto[],
  limites: LimitesPrazo,
  historico: AcordoHistorico[],
  filtroDescricao: string
) {
  // Uma grade só: 8 colunas úteis, 3 cartões por linha em (B,C) (D,E) (F,G).
  const GRADE = [3, 26, 18, 18, 18, 18, 18, 20];
  ws.columns = GRADE.map((w) => ({ width: w }));

  let linha = titulo(
    ws,
    2,
    2,
    8,
    "Relatório de Contas a Receber — Grupo Ley",
    `${filtroDescricao} · gerado em ${new Date().toLocaleString("pt-BR")}`
  );
  linha += 1;

  const pedidos = agruparPedidos(boletos);
  const comStatus = pedidos.map((p) => ({
    ...p,
    status: classificarPedido(prazoMedioPonderado(p.boletos), p.prazo, limites),
  }));
  const fora = comStatus.filter((p) => p.status !== "normal");
  const naoPermitidos = comStatus.filter((p) => p.status === "nao_permitido");

  const pmGeral = prazoMedioPonderado(boletos);
  const pmSimples = prazoMedio(boletos);
  const desvio = desvioDaMeta(pmGeral, limites.meta);
  const total = valorTotal(boletos);
  const clientes = new Set(boletos.map((b) => b.sacado || "—")).size;
  const valorFora = fora.reduce((s, p) => s + p.valorTotal, 0);

  const kpis: Kpi[] = [
    {
      rotulo: "PRAZO MÉDIO CONCEDIDO",
      valor: pmGeral ?? 0,
      formato: FMT.diasDecimal,
      nota: desvio
        ? `Meta ${limites.meta} d · ${desvio.texto}`
        : `Meta ${limites.meta} dias`,
      tom: desvio?.acimaDaMeta ? "atencao" : "bom",
    },
    {
      rotulo: "PRAZO MÉDIO SIMPLES",
      valor: pmSimples ?? 0,
      formato: FMT.diasDecimal,
      nota: "Cada boleto pesa igual",
    },
    {
      rotulo: "VALOR TOTAL EM CARTEIRA",
      valor: total,
      formato: FMT.moeda,
      nota: `${boletos.length} boleto(s) · ${clientes} cliente(s)`,
    },
    {
      rotulo: "DAVS NA CARTEIRA",
      valor: pedidos.length,
      formato: FMT.inteiro,
      nota:
        pedidos.length > 0
          ? `Ticket médio ${(total / pedidos.length).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
              maximumFractionDigits: 0,
            })}`
          : "—",
    },
    {
      rotulo: "DAVS FORA DO PADRÃO",
      valor: fora.length,
      formato: FMT.inteiro,
      nota:
        pedidos.length > 0
          ? `${Math.round((fora.length / pedidos.length) * 1000) / 10}% das DAVs · ${valorFora.toLocaleString(
              "pt-BR",
              { style: "currency", currency: "BRL", maximumFractionDigits: 0 }
            )}`
          : "—",
      tom: fora.length > 0 ? "atencao" : "bom",
    },
    {
      rotulo: "DAVS NÃO PERMITIDAS",
      valor: naoPermitidos.length,
      formato: FMT.inteiro,
      nota: `Acima de ${limites.maximo} dias · ${naoPermitidos
        .reduce((s, p) => s + p.valorTotal, 0)
        .toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
          maximumFractionDigits: 0,
        })}`,
      tom: naoPermitidos.length > 0 ? "critico" : "bom",
    },
  ];

  kpis.forEach((kpi, i) => {
    const coluna = 2 + (i % 3) * 2;
    const linhaCartao = linha + Math.floor(i / 3) * 4;
    cartaoKpi(ws, linhaCartao, coluna, kpi);
  });
  linha += Math.ceil(kpis.length / 3) * 4;

  // --- Por empresa -------------------------------------------------------
  linha = secao(ws, linha, 2, 8, "Por empresa");
  const empresas = Array.from(
    new Set(boletos.map((b) => b.empresa || "Não classificado"))
  );
  linha = tabela(
    ws,
    "TabEmpresas",
    linha,
    2,
    [
      { cabecalho: "Empresa", chave: "e", largura: 26 },
      { cabecalho: "Prazo médio", chave: "p", largura: 18, formato: FMT.diasDecimal, alinhar: "right" },
      { cabecalho: "Valor em carteira", chave: "v", largura: 18, formato: FMT.moeda, alinhar: "right" },
      { cabecalho: "% da carteira", chave: "pc", largura: 18, formato: FMT.pct, alinhar: "right" },
      { cabecalho: "Boletos", chave: "q", largura: 18, formato: FMT.inteiro, alinhar: "right" },
    ],
    empresas.map((e) => {
      const lista = boletos.filter((b) => (b.empresa || "Não classificado") === e);
      const v = valorTotal(lista);
      return [e, prazoMedioPonderado(lista) ?? 0, v, total > 0 ? v / total : 0, lista.length];
    })
  );

  // --- Por status --------------------------------------------------------
  linha = secao(ws, linha, 2, 8, "Por status da política");
  const porStatus: StatusPrazo[] = ["nao_permitido", "fora_do_padrao", "normal"];
  linha = tabela(
    ws,
    "TabStatus",
    linha,
    2,
    [
      { cabecalho: "Status", chave: "s", largura: 26 },
      { cabecalho: "DAVs", chave: "q", largura: 18, formato: FMT.inteiro, alinhar: "right" },
      { cabecalho: "Valor", chave: "v", largura: 18, formato: FMT.moeda, alinhar: "right" },
      { cabecalho: "% do valor", chave: "pv", largura: 18, formato: FMT.pct, alinhar: "right" },
      { cabecalho: "% das DAVs", chave: "pq", largura: 18, formato: FMT.pct, alinhar: "right" },
    ],
    porStatus.map((s) => {
      const lista = comStatus.filter((p) => p.status === s);
      const v = lista.reduce((acc, p) => acc + p.valorTotal, 0);
      return [
        `${STATUS[s].emoji} ${STATUS[s].rotulo}`,
        lista.length,
        v,
        total > 0 ? v / total : 0,
        pedidos.length > 0 ? lista.length / pedidos.length : 0,
      ];
    })
  );

  // --- Faixas de prazo ---------------------------------------------------
  linha = secao(ws, linha, 2, 8, "Distribuição por faixa de prazo");
  linha = tabela(
    ws,
    "TabFaixas",
    linha,
    2,
    [
      { cabecalho: "Faixa (dias)", chave: "f", largura: 26 },
      { cabecalho: "Boletos", chave: "q", largura: 18, formato: FMT.inteiro, alinhar: "right" },
      { cabecalho: "Valor", chave: "v", largura: 18, formato: FMT.moeda, alinhar: "right" },
      { cabecalho: "% do valor", chave: "pv", largura: 18, formato: FMT.pct, alinhar: "right" },
    ],
    distribuicaoPorFaixa(boletos, limites).map((f) => [
      f.faixa,
      f.quantidade,
      f.valor,
      total > 0 ? f.valor / total : 0,
    ])
  );

  // --- Top clientes ------------------------------------------------------
  linha = secao(ws, linha, 2, 8, "Top 10 clientes por valor em carteira");
  linha = tabela(
    ws,
    "TabTop",
    linha,
    2,
    [
      { cabecalho: "Cliente", chave: "c", largura: 26 },
      { cabecalho: "Boletos", chave: "q", largura: 18, formato: FMT.inteiro, alinhar: "right" },
      { cabecalho: "Prazo médio", chave: "p", largura: 18, formato: FMT.diasDecimal, alinhar: "right" },
      { cabecalho: "Valor", chave: "v", largura: 18, formato: FMT.moeda, alinhar: "right" },
      { cabecalho: "% da carteira", chave: "pc", largura: 18, formato: FMT.pct, alinhar: "right" },
    ],
    topClientes(boletos, 10).map((c) => [
      c.sacado,
      c.quantidade,
      c.prazoMedio ?? 0,
      c.valor,
      total > 0 ? c.valor / total : 0,
    ])
  );

  // --- Acordos -----------------------------------------------------------
  const porCliente = indexarHistorico(historico);
  const resultados = Array.from(porCliente.entries())
    .map(([, h]) => resultadoAcordo(h, limites))
    .filter((r): r is NonNullable<typeof r> => r != null);

  if (resultados.length > 0) {
    linha = secao(ws, linha, 2, 8, "Acordos de redução de prazo");
    const reducoes = resultados
      .map((r) => r.reducaoDias)
      .filter((d): d is number => typeof d === "number");
    const entraram = resultados.filter((r) => r.entrouNoPadrao).length;
    linha = tabela(
      ws,
      "TabAcordosResumo",
      linha,
      2,
      [
        { cabecalho: "Indicador", chave: "i", largura: 26 },
        { cabecalho: "Valor", chave: "v", largura: 18, alinhar: "right" },
      ],
      [
        ["Clientes com acordo registrado", resultados.length],
        [
          "Renegociações no total",
          resultados.reduce((s, r) => s + r.rodadas, 0),
        ],
        [
          "Redução média de prazo",
          reducoes.length > 0
            ? Math.round(reducoes.reduce((s, d) => s + d, 0) / reducoes.length)
            : 0,
        ],
        ["Clientes que entraram no padrão pelo acordo", entraram],
      ]
    );
  }

  ws.pageSetup = {
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };
}

// ---------------------------------------------------------------------------
// Aba: Clientes
// ---------------------------------------------------------------------------

function montarClientes(
  ws: ExcelJS.Worksheet,
  boletos: Boleto[],
  limites: LimitesPrazo,
  acordos: Acordo[],
  historico: AcordoHistorico[],
  agrupar: Agrupamento,
  ordenar: Ordenacao
) {
  const colunas: Coluna[] = [
    { cabecalho: "Cliente", chave: "sacado", largura: 34 },
    { cabecalho: "Empresa", chave: "empresa", largura: 18 },
    { cabecalho: "Boletos", chave: "qtd", largura: 10, formato: FMT.inteiro, alinhar: "right" },
    { cabecalho: "Prazo concedido", chave: "prazo", largura: 16, formato: FMT.diasDecimal, alinhar: "right" },
    { cabecalho: "Vs. meta", chave: "desvio", largura: 12, formato: FMT.pct, alinhar: "right" },
    { cabecalho: "Boletos acima do limite", chave: "acima", largura: 14, formato: FMT.inteiro, alinhar: "right" },
    { cabecalho: "Valor em carteira", chave: "valor", largura: 18, formato: FMT.moeda, alinhar: "right" },
    { cabecalho: "Últ. vencimento", chave: "ultimoVencimento", largura: 15, formato: FMT.data, alinhar: "center" },
    { cabecalho: "Acordo atual", chave: "acordo", largura: 22 },
    { cabecalho: "Acordos", chave: "rodadas", largura: 9, formato: FMT.inteiro, alinhar: "center" },
    { cabecalho: "Redução", chave: "reducao", largura: 11, formato: FMT.dias, alinhar: "right" },
    { cabecalho: "Observação", chave: "observacao", largura: 40 },
    { cabecalho: "Status", chave: "status", largura: 24, alinhar: "center" },
  ];

  const pedidos = agruparPedidos(boletos);
  const indiceAcordo = new Map(acordos.map((a) => [a.cliente_chave, a]));
  const indiceHist = indexarHistorico(historico);

  // O status do CLIENTE é o pior status entre as DAVs dele. Uma média de
  // carteira não tem "não permitido" — isso é regra por DAV, no teto em dias —
  // e é justamente o "não permitido" que precisa saltar aos olhos aqui.
  const piorPorCliente = new Map<string, StatusPrazo | null>();
  for (const p of pedidos) {
    const s = classificarPedido(prazoMedioPonderado(p.boletos), p.prazo, limites);
    const chave = p.sacado || "—";
    const atual = piorPorCliente.get(chave) ?? null;
    if (atual == null || gravidade(s) < gravidade(atual)) {
      piorPorCliente.set(chave, s);
    }
  }

  const itens = resumoClientes(boletos, limites).map((c) => {
    const chave = chaveCliente(c.sacado);
    const acordo = indiceAcordo.get(chave);
    const hist = indiceHist.get(chave) ?? [];
    const resultado = resultadoAcordo(hist, limites);
    const anterior = condicaoPraticada(pedidos, c.sacado);

    const notas: string[] = [];
    if (resultado?.entrouNoPadrao) {
      notas.push(
        `✅ Acordo trouxe para dentro do padrão (era ${resultado.prazoInicial}d, hoje ${resultado.prazoAtual}d)`
      );
    } else if (resultado && (resultado.reducaoDias ?? 0) > 0) {
      notas.push(
        `Prazo reduzido em ${resultado.reducaoDias}d por acordo, mas ainda fora do padrão`
      );
    }
    if (acordo?.sem_alerta) notas.push("Alertas silenciados (estou ciente)");

    return {
      sacado: c.sacado,
      empresa: c.empresas.join(", "),
      qtd: c.quantidade,
      prazo: c.prazoMedio,
      desvio:
        c.prazoMedio != null ? (c.prazoMedio - limites.meta) / limites.meta : null,
      acima: c.acimaLimite,
      valor: c.valor,
      ultimoVencimento: c.ultimoVencimento ? new Date(c.ultimoVencimento) : null,
      acordo: acordo?.condicao_acordada
        ? `${acordo.condicao_anterior ?? anterior.condicao ?? "—"} → ${acordo.condicao_acordada}`
        : "—",
      rodadas: resultado?.rodadas ?? 0,
      reducao: resultado?.reducaoDias ?? null,
      observacao: notas.join(" · ") || "",
      status: piorPorCliente.get(c.sacado) ?? null,
      prazoOrd: c.prazoMedio,
      vencimento: c.ultimoVencimento,
    };
  });

  escreverAba(
    ws,
    colunas,
    itens.map((i) => ({ ...i, prazo: i.prazoOrd })),
    agrupar,
    ordenar,
    (i) => i,
    "TabClientes"
  );
}

// ---------------------------------------------------------------------------
// Aba: DAVs
// ---------------------------------------------------------------------------

function montarVendas(
  ws: ExcelJS.Worksheet,
  boletos: Boleto[],
  limites: LimitesPrazo,
  agrupar: Agrupamento,
  ordenar: Ordenacao
) {
  const colunas: Coluna[] = [
    { cabecalho: "Cliente", chave: "sacado", largura: 34 },
    { cabecalho: "Empresa", chave: "empresa", largura: 18 },
    { cabecalho: "DAV", chave: "documento", largura: 14 },
    { cabecalho: "Parcelas", chave: "parcelas", largura: 10, formato: FMT.inteiro, alinhar: "center" },
    { cabecalho: "Valor total", chave: "valorTotal", largura: 18, formato: FMT.moeda, alinhar: "right" },
    { cabecalho: "Condição", chave: "condicao", largura: 20, alinhar: "center" },
    { cabecalho: "1º venc.", chave: "primeiroVencimento", largura: 14, formato: FMT.data, alinhar: "center" },
    { cabecalho: "Último venc.", chave: "ultimoVencimento", largura: 14, formato: FMT.data, alinhar: "center" },
    { cabecalho: "Prazo", chave: "prazoUltima", largura: 12, formato: FMT.dias, alinhar: "right" },
    { cabecalho: "Prazo médio", chave: "prazoMedio", largura: 14, formato: FMT.diasDecimal, alinhar: "right" },
    { cabecalho: "Status", chave: "status", largura: 24, alinhar: "center" },
  ];

  const vendas: (VendaAPrazo & Agrupavel & { condicao: string })[] = agruparVendas(
    boletos,
    limites.normal + limites.tolerancia
  ).map((v) => ({
    ...v,
    condicao: v.boletos
      .map((b) => b.prazo_dias)
      .filter((p): p is number => typeof p === "number")
      .sort((a, b) => a - b)
      .join("/"),
    status: classificarPedido(v.prazoMedio, v.prazoUltima, limites),
    valor: v.valorTotal,
    prazo: v.prazoUltima,
    vencimento: v.ultimoVencimento,
  }));

  escreverAba(
    ws,
    colunas,
    vendas,
    agrupar,
    ordenar,
    (v) => ({
      sacado: v.sacado,
      empresa: v.empresa,
      documento: v.documento,
      parcelas: v.parcelas,
      valorTotal: v.valorTotal,
      condicao: v.condicao,
      primeiroVencimento: v.primeiroVencimento ? new Date(v.primeiroVencimento) : null,
      ultimoVencimento: v.ultimoVencimento ? new Date(v.ultimoVencimento) : null,
      prazoUltima: v.prazoUltima,
      prazoMedio: v.prazoMedio,
    }),
    "TabDAVs"
  );
}

// ---------------------------------------------------------------------------
// Aba: Boletos
// ---------------------------------------------------------------------------

function montarBoletos(
  ws: ExcelJS.Worksheet,
  boletos: Boleto[],
  limites: LimitesPrazo,
  agrupar: Agrupamento,
  ordenar: Ordenacao
) {
  const colunas: Coluna[] = [
    { cabecalho: "Cliente", chave: "sacado", largura: 34 },
    { cabecalho: "Empresa", chave: "empresa", largura: 18 },
    { cabecalho: "DAV", chave: "documento", largura: 14 },
    { cabecalho: "Parcela", chave: "parcela", largura: 9, alinhar: "center" },
    { cabecalho: "Nosso número", chave: "nosso_numero", largura: 16 },
    { cabecalho: "Entrada", chave: "data_entrada", largura: 13, formato: FMT.data, alinhar: "center" },
    { cabecalho: "Vencimento", chave: "data_vencimento", largura: 13, formato: FMT.data, alinhar: "center" },
    { cabecalho: "Prazo", chave: "prazo_dias", largura: 11, formato: FMT.dias, alinhar: "right" },
    { cabecalho: "Valor", chave: "valor", largura: 16, formato: FMT.moeda, alinhar: "right" },
    { cabecalho: "Status da DAV", chave: "status", largura: 24, alinhar: "center" },
    { cabecalho: "Alerta", chave: "alerta", largura: 12, alinhar: "center" },
  ];

  // O status é da DAV, não do boleto isolado — cada parcela herda o do pedido.
  const statusPorId = new Map<string, StatusPrazo | null>();
  for (const p of agruparPedidos(boletos)) {
    const s = classificarPedido(prazoMedioPonderado(p.boletos), p.prazo, limites);
    for (const id of p.ids) statusPorId.set(id, s);
  }

  const itens = boletos.map((b) => ({
    sacado: b.sacado,
    empresa: b.empresa,
    documento: b.documento || "—",
    parcela: b.parcela ?? "—",
    nosso_numero: b.nosso_numero || "—",
    data_entrada: b.data_entrada ? new Date(b.data_entrada) : null,
    data_vencimento: b.data_vencimento ? new Date(b.data_vencimento) : null,
    prazo_dias: b.prazo_dias,
    valor: b.valor ?? 0,
    alerta: b.alerta_enviado ? "Enviado" : b.excedeu_limite ? "Pendente" : "—",
    status: statusPorId.get(b.id) ?? null,
    prazo: b.prazo_dias,
    vencimento: b.data_vencimento,
  }));

  escreverAba(ws, colunas, itens, agrupar, ordenar, (i) => i, "TabBoletos");
}

// ---------------------------------------------------------------------------
// Aba: Acordos (a linha do tempo)
// ---------------------------------------------------------------------------

function montarAcordos(
  ws: ExcelJS.Worksheet,
  historico: AcordoHistorico[],
  limites: LimitesPrazo
) {
  const colunas: Coluna[] = [
    { cabecalho: "Cliente", chave: "cliente", largura: 34 },
    { cabecalho: "Etapa", chave: "etapa", largura: 20 },
    { cabecalho: "Condição", chave: "condicao", largura: 20, alinhar: "center" },
    { cabecalho: "Prazo", chave: "prazo", largura: 12, formato: FMT.dias, alinhar: "right" },
    { cabecalho: "Variação", chave: "variacao", largura: 12, formato: FMT.variacao, alinhar: "right" },
    { cabecalho: "Data", chave: "data", largura: 14, formato: FMT.data, alinhar: "center" },
    { cabecalho: "Registrado por", chave: "por", largura: 18 },
    { cabecalho: "Situação", chave: "situacao", largura: 30 },
  ];
  larguras(ws, colunas);

  const porCliente = indexarHistorico(historico);
  if (porCliente.size === 0) {
    ws.getCell("A1").value = "Nenhum acordo de prazo registrado ainda.";
    ws.getCell("A1").font = { italic: true, color: { argb: COR.cinza } };
    return;
  }

  cabecalhoManual(ws, colunas, 1);
  const teto = limites.normal + limites.tolerancia;
  let linha = 2;

  // Quem mais reduziu aparece primeiro — é a leitura que interessa.
  const clientes = Array.from(porCliente.entries()).sort((a, b) => {
    const ra = resultadoAcordo(a[1], limites)?.reducaoDias ?? 0;
    const rb = resultadoAcordo(b[1], limites)?.reducaoDias ?? 0;
    return rb - ra;
  });

  for (const [, hist] of clientes) {
    const nome = hist[0]?.cliente_nome ?? "—";
    const resultado = resultadoAcordo(hist, limites);
    const pontos = linhaDoTempo(hist);

    linhaGrupo(ws, colunas, linha, {
      cliente: `${nome} (${resultado?.rodadas ?? 0} acordo${
        (resultado?.rodadas ?? 0) > 1 ? "s" : ""
      })`,
      variacao:
        resultado?.reducaoDias != null ? -resultado.reducaoDias : null,
      situacao: resultado?.entrouNoPadrao
        ? "✅ Entrou no padrão pelo acordo"
        : "",
    });
    linha += 1;

    pontos.forEach((p, i) => {
      linhaManual(
        ws,
        colunas,
        linha,
        {
          cliente: nome,
          etapa: p.rotulo,
          condicao: p.condicao ?? "—",
          prazo: p.prazo,
          variacao: p.variacao,
          data: p.data ? new Date(p.data) : null,
          por: p.registrado_por ?? "—",
          situacao:
            p.prazo == null
              ? ""
              : p.prazo <= teto
                ? "Dentro do padrão"
                : "Fora do padrão",
        },
        { zebra: i % 2 === 1, nivel: 1 }
      );
      // Verde/vermelho na situação, para a leitura em diagonal funcionar.
      if (p.prazo != null) {
        const cel = ws.getRow(linha).getCell(colunas.length);
        const dentro = p.prazo <= teto;
        cel.fill = fill(dentro ? COR.verdeFundo : COR.vermelhoFundo);
        cel.font = { bold: true, color: { argb: dentro ? COR.verde : COR.vermelho } };
      }
      linha += 1;
    });
  }

  ws.properties.outlineLevelRow = 1;
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export async function gerarRelatorioExcel(
  boletos: Boleto[],
  limites: LimitesPrazo,
  acordos: Acordo[],
  historico: AcordoHistorico[],
  opcoes: OpcoesRelatorio
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Contas a Receber 1 — Grupo Ley";
  wb.created = new Date();

  if (opcoes.abas.resumo) {
    const ws = wb.addWorksheet("Resumo", {
      properties: { tabColor: { argb: COR.marca } },
      views: [{ showGridLines: false }],
    });
    montarResumo(ws, boletos, limites, historico, opcoes.filtroDescricao);
  }
  if (opcoes.abas.clientes) {
    montarClientes(
      wb.addWorksheet("Clientes"),
      boletos,
      limites,
      acordos,
      historico,
      opcoes.agrupar,
      opcoes.ordenar
    );
  }
  if (opcoes.abas.vendas) {
    montarVendas(wb.addWorksheet("DAVs"), boletos, limites, opcoes.agrupar, opcoes.ordenar);
  }
  if (opcoes.abas.boletos) {
    montarBoletos(wb.addWorksheet("Boletos"), boletos, limites, opcoes.agrupar, opcoes.ordenar);
  }
  if (opcoes.abas.acordos) {
    montarAcordos(wb.addWorksheet("Acordos"), historico, limites);
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** "relatorio-contas-a-receber-13-08-2026.xlsx" */
export function nomeArquivoRelatorio(): string {
  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, "0");
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  return `relatorio-contas-a-receber-${dia}-${mes}-${hoje.getFullYear()}.xlsx`;
}
