// ---------------------------------------------------------------------------
// lib/relatorio-excel.ts
// Gera o relatório em Excel (.xlsx) com várias abas, agrupamento com colapso
// (o "+/-" do Excel), filtro automático em cada cabeçalho e cores por status.
//
// Roda no navegador (é chamado a partir de app/relatorios/page.tsx). O
// ExcelJS constrói o arquivo em memória e devolve os bytes prontos pra virar
// download — nada disso toca o banco.
// ---------------------------------------------------------------------------

import ExcelJS from "exceljs";

import { chaveCliente, condicaoPraticada, type Acordo } from "./acordos";
import { type Boleto } from "./boletos";
import {
  agruparVendas,
  prazoMedio,
  prazoMedioPonderado,
  resumoClientes,
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

export type AbaRelatorio = "resumo" | "clientes" | "vendas" | "boletos";
export type Agrupamento = "nenhum" | "cliente" | "empresa" | "status";
export type Ordenacao = "valor" | "prazo" | "nome" | "vencimento";

export interface OpcoesRelatorio {
  abas: Record<AbaRelatorio, boolean>;
  agrupar: Agrupamento;
  ordenar: Ordenacao;
  /** Só para o cabeçalho do Resumo — o recorte que o usuário aplicou. */
  filtroDescricao: string;
}

// ---------------------------------------------------------------------------
// Estilo — uma paleta só, para as quatro abas conversarem entre si.
// ---------------------------------------------------------------------------

const COR = {
  marca: "FF5048E5",
  marcaClara: "FFEEF0FF",
  cabecalhoTexto: "FFFFFFFF",
  grupoFundo: "FFE0E4FF",
  zebra: "FFF8FAFC",
  bordaClara: "FFE2E8F0",
  normalFundo: "FFDCFCE7",
  normalTexto: "FF166534",
  foraFundo: "FFFEE2E2",
  foraTexto: "FF991B1B",
  naoPermitidoFundo: "FFFECACA",
  naoPermitidoTexto: "FF7F1D1D",
  cinzaTexto: "FF64748B",
} as const;

const FMT_MOEDA = '"R$" #,##0.00';
const FMT_DATA = "dd/mm/yyyy";
const FMT_PCT = "0.0%";

const FONTE_TITULO: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 18,
  bold: true,
  color: { argb: COR.marca },
};
const FONTE_SUBTITULO: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 10,
  color: { argb: COR.cinzaTexto },
};
const FONTE_CABECALHO: Partial<ExcelJS.Font> = {
  name: "Calibri",
  size: 10,
  bold: true,
  color: { argb: COR.cabecalhoTexto },
};

function corStatus(status: StatusPrazo | null): { fundo: string; texto: string } {
  if (status === "nao_permitido")
    return { fundo: COR.naoPermitidoFundo, texto: COR.naoPermitidoTexto };
  if (status === "fora_do_padrao")
    return { fundo: COR.foraFundo, texto: COR.foraTexto };
  return { fundo: COR.normalFundo, texto: COR.normalTexto };
}

