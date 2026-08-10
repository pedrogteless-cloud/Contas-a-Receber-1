// ---------------------------------------------------------------------------
// lib/boletos.ts
// Tipos, formatadores e parsers do relatório Sicoob (XLSX e PDF).
// App interno Grupo Ley — "Contas a Receber 1".
// ---------------------------------------------------------------------------

export const EMPRESAS = ["Ley Móveis", "Ley Colchões"] as const;
export type Empresa = (typeof EMPRESAS)[number];

/** Registro persistido na tabela `boletos`. */
export interface Boleto {
  id: string;
  data_importacao: string; // ISO yyyy-mm-dd
  empresa: string;
  sacado: string;
  nosso_numero: string | null;
  seu_numero: string | null;
  data_entrada: string | null; // ISO yyyy-mm-dd
  data_vencimento: string | null; // ISO yyyy-mm-dd
  valor: number;
  prazo_dias: number | null;
  /** Documento da venda (base do "seu número", sem o sufixo da parcela). */
  documento?: string | null;
  parcela?: number | null;
  total_parcelas?: number | null;
  /** Dias até receber a última parcela da venda. */
  prazo_recebimento?: number | null;
  excedeu_limite: boolean;
  alerta_enviado: boolean;
  created_at: string;
}

/** Linha extraída do relatório, ainda editável na tela de conferência. */
export interface LinhaImportada {
  empresa: string;
  sacado: string;
  nosso_numero: string;
  seu_numero: string;
  data_entrada: string | null; // ISO yyyy-mm-dd
  data_vencimento: string | null; // ISO yyyy-mm-dd
  valor: number;
  prazo_dias: number | null;
}

// ---------------------------------------------------------------------------
// Formatação (pt-BR)
// ---------------------------------------------------------------------------

