// ---------------------------------------------------------------------------
// lib/telegram-formato.ts
// Como a política de prazo aparece no Telegram.
//
// As mensagens são lidas no celular, no fim do expediente, logo depois da
// importação do dia. Por isso tudo que passou do limite cabe em um aviso só —
// mas cada pedido traz o que a diretoria precisa para decidir na hora:
// cliente, pedido, valor, condição de pagamento e último vencimento.
// ---------------------------------------------------------------------------

import { abreviarNome } from "./boletos";
import { condicaoPagamento, type Pedido } from "./politica-prazo";

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

/**
 * Um pedido fora da política, com o que basta para decidir sem abrir o app:
 * quem comprou, qual pedido, quanto, em que condição e quando termina de pagar.
 */
export function linhaPedido(p: Pedido): string {
  return [
    `• ${abreviarNome(p.sacado)} · ${empresaCurta(p.empresa)}`,
    `  Pedido ${p.documento} · ${moedaCurta(p.valorTotal)}`,
    `  Condição: ${condicaoPagamento(p.prazosParcelas)}`,
    `  Último venc.: ${vencimentoCurto(p.ultimoVencimento)} · ${
      p.prazo != null ? `${p.prazo}d` : "—"
    }`,
  ].join("\n");
}