function preencher(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

const BORDA_FINA: Partial<ExcelJS.Border> = { style: "thin", color: { argb: COR.bordaClara } };

interface Coluna {
  cabecalho: string;
  chave: string;
  largura: number;
  formato?: string;
  alinhar?: "left" | "center" | "right";
}

/** Escreve o cabeçalho da tabela: fundo de marca, texto branco, congelado. */
function escreverCabecalho(ws: ExcelJS.Worksheet, colunas: Coluna[], linha: number) {
  ws.columns = colunas.map((c) => ({ width: c.largura }));
  const row = ws.getRow(linha);
  colunas.forEach((c, i) => {
    const cell = row.getCell(i + 1);
    cell.value = c.cabecalho;
    cell.font = FONTE_CABECALHO;
    cell.fill = preencher(COR.marca);
    cell.alignment = { vertical: "middle", horizontal: c.alinhar ?? "left", wrapText: true };
    cell.border = { bottom: BORDA_FINA };
  });
  row.height = 20;
  ws.autoFilter = {
    from: { row: linha, column: 1 },
    to: { row: linha, column: colunas.length },
  };
  ws.views = [{ state: "frozen", ySplit: linha }];
}

/** Uma linha de dados: zebra nas pares, valores formatados por coluna. */
function escreverLinha(
  ws: ExcelJS.Worksheet,
  colunas: Coluna[],
  linha: number,
  dados: Record<string, unknown>,
  opcoes: { zebra?: boolean; nivel?: number; corTexto?: string } = {}
) {
  const row = ws.getRow(linha);
  if (opcoes.nivel) row.outlineLevel = opcoes.nivel;
  colunas.forEach((c, i) => {
    const cell = row.getCell(i + 1);
    cell.value = dados[c.chave] as ExcelJS.CellValue;
    if (c.formato) cell.numFmt = c.formato;
    cell.alignment = { vertical: "middle", horizontal: c.alinhar ?? "left" };
    cell.border = { bottom: BORDA_FINA };
    if (opcoes.zebra) cell.fill = preencher(COR.zebra);
    if (opcoes.corTexto) cell.font = { color: { argb: opcoes.corTexto } };
  });
}

/** Colore só a célula de status (fundo + texto), depois da linha escrita. */
function pintarStatus(
  ws: ExcelJS.Worksheet,
  colunas: Coluna[],
  linha: number,
  chaveStatus: string,
  status: StatusPrazo | null
) {
  const idx = colunas.findIndex((c) => c.chave === chaveStatus);
  if (idx < 0) return;
  const { fundo, texto } = corStatus(status);
  const cell = ws.getRow(linha).getCell(idx + 1);
  cell.fill = preencher(fundo);
  cell.font = { bold: true, color: { argb: texto } };
  cell.alignment = { vertical: "middle", horizontal: "center" };
}

/** Linha de grupo: fundo lilás, negrito — o cabeçalho que fica visível quando colapsa. */
function escreverGrupo(
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
    cell.font = { bold: true };
    cell.fill = preencher(COR.grupoFundo);
    cell.alignment = { vertical: "middle", horizontal: c.alinhar ?? "left" };
    cell.border = { top: BORDA_FINA, bottom: BORDA_FINA };
  });
  row.height = 18;
}

// ---------------------------------------------------------------------------
// Agrupamento e ordenação — genéricos, usados nas três abas de tabela.
// ---------------------------------------------------------------------------

function chaveDoGrupo(item: {
  sacado?: string;
  empresa?: string;
  status?: StatusPrazo | null;
}, agrupar: Agrupamento): string | null {
  if (agrupar === "nenhum") return null;
  if (agrupar === "cliente") return item.sacado || "—";
  if (agrupar === "empresa") return item.empresa || "Não classificado";
  if (agrupar === "status") return item.status ? STATUS[item.status].rotulo : "—";
  return null;
}

function comparador<T extends { sacado?: string; valor?: number; prazo?: number | null; vencimento?: string | null }>(
  ordenar: Ordenacao
): (a: T, b: T) => number {
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

/** Agrupa (se pedido), ordena os grupos por valor total e cada grupo internamente. */
function agruparEOrdenar<
  T extends { sacado?: string; empresa?: string; status?: StatusPrazo | null; valor?: number; prazo?: number | null; vencimento?: string | null },
>(itens: T[], agrupar: Agrupamento, ordenar: Ordenacao): { grupo: string | null; itens: T[] }[] {
  const cmp = comparador<T>(ordenar);
  if (agrupar === "nenhum") {
    return [{ grupo: null, itens: [...itens].sort(cmp) }];
  }
  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    const chave = chaveDoGrupo(item, agrupar) ?? "—";
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave)!.push(item);
  }
  const grupos = Array.from(mapa.entries()).map(([grupo, lista]) => ({
    grupo,
    itens: [...lista].sort(cmp),
    total: lista.reduce((s, i) => s + (i.valor ?? 0), 0),
  }));
  grupos.sort((a, b) => b.total - a.total);
  return grupos;
}