/** ISO (yyyy-mm-dd) -> DD/MM/AAAA. */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** number -> "R$ 1.234,56". */
export function formatarMoeda(valor: number | null | undefined): string {
  const n = typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// Parsing de valores e datas
// ---------------------------------------------------------------------------

function removerAcentos(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalizar(s: unknown): string {
  return removerAcentos(String(s ?? "").toLowerCase()).trim();
}

/** Converte serial de data do Excel (base 1899-12-30) para ISO. */
function serialExcelParaISO(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  // Excel: dia 1 = 1900-01-01, com o bug do ano 1900. Base 1899-12-30.
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Interpreta uma célula de data (string DD/MM/AAAA, Date do SheetJS ou serial
 * numérico do Excel) e devolve ISO yyyy-mm-dd, ou null.
 */
export function parseData(valor: unknown): string | null {
  if (valor == null || valor === "") return null;

  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    // Normaliza para meia-noite local -> ISO.
    const ano = valor.getFullYear();
    const mes = String(valor.getMonth() + 1).padStart(2, "0");
    const dia = String(valor.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }

  if (typeof valor === "number") {
    // Numa coluna de data, um número é serial do Excel.
    if (valor > 20000 && valor < 90000) return serialExcelParaISO(valor);
    return null;
  }

  const texto = String(valor).trim();

  // Já em ISO?
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DD/MM/AAAA ou DD/MM/AA (com hora opcional).
  const br = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/.exec(texto);
  if (br) {
    let [, dia, mes, ano] = br;
    if (ano.length === 2) ano = Number(ano) > 70 ? `19${ano}` : `20${ano}`;
    const d = dia.padStart(2, "0");
    const mo = mes.padStart(2, "0");
    if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31)
      return null;
    return `${ano}-${mo}-${d}`;
  }

  return null;
}

/** Interpreta um valor monetário (number ou string "1.234,56"/"R$ ..."). */
export function parseValor(valor: unknown): number {
  if (valor == null || valor === "") return 0;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;

  let s = String(valor).trim();
  s = s.replace(/r\$/gi, "").replace(/\s/g, "");
  if (!s) return 0;

  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");

  if (temVirgula && temPonto) {
    // Formato pt-BR: ponto = milhar, vírgula = decimal.
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (temVirgula) {
    // Só vírgula -> decimal.
    s = s.replace(",", ".");
  }
  // Só ponto -> assume decimal (ex.: "1234.56").

  const n = parseFloat(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Dias corridos entre entrada e vencimento (>= 0), ou null. */
export function calcularPrazoDias(
  entradaISO: string | null,
  vencimentoISO: string | null
): number | null {
  if (!entradaISO || !vencimentoISO) return null;
  const a = Date.parse(`${entradaISO}T00:00:00Z`);
  const b = Date.parse(`${vencimentoISO}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

// ---------------------------------------------------------------------------
// Nome do cliente
// ---------------------------------------------------------------------------

const CONECTIVOS = new Set([
  "de", "da", "do", "das", "dos", "e", "ltda", "me", "epp", "eireli",
  "sa", "s/a", "s.a", "cia", "&",
]);

/** Versão curta do nome do sacado para exibição em chip. */
export function abreviarNome(nome: string): string {
  const limpo = (nome ?? "").trim().replace(/\s+/g, " ");
  if (!limpo) return "—";

  const palavras = limpo.split(" ");
  if (palavras.length <= 2) return limpo;

  const significativas = palavras.filter(
    (p) => !CONECTIVOS.has(removerAcentos(p.toLowerCase()))
  );
  const base = significativas.length >= 2 ? significativas : palavras;
  return base.slice(0, 2).join(" ");
}

/**
 * Tenta descobrir a empresa (Ley Móveis / Ley Colchões) pelo conteúdo do
 * relatório — ex.: o Sicoob traz "Cedente: ... LEY MOVEIS LTDA" ou
 * "LEY INDUSTRIA DE COLCHOES LTDA". Devolve null se não reconhecer.
 */
export function detectarEmpresa(texto: string): string | null {
  const t = removerAcentos(String(texto ?? "").toLowerCase());
  if (/colcho|colchoa/.test(t)) return "Ley Colchões";
  if (/\bmoveis\b|ley moveis/.test(t)) return "Ley Móveis";
  return null;
}

/**
 * Identifica a COMPRA (documento) e a parcela a partir do "seu número".
 *
 * Os bancos numeram as parcelas com um sufixo: uma venda parcelada aparece
 * como 442415-01, 442415-02, 442415-03 (Sicoob) ou 53893-1 ... 53893-6
 * (Itaú). A base antes do último hífen identifica a compra.
 */
export function documentoEParcela(seuNumero: string | null | undefined): {
  documento: string;
  parcela: number | null;
} {
  const primeiro = String(seuNumero ?? "").trim().split(/\s+/)[0] ?? "";
  if (!primeiro) return { documento: "", parcela: null };

  const m = /^(.*)-(\d{1,3})$/.exec(primeiro);
  if (m) return { documento: m[1], parcela: Number(m[2]) };
  return { documento: primeiro, parcela: null };
}

/**
 * Chave da compra: empresa + sacado + documento. Boletos com a mesma chave são
 * parcelas do mesmo parcelamento (ex.: R$ 10.000 em 4x de R$ 2.500).
 */
export function chaveCompra(b: {
  empresa?: string | null;
  sacado?: string | null;
  seu_numero?: string | null;
  nosso_numero?: string | null;
}): string {
  const { documento } = documentoEParcela(b.seu_numero);
  const base = documento || String(b.nosso_numero ?? "").trim();
  return [
    (b.empresa ?? "").trim().toLowerCase(),
    (b.sacado ?? "").trim().toLowerCase(),
    base.toLowerCase(),
  ].join("|");
}

export interface DadosVenda {
  documento: string;
  parcela: number | null;
  total_parcelas: number;
  /** Dias até receber a ÚLTIMA parcela da venda. */
  prazo_recebimento: number | null;
}

/**
 * Calcula, para cada linha, os dados da venda a que ela pertence: documento,
 * nº da parcela, total de parcelas e o PRAZO DE RECEBIMENTO — os dias entre a
 * entrada e o vencimento da última parcela.
 *
 * É esse prazo que representa a decisão de crédito: uma venda de R$ 10.000 em
 * 4x é um crédito de ~120 dias, não quatro créditos separados.
 *
 * `extras` permite considerar boletos já gravados (mesma venda importada em
 * dias diferentes) ao calcular o prazo da venda.
 */
export function calcularDadosVenda<
  T extends {
    empresa?: string | null;
    sacado?: string | null;
    seu_numero?: string | null;
    nosso_numero?: string | null;
    data_entrada?: string | null;
    data_vencimento?: string | null;
  },
>(linhas: T[], extras: T[] = []): DadosVenda[] {
  const grupos = new Map<string, T[]>();
  for (const l of [...linhas, ...extras]) {
    const chave = chaveCompra(l);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(l);
  }

  return linhas.map((l) => {
    const grupo = grupos.get(chaveCompra(l)) ?? [l];
    const { documento, parcela } = documentoEParcela(l.seu_numero);

    // Entrada mais antiga e vencimento mais distante da venda.
    const entradas = grupo
      .map((g) => g.data_entrada)
      .filter((d): d is string => Boolean(d))
      .sort();
    const vencimentos = grupo
      .map((g) => g.data_vencimento)
      .filter((d): d is string => Boolean(d))
      .sort();

    return {
      documento: documento || String(l.nosso_numero ?? "").trim(),
      parcela,
      total_parcelas: grupo.length,
      prazo_recebimento: calcularPrazoDias(
        entradas[0] ?? l.data_entrada ?? null,
        vencimentos[vencimentos.length - 1] ?? l.data_vencimento ?? null
      ),
    };
  });
}

/**
 * Chave de identidade de um boleto, usada para detectar duplicados entre
 * importações (empresa + nosso número + seu número + vencimento + valor).
 */
export function chaveBoleto(b: {
  empresa?: string | null;
  nosso_numero?: string | null;
  seu_numero?: string | null;
  data_vencimento?: string | null;
  valor?: number | null;
}): string {
  return [
    (b.empresa ?? "").trim().toLowerCase(),
    (b.nosso_numero ?? "").trim().toLowerCase(),
    (b.seu_numero ?? "").trim().toLowerCase(),
    b.data_vencimento ?? "",
    Number(b.valor ?? 0).toFixed(2),
  ].join("|");
}

// ---------------------------------------------------------------------------
// Extração a partir da matriz do XLSX (SheetJS header:1)
// ---------------------------------------------------------------------------

type Coluna =
  | "sacado"
  | "nosso_numero"
  | "seu_numero"
  | "data_entrada"
  | "data_vencimento"
  | "valor";

function detectarColunas(cabecalho: unknown[]): Partial<Record<Coluna, number>> {
  const map: Partial<Record<Coluna, number>> = {};

  cabecalho.forEach((celula, idx) => {
    const h = normalizar(celula);
    if (!h) return;

    if (map.nosso_numero == null && h.includes("nosso")) {
      map.nosso_numero = idx;
    } else if (
      map.seu_numero == null &&
      (h.includes("seu numero") || h.includes("seu nº") || h === "documento" ||
        h.includes("nº doc") || h.includes("num doc") || h.includes("num. doc"))
    ) {
      map.seu_numero = idx;
    } else if (
      map.sacado == null &&
      (h.includes("sacado") || h.includes("pagador") || h.includes("cliente") ||
        h === "nome" || h.includes("razao"))
    ) {
      map.sacado = idx;
    } else if (
      map.data_entrada == null &&
      (h.includes("entrada") || h.includes("emissao") || h.includes("emissão"))
    ) {
      map.data_entrada = idx;
    } else if (
      map.data_vencimento == null &&
      (h.includes("vencimento") || h === "venc" || h.includes("venc."))
    ) {
      map.data_vencimento = idx;
    } else if (
      map.valor == null &&
      h.includes("valor") &&
      !h.includes("pago") && !h.includes("recebido") && !h.includes("juros") &&
      !h.includes("multa") && !h.includes("desconto") && !h.includes("abatimento")
    ) {
      map.valor = idx;
    }
  });

  return map;
}

/** Extrai as linhas de uma matriz de células (sheet_to_json com header:1). */
export function extrairDeMatriz(
  matriz: unknown[][],
  empresaPadrao = ""
): LinhaImportada[] {
  if (!Array.isArray(matriz) || matriz.length === 0) return [];

  // Encontra a linha de cabeçalho: aquela com mais colunas reconhecidas.
  let headerIdx = -1;
  let melhorMap: Partial<Record<Coluna, number>> = {};
  let melhorScore = 0;

  const limite = Math.min(matriz.length, 25);
  for (let i = 0; i < limite; i++) {
    const linha = matriz[i] ?? [];
    const map = detectarColunas(linha);
    const score = Object.keys(map).length;
    if (score > melhorScore) {
      melhorScore = score;
      melhorMap = map;
      headerIdx = i;
    }
  }

  // Precisa de ao menos vencimento + valor para valer a pena.
  if (headerIdx === -1 || melhorMap.data_vencimento == null || melhorMap.valor == null) {
    return [];
  }

  const linhas: LinhaImportada[] = [];

  for (let i = headerIdx + 1; i < matriz.length; i++) {
    const row = matriz[i] ?? [];
    if (!Array.isArray(row) || row.every((c) => c == null || c === "")) continue;

    const sacado =
      melhorMap.sacado != null ? String(row[melhorMap.sacado] ?? "").trim() : "";
    const entrada =
      melhorMap.data_entrada != null ? parseData(row[melhorMap.data_entrada]) : null;
    const vencimento = parseData(row[melhorMap.data_vencimento!]);
    const valor = parseValor(row[melhorMap.valor!]);

    // Ignora linhas de total/rodapé (sem sacado e sem vencimento).
    const primeira = normalizar(row[0]);
    if (primeira.startsWith("total") || primeira.startsWith("subtotal")) continue;
    if (!sacado && !vencimento) continue;

    const nosso_numero =
      melhorMap.nosso_numero != null
        ? String(row[melhorMap.nosso_numero] ?? "").trim()
        : "";
    const seu_numero =
      melhorMap.seu_numero != null
        ? String(row[melhorMap.seu_numero] ?? "").trim()
        : "";

    linhas.push({
      empresa: empresaPadrao,
      sacado,
      nosso_numero,
      seu_numero,
      data_entrada: entrada,
      data_vencimento: vencimento,
      valor,
      prazo_dias: calcularPrazoDias(entrada, vencimento),
    });
  }

  return linhas;
}

// ---------------------------------------------------------------------------
// Extração a partir do texto do PDF (Sicoob e Itaú)
// ---------------------------------------------------------------------------

// Registro do relatório Sicoob. Ex. (campos podem vir colados):
//   253-9 421735-0148281 PATRICIO ANTONIO BARBOSA - ME 31/07/2026 1.797,0003/08/2026
// Grupos: (1) números (nosso/seu), (2) sacado, (3) entrada, (4) valor, (5) vencimento.
const RE_SICOOB =
  /(\d[\d-]*(?:\s+\d[\d-]*)*)\s+(-?\s*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .,&/'-]*?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{2}\/\d{2}\/\d{4})/g;

// Registro do relatório Itaú ("movimentações de cobrança"). Ex.:
//   157 41033 ALEXANDRE PEREIRA COM DE 37.023.123/0001-58 boleto 18061 53893-3 05/08/2026 07/11/2026 2466,89 a vencer
// Colunas: carteira, código, NOME, CPF/CNPJ, tipo, nosso, seu, emissão, venc, valor, status.
// Grupos: (1) sacado, (2) nosso, (3) seu, (4) emissão, (5) vencimento, (6) valor.
const RE_ITAU =
  /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .,&/'-]*?)\s+(?:\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})\s+\S+\s+(\d+)\s+([\w-]+)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d[\d.]*,\d{1,2})\s+(?:a vencer|vencido|pago|baixado|em aberto|em cart[oó]rio|protestado)/gi;

function ehItau(s: string): boolean {
  return /movimenta[çc][õo]es de cobran[çc]a|cpf\/cnpj pagador|valor t[ií]tulo/i.test(
    s
  );
}

/**
 * Extrai as linhas do texto puro do PDF. Detecta automaticamente o banco
 * (Sicoob ou Itaú) e usa o parser correspondente.
 */
export function extrairDeTexto(texto: string, empresaPadrao = ""): LinhaImportada[] {
  if (!texto) return [];
  const s0 = texto.replace(/\s+/g, " ");
  if (ehItau(s0)) return extrairItau(s0, empresaPadrao);
  return extrairSicoob(s0, empresaPadrao);
}

/**
 * Sicoob: o extrator do PDF concatena tudo (sem quebras) e cola alguns campos —
 * valor+vencimento ("1.797,0003/08/2026") e nosso+seu número ("421735-0148281").
 * Descolamos esses campos e então varremos os registros por regex.
 */
function extrairSicoob(s0: string, empresaPadrao: string): LinhaImportada[] {
  let s = s0.replace(/(,\d{2})(\d{2}\/\d{2}\/\d{4})/g, "$1 $2");
  s = s.replace(/(-\d{2})(\d{4,})/g, "$1 $2");

  const linhas: LinhaImportada[] = [];
  let m: RegExpExecArray | null;
  RE_SICOOB.lastIndex = 0;

  while ((m = RE_SICOOB.exec(s)) !== null) {
    const tokens = m[1].trim().split(/\s+/);
    const nosso_numero = tokens[0] ?? "";
    const seu_numero = tokens.slice(1).join(" ");
    const sacado = m[2].replace(/^[-\s]+/, "").replace(/\s+/g, " ").trim();
    const entrada = parseData(m[3]);
    const valor = parseValor(m[4]);
    const vencimento = parseData(m[5]);

    linhas.push({
      empresa: empresaPadrao,
      sacado,
      nosso_numero,
      seu_numero,
      data_entrada: entrada,
      data_vencimento: vencimento,
      valor,
      prazo_dias: calcularPrazoDias(entrada, vencimento),
    });
  }
  return linhas;
}

/**
 * Itaú: "movimentações de cobrança". Layout tabular, campos separados; os
 * valores não têm separador de milhar e podem ter 1 ou 2 casas decimais.
 */
function extrairItau(s: string, empresaPadrao: string): LinhaImportada[] {
  const linhas: LinhaImportada[] = [];
  let m: RegExpExecArray | null;
  RE_ITAU.lastIndex = 0;

  while ((m = RE_ITAU.exec(s)) !== null) {
    const sacado = m[1].replace(/^[-\s]+/, "").replace(/\s+/g, " ").trim();
    const nosso_numero = m[2];
    const seu_numero = m[3];
    const entrada = parseData(m[4]);
    const vencimento = parseData(m[5]);
    const valor = parseValor(m[6]);

    linhas.push({
      empresa: empresaPadrao,
      sacado,
      nosso_numero,
      seu_numero,
      data_entrada: entrada,
      data_vencimento: vencimento,
      valor,
      prazo_dias: calcularPrazoDias(entrada, vencimento),
    });
  }
  return linhas;
}
