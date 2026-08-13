// ---------------------------------------------------------------------------
// lib/tempo.ts
// Noção de tempo: "hoje" no fuso local, e formatação de datas por extenso.
// ---------------------------------------------------------------------------

/**
 * Data de hoje em ISO (yyyy-mm-dd) no fuso LOCAL.
 *
 * Atenção: `new Date().toISOString()` devolve UTC — no Brasil (UTC-3), das
 * 21h em diante isso já aponta para o dia seguinte. Por isso montamos a data
 * a partir dos componentes locais.
 */
export function hojeISO(d: Date = new Date()): string {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

const DIAS_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "segunda-feira, 10 de agosto de 2026" */
export function dataPorExtenso(d: Date = new Date()): string {
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${
    MESES[d.getMonth()]
  } de ${d.getFullYear()}`;
}

/**
 * Data de hoje (yyyy-mm-dd) no fuso de BRASÍLIA, independente do fuso do
 * servidor. O resumo diário roda na Vercel, que usa UTC: sem isto, um envio
 * feito depois das 21h de Brasília já contaria como o dia seguinte e o resumo
 * sairia vazio, porque a importação foi gravada com a data local do navegador.
 */
export function hojeBrasilia(d: Date = new Date()): string {
  // "en-CA" formata como yyyy-mm-dd.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** "seg, 10 ago" a partir de uma data ISO, sem depender do fuso do servidor. */
export function dataCurtaISO(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  if (!ano || !mes || !dia) return iso;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return `${DIAS_SEMANA[d.getUTCDay()].slice(0, 3)}, ${dia} ${MESES[mes - 1].slice(0, 3)}`;
}

/** "seg, 10 ago" — versão curta para o cabeçalho. */
export function dataCurta(d: Date = new Date()): string {
  const dia = DIAS_SEMANA[d.getDay()].slice(0, 3);
  const mes = MESES[d.getMonth()].slice(0, 3);
  return `${dia}, ${d.getDate()} ${mes}`;
}

/** "14:32" */
export function horaCurta(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}