// ---------------------------------------------------------------------------
// Aba 1 — Resumo (KPIs)
// ---------------------------------------------------------------------------

function montarResumo(
  ws: ExcelJS.Worksheet,
  boletos: Boleto[],
  limites: LimitesPrazo,
  filtroDescricao: string
) {
  ws.columns = [{ width: 4 }, { width: 30 }, { width: 20 }, { width: 4 }, { width: 30 }, { width: 20 }];

  ws.mergeCells("B2:F2");
  const titulo = ws.getCell("B2");
  titulo.value = "Relatório de Contas a Receber — Grupo Ley";
  titulo.font = FONTE_TITULO;

  ws.mergeCells("B3:F3");
  const subtitulo = ws.getCell("B3");
  subtitulo.value = `${filtroDescricao} · gerado em ${new Date().toLocaleString("pt-BR")}`;
  subtitulo.font = FONTE_SUBTITULO;

  const pedidos = agruparPedidos(boletos);
  const indPedidos = pedidos.map((p) => ({
    prazo: p.prazo,
    valorTotal: p.valorTotal,
    media: prazoMedioPonderado(p.boletos),
    status: classificarPedido(prazoMedioPonderado(p.boletos), p.prazo, limites),
  }));
  const foraDoPadrao = indPedidos.filter((p) => p.status !== "normal");
  const naoPermitidos = indPedidos.filter((p) => p.status === "nao_permitido");

  const pmGeral = prazoMedioPonderado(boletos);
  const pmSimples = prazoMedio(boletos);
  const desvio = desvioDaMeta(pmGeral, limites.meta);
  const total = valorTotal(boletos);

  const empresas = Array.from(new Set(boletos.map((b) => b.empresa || "Não classificado")));

  type Kpi = { rotulo: string; valor: string; nota?: string; tom?: "normal" | "alerta" | "critico" };
  const kpis: Kpi[] = [
    {
      rotulo: "Prazo médio concedido",
      valor: pmGeral != null ? `${pmGeral} dias` : "—",
      nota: desvio ? `Meta ${limites.meta}d · ${desvio.texto}` : `Meta ${limites.meta} dias`,
      tom: desvio?.acimaDaMeta ? "alerta" : "normal",
    },
    {
      rotulo: "Prazo médio simples",
      valor: pmSimples != null ? `${pmSimples} dias` : "—",
      nota: "Cada boleto pesa igual",
    },
    { rotulo: "Valor total em carteira", valor: total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
    { rotulo: "DAVs na carteira", valor: String(pedidos.length), nota: `${boletos.length} boleto(s)` },
    {
      rotulo: "DAVs fora do padrão",
      valor: `${foraDoPadrao.length} · ${pedidos.length > 0 ? Math.round((foraDoPadrao.length / pedidos.length) * 1000) / 10 : 0}%`,
      nota: foraDoPadrao.reduce((s, p) => s + p.valorTotal, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      tom: foraDoPadrao.length > 0 ? "alerta" : "normal",
    },
    {
      rotulo: "DAVs não permitidos",
      valor: String(naoPermitidos.length),
      nota: naoPermitidos.reduce((s, p) => s + p.valorTotal, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      tom: naoPermitidos.length > 0 ? "critico" : "normal",
    },
  ];

  let linha = 5;
  const corTom = { normal: COR.normalTexto, alerta: COR.foraTexto, critico: COR.naoPermitidoTexto };
  for (let i = 0; i < kpis.length; i += 2) {
    const par = [kpis[i], kpis[i + 1]].filter(Boolean) as Kpi[];
    par.forEach((kpi, j) => {
      const colRotulo = j === 0 ? "B" : "E";
      const colValor = j === 0 ? "C" : "F";
      ws.getCell(`${colRotulo}${linha}`).value = kpi.rotulo;
      ws.getCell(`${colRotulo}${linha}`).font = { size: 10, color: { argb: COR.cinzaTexto } };
      const cel = ws.getCell(`${colValor}${linha}`);
      cel.value = kpi.valor;
      cel.font = { size: 13, bold: true, color: { argb: kpi.tom ? corTom[kpi.tom] : "FF0F172A" } };
      cel.alignment = { horizontal: "right" };
      if (kpi.nota) {
        ws.getCell(`${colRotulo}${linha + 1}`).value = kpi.nota;
        ws.getCell(`${colRotulo}${linha + 1}`).font = { size: 9, italic: true, color: { argb: COR.cinzaTexto } };
        ws.mergeCells(`${colRotulo}${linha + 1}:${colValor}${linha + 1}`);
      }
    });
    linha += 3;
  }

  // Por empresa.
  linha += 1;
  ws.mergeCells(`B${linha}:F${linha}`);
  ws.getCell(`B${linha}`).value = "Por empresa";
  ws.getCell(`B${linha}`).font = { bold: true, size: 12 };
  linha += 1;

  const colunasEmpresa: Coluna[] = [
    { cabecalho: "Empresa", chave: "empresa", largura: 22 },
    { cabecalho: "Prazo médio concedido", chave: "prazo", largura: 20, formato: "0.0", alinhar: "right" },
    { cabecalho: "Valor em carteira", chave: "valor", largura: 20, formato: FMT_MOEDA, alinhar: "right" },
    { cabecalho: "Boletos", chave: "qtd", largura: 12, alinhar: "right" },
  ];
  escreverCabecalhoDeslocado(ws, colunasEmpresa, linha, 2);
  linha += 1;
  empresas.forEach((empresa, i) => {
    const doEmpresa = boletos.filter((b) => (b.empresa || "Não classificado") === empresa);
    escreverLinhaDeslocada(
      ws,
      colunasEmpresa,
      linha,
      2,
      {
        empresa,
        prazo: prazoMedioPonderado(doEmpresa) ?? "—",
        valor: valorTotal(doEmpresa),
        qtd: doEmpresa.length,
      },
      { zebra: i % 2 === 1 }
    );
    linha += 1;
  });

  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1 };
}

/** Variante de escreverCabecalho que começa numa coluna deslocada (para o Resumo). */
function escreverCabecalhoDeslocado(ws: ExcelJS.Worksheet, colunas: Coluna[], linha: number, colInicial: number) {
  const row = ws.getRow(linha);
  colunas.forEach((c, i) => {
    const cell = row.getCell(colInicial + i);
    cell.value = c.cabecalho;
    cell.font = FONTE_CABECALHO;
    cell.fill = preencher(COR.marca);
    cell.alignment = { vertical: "middle", horizontal: c.alinhar ?? "left" };
  });
  row.height = 18;
}

function escreverLinhaDeslocada(
  ws: ExcelJS.Worksheet,
  colunas: Coluna[],
  linha: number,
  colInicial: number,
  dados: Record<string, unknown>,
  opcoes: { zebra?: boolean } = {}
) {
  const row = ws.getRow(linha);
  colunas.forEach((c, i) => {
    const cell = row.getCell(colInicial + i);
    cell.value = dados[c.chave] as ExcelJS.CellValue;
    if (c.formato) cell.numFmt = c.formato;
    cell.alignment = { vertical: "middle", horizontal: c.alinhar ?? "left" };
    cell.border = { bottom: BORDA_FINA };
    if (opcoes.zebra) cell.fill = preencher(COR.zebra);
  });
}

// ---------------------------------------------------------------------------
// Aba 2 — Clientes
// ---------------------------------------------------------------------------

function montarClientes(
  ws: ExcelJS.Worksheet,
  boletos: Boleto[],
  limites: LimitesPrazo,
  acordos: Acordo[],
  agrupar: Agrupamento,
  ordenar: Ordenacao
) {
  const pedidos = agruparPedidos(boletos);
  const indice = new Map(acordos.map((a) => [a.cliente_chave, a]));

  const colunas: Coluna[] = [
    { cabecalho: "Cliente", chave: "sacado", largura: 32 },
    { cabecalho: "Empresa", chave: "empresa", largura: 16 },
    { cabecalho: "Boletos", chave: "qtd", largura: 10, alinhar: "right" },
    { cabecalho: "Prazo concedido (dias)", chave: "prazo", largura: 18, formato: "0.0", alinhar: "right" },
    { cabecalho: "Vs. meta", chave: "desvio", largura: 12, formato: FMT_PCT, alinhar: "right" },
    { cabecalho: "Acima do limite", chave: "acima", largura: 14, alinhar: "right" },
    { cabecalho: "Valor em carteira", chave: "valor", largura: 18, formato: FMT_MOEDA, alinhar: "right" },
    { cabecalho: "Últ. vencimento", chave: "ultimoVencimento", largura: 16, formato: FMT_DATA, alinhar: "center" },
    { cabecalho: "Acordo atual", chave: "acordo", largura: 26 },
    { cabecalho: "Status", chave: "status", largura: 22, alinhar: "center" },
  ];

  const linhaCabecalho = 1;
  escreverCabecalho(ws, colunas, linhaCabecalho);

  const detalhes = resumoClientes(boletos, limites);
  const itens = detalhes.map((c) => {
    // Aqui é o prazo médio de TODA a carteira do cliente, não de uma DAV —
    // não existe "não permitido" agregado (isso é regra por DAV, no teto em
    // dias). O que dá pra dizer, no nível do cliente, é se a média está
    // fugindo da meta.
    const status: StatusPrazo | null =
      c.prazoMedio == null ? null : desvioDaMeta(c.prazoMedio, limites.meta)?.acimaDaMeta
        ? "fora_do_padrao"
        : "normal";
    const acordo = indice.get(chaveCliente(c.sacado));
    const anterior = condicaoPraticada(pedidos, c.sacado);
    return {
      sacado: c.sacado,
      empresa: c.empresas[0] ?? "Não classificado",
      empresas: c.empresas.join(", "),
      qtd: c.quantidade,
      prazo: c.prazoMedio,
      desvio: c.prazoMedio != null ? (c.prazoMedio - limites.meta) / limites.meta : null,
      acima: c.acimaLimite,
      valor: c.valor,
      ultimoVencimento: c.ultimoVencimento ? new Date(c.ultimoVencimento) : null,
      acordo: acordo?.condicao_acordada
        ? `${acordo.condicao_anterior ?? anterior.condicao ?? "—"} → ${acordo.condicao_acordada}`
        : "—",
      status,
    };
  });

  const grupos = agruparEOrdenar(itens, agrupar, ordenar);
  let linha = linhaCabecalho + 1;
  for (const grupo of grupos) {
    if (grupo.grupo != null) {
      const valorGrupo = grupo.itens.reduce((s, i) => s + i.valor, 0);
      escreverGrupo(ws, colunas, linha, {
        sacado: `${grupo.grupo} (${grupo.itens.length})`,
        valor: valorGrupo,
      });
      linha += 1;
    }
    grupo.itens.forEach((item, i) => {
      escreverLinha(ws, colunas, linha, { ...item, empresa: item.empresas }, {
        zebra: i % 2 === 1,
        nivel: grupo.grupo != null ? 1 : 0,
      });
      pintarStatus(ws, colunas, linha, "status", item.status);
      const cel = ws.getRow(linha).getCell(colunas.findIndex((c) => c.chave === "status") + 1);
      cel.value = item.status ? STATUS[item.status].rotulo : "—";
      linha += 1;
    });
  }

  if (grupos.some((g) => g.grupo != null)) {
    ws.properties.outlineLevelRow = 1;
  }
}

// ---------------------------------------------------------------------------
// Aba 3 — Vendas (DAVs)
// ---------------------------------------------------------------------------

function montarVendas(
  ws: ExcelJS.Worksheet,
  boletos: Boleto[],
  limites: LimitesPrazo,
  agrupar: Agrupamento,
  ordenar: Ordenacao
) {
  const colunas: Coluna[] = [
    { cabecalho: "Cliente", chave: "sacado", largura: 32 },
    { cabecalho: "Empresa", chave: "empresa", largura: 16 },
    { cabecalho: "DAV", chave: "documento", largura: 12 },
    { cabecalho: "Parcelas", chave: "parcelas", largura: 10, alinhar: "right" },
    { cabecalho: "Valor total", chave: "valorTotal", largura: 16, formato: FMT_MOEDA, alinhar: "right" },
    { cabecalho: "1º venc.", chave: "primeiroVencimento", largura: 14, formato: FMT_DATA, alinhar: "center" },
    { cabecalho: "Último venc.", chave: "ultimoVencimento", largura: 14, formato: FMT_DATA, alinhar: "center" },
    { cabecalho: "Prazo (dias)", chave: "prazoUltima", largura: 12, alinhar: "right" },
    { cabecalho: "Status", chave: "status", largura: 22, alinhar: "center" },
  ];

  escreverCabecalho(ws, colunas, 1);

  const vendas: (VendaAPrazo & { status: StatusPrazo | null; valor: number; prazo: number | null; vencimento: string | null })[] =
    agruparVendas(boletos, limites.normal + limites.tolerancia).map((v) => ({
      ...v,
      status: classificarPedido(v.prazoMedio, v.prazoUltima, limites),
      valor: v.valorTotal,
      prazo: v.prazoUltima,
      vencimento: v.ultimoVencimento,
    }));

  const grupos = agruparEOrdenar(vendas, agrupar, ordenar);
  let linha = 2;
  for (const grupo of grupos) {
    if (grupo.grupo != null) {
      const valorGrupo = grupo.itens.reduce((s, i) => s + i.valor, 0);
      escreverGrupo(ws, colunas, linha, { sacado: `${grupo.grupo} (${grupo.itens.length})`, valorTotal: valorGrupo });
      linha += 1;
    }
    grupo.itens.forEach((v, i) => {
      escreverLinha(
        ws,
        colunas,
        linha,
        {
          sacado: v.sacado,
          empresa: v.empresa,
          documento: v.documento,
          parcelas: v.parcelas,
          valorTotal: v.valorTotal,
          primeiroVencimento: v.primeiroVencimento ? new Date(v.primeiroVencimento) : null,
          ultimoVencimento: v.ultimoVencimento ? new Date(v.ultimoVencimento) : null,
          prazoUltima: v.prazoUltima,
        },
        { zebra: i % 2 === 1, nivel: grupo.grupo != null ? 1 : 0 }
      );
      const cel = ws.getRow(linha).getCell(colunas.findIndex((c) => c.chave === "status") + 1);
      cel.value = v.status ? STATUS[v.status].rotulo : "—";
      pintarStatus(ws, colunas, linha, "status", v.status);
      linha += 1;
    });
  }

  if (grupos.some((g) => g.grupo != null)) {
    ws.properties.outlineLevelRow = 1;
  }
}

// ---------------------------------------------------------------------------
// Aba 4 — Boletos
// ---------------------------------------------------------------------------

function montarBoletos(
  ws: ExcelJS.Worksheet,
  boletos: Boleto[],
  limites: LimitesPrazo,
  agrupar: Agrupamento,
  ordenar: Ordenacao
) {
  const colunas: Coluna[] = [
    { cabecalho: "Cliente", chave: "sacado", largura: 32 },
    { cabecalho: "Empresa", chave: "empresa", largura: 16 },
    { cabecalho: "DAV", chave: "documento", largura: 12 },
    { cabecalho: "Parcela", chave: "parcela", largura: 10, alinhar: "center" },
    { cabecalho: "Nosso número", chave: "nosso_numero", largura: 16 },
    { cabecalho: "Entrada", chave: "data_entrada", largura: 14, formato: FMT_DATA, alinhar: "center" },
    { cabecalho: "Vencimento", chave: "data_vencimento", largura: 14, formato: FMT_DATA, alinhar: "center" },
    { cabecalho: "Prazo (dias)", chave: "prazo_dias", largura: 12, alinhar: "right" },
    { cabecalho: "Valor", chave: "valor", largura: 16, formato: FMT_MOEDA, alinhar: "right" },
    { cabecalho: "Status da DAV", chave: "status", largura: 22, alinhar: "center" },
    { cabecalho: "Alerta", chave: "alerta", largura: 14, alinhar: "center" },
  ];

  escreverCabecalho(ws, colunas, 1);

  // Status é do pedido (DAV), não do boleto isolado — herda do agrupamento por venda.
  const pedidos = agruparPedidos(boletos);
  const statusPorId = new Map<string, StatusPrazo | null>();
  for (const p of pedidos) {
    const status = classificarPedido(prazoMedioPonderado(p.boletos), p.prazo, limites);
    for (const id of p.ids) statusPorId.set(id, status);
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
    status: statusPorId.get(b.id) ?? null,
    alerta: b.alerta_enviado ? "Enviado" : b.excedeu_limite ? "Pendente" : "—",
    prazo: b.prazo_dias,
    vencimento: b.data_vencimento,
  }));

  const grupos = agruparEOrdenar(itens, agrupar, ordenar);
  let linha = 2;
  for (const grupo of grupos) {
    if (grupo.grupo != null) {
      const valorGrupo = grupo.itens.reduce((s, i) => s + i.valor, 0);
      escreverGrupo(ws, colunas, linha, { sacado: `${grupo.grupo} (${grupo.itens.length})`, valor: valorGrupo });
      linha += 1;
    }
    grupo.itens.forEach((item, i) => {
      escreverLinha(ws, colunas, linha, item, { zebra: i % 2 === 1, nivel: grupo.grupo != null ? 1 : 0 });
      const cel = ws.getRow(linha).getCell(colunas.findIndex((c) => c.chave === "status") + 1);
      cel.value = item.status ? STATUS[item.status].rotulo : "—";
      pintarStatus(ws, colunas, linha, "status", item.status);
      linha += 1;
    });
  }

  if (grupos.some((g) => g.grupo != null)) {
    ws.properties.outlineLevelRow = 1;
  }
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export async function gerarRelatorioExcel(
  boletos: Boleto[],
  limites: LimitesPrazo,
  acordos: Acordo[],
  opcoes: OpcoesRelatorio
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Contas a Receber 1 — Grupo Ley";
  wb.created = new Date();

  if (opcoes.abas.resumo) {
    const ws = wb.addWorksheet("Resumo", { properties: { tabColor: { argb: COR.marca } } });
    montarResumo(ws, boletos, limites, opcoes.filtroDescricao);
  }
  if (opcoes.abas.clientes) {
    const ws = wb.addWorksheet("Clientes");
    montarClientes(ws, boletos, limites, acordos, opcoes.agrupar, opcoes.ordenar);
  }
  if (opcoes.abas.vendas) {
    const ws = wb.addWorksheet("DAVs");
    montarVendas(ws, boletos, limites, opcoes.agrupar, opcoes.ordenar);
  }
  if (opcoes.abas.boletos) {
    const ws = wb.addWorksheet("Boletos");
    montarBoletos(ws, boletos, limites, opcoes.agrupar, opcoes.ordenar);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/** Nome de arquivo com a data — "relatorio-contas-a-receber-13-08-2026.xlsx". */
export function nomeArquivoRelatorio(): string {
  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, "0");
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  return `relatorio-contas-a-receber-${dia}-${mes}-${hoje.getFullYear()}.xlsx`;
}
