// ---------------------------------------------------------------------------
// lib/telegram-formato.ts
// Como a política de prazo aparece no Telegram.
//
// As mensagens são lidas no celular, no fim do expediente, logo depois da
// importação do dia. Por isso tudo que passou do limite cabe em um aviso só —
// mas cada pedido traz o que a diretoria precisa para decidir na hora:
// cliente, pedido, valor, condição de pagamento e último vencimento.
// ---------------------------------------------------------------------------

import { condicaoPagamento, type DesvioMeta, type Pedido } from "./politica-prazo";

/** "Ley Móveis" → "Móveis". O grupo já sabe de que empresa se trata. */
export function empresaCurta(nome: string | null | undefined): string {
  const n = (nome ?? "").trim();
  if (!n) return "—";
  return n.replace(/^ley\s+/i, "");
}

/**
 * O nome do cliente por extenso, só limpando espaço duplicado.
 *
 * As mensagens usavam a versão abreviada (2 primeiras palavras), pensada
 * para telas com pouco espaço. No Telegram isso confundia mais do que
 * ajudava — "A M" sozinho não diz quem é o cliente.
 */
export function nomeCompleto(nome: string | null | undefined): string {
  const limpo = (nome ?? "").trim().replace(/\s+/g, " ");
  return limpo || "—";
}

/** Linha tracejada para separar blocos de assunto numa mensagem longa. */
export const SEPARADOR = "┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈";

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
export function linhaPedido(
  p: Pedido,
  posicao?: {
    prazoCliente: number | null;
    desvio: DesvioMeta | null;
    meta: number;
    /** Média que ESTE pedido produz, e quanto ela desvia da meta. */
    mediaPedido?: number | null;
    desvioPedido?: DesvioMeta | null;
    /** "⛔ Acima de 180 dias — não permitido", quando for o caso. */
    selo?: string | null;
  }
): string {
  // A condição já diz quanto o pedido empurra a média — é a leitura que
  // conecta a régua do vencimento com a régua da meta.
  const condicao = condicaoPagamento(p.prazosParcelas);
  const media = posicao?.mediaPedido;
  const desvioPedido = posicao?.desvioPedido;
  const linhaCondicao =
    media != null && desvioPedido
      ? `  Condição: ${condicao} → média ${Math.round(media)}d · ${
          desvioPedido.acimaDaMeta ? "+" : "−"
        }${Math.abs(desvioPedido.percentual)
          .toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% da meta`
      : `  Condição: ${condicao}`;

  const linhas = [
    `• ${nomeCompleto(p.sacado)} · ${empresaCurta(p.empresa)}`,
    `  Pedido ${p.documento} · ${moedaCurta(p.valorTotal)}`,
    linhaCondicao,
    `  Último venc.: ${vencimentoCurto(p.ultimoVencimento)} · ${
      p.prazo != null ? `${p.prazo} dias` : "—"
    }`,
  ];

  if (posicao?.selo) linhas.push(`  ${posicao.selo}`);

  // Onde este cliente está em relação à meta — é o que diz se vale puxar
  // uma conversa de redução com ele.
  if (posicao?.desvio && posicao.prazoCliente != null) {
    linhas.push(
      `  ${posicao.desvio.emoji} Cliente em ${
        Math.round(posicao.prazoCliente * 10) / 10
      } dias · ${posicao.desvio.texto} (${posicao.meta}d)`
    );
  }
  return linhas.join("\n");
}
