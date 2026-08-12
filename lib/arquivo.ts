// ---------------------------------------------------------------------------
// lib/arquivo.ts
// Separa o que ainda está na rua do que já venceu.
//
// A unidade de arquivamento é o PEDIDO, não o boleto — e isso é proposital.
//
// Numa venda 30/60/90/120/150 as parcelas curtas vencem primeiro. Se cada
// boleto saísse dos cálculos ao vencer, depois de 100 dias sobrariam só as de
// 120 e 150, e a média do que restou seria 135 em vez de 90. O prazo médio
// concedido subiria sozinho, mês após mês, sem ninguém ter alongado nada.
//
// Então: enquanto a última parcela não vence, o pedido continua ativo e conta
// com a condição INTEIRA. Quando ela vence, o pedido todo sai de cena.
// ---------------------------------------------------------------------------

import { chaveVenda, type Boleto } from "./boletos";
import { hojeISO } from "./tempo";

export interface Separacao {
  /** Pedidos com alguma parcela ainda a vencer. Entram em todos os cálculos. */
  ativos: Boleto[];
  /** Pedidos cuja última parcela já venceu. Só ficam registrados. */
  arquivados: Boleto[];
}

export function separarPorVencimento(
  boletos: Boleto[],
  hoje: string = hojeISO()
): Separacao {
  // Último vencimento de cada pedido.
  const ultimoDoPedido = new Map<string, string>();
  for (const b of boletos) {
    if (!b.data_vencimento) continue;
    const chave = chaveVenda(b);
    const atual = ultimoDoPedido.get(chave);
    if (!atual || b.data_vencimento > atual) {
      ultimoDoPedido.set(chave, b.data_vencimento);
    }
  }

  const ativos: Boleto[] = [];
  const arquivados: Boleto[] = [];
  for (const b of boletos) {
    const ultimo = ultimoDoPedido.get(chaveVenda(b));
    // Sem data não dá para dizer que venceu — fica ativo, para não sumir.
    if (ultimo && ultimo < hoje) arquivados.push(b);
    else ativos.push(b);
  }
  return { ativos, arquivados };
}

export interface PedidoArquivado {
  chave: string;
  documento: string;
  empresa: string;
  entrada: string | null;
  primeiroVencimento: string | null;
  ultimoVencimento: string | null;
  parcelas: number;
  valorTotal: number;
  prazoRecebimento: number | null;
  condicao: number[];
}

export interface ClienteArquivado {
  sacado: string;
  pedidos: PedidoArquivado[];
  quantidadePedidos: number;
  quantidadeBoletos: number;
  valorTotal: number;
  ultimoVencimento: string | null;
  /** Prazo médio concedido histórico, ponderado pelo valor. */
  prazoMedio: number | null;
}

/** Agrupa o arquivo por cliente e, dentro dele, por pedido. */
export function arquivoPorCliente(arquivados: Boleto[]): ClienteArquivado[] {
  const porCliente = new Map<string, Boleto[]>();
  for (const b of arquivados) {
    const nome = b.sacado || "—";
    if (!porCliente.has(nome)) porCliente.set(nome, []);
    porCliente.get(nome)!.push(b);
  }

  return Array.from(porCliente.entries())
    .map(([sacado, lista]) => {
      const porPedido = new Map<string, Boleto[]>();
      for (const b of lista) {
        const chave = chaveVenda(b);
        if (!porPedido.has(chave)) porPedido.set(chave, []);
        porPedido.get(chave)!.push(b);
      }

      const pedidos: PedidoArquivado[] = Array.from(porPedido.entries())
        .map(([chave, itens]) => {
          const ord = [...itens].sort((a, b) =>
            (a.data_vencimento ?? "").localeCompare(b.data_vencimento ?? "")
          );
          const vencs = ord
            .map((b) => b.data_vencimento)
            .filter((d): d is string => Boolean(d));
          return {
            chave,
            documento: ord[0]?.documento || ord[0]?.seu_numero || "—",
            empresa: ord[0]?.empresa || "Não classificado",
            entrada: ord[0]?.data_entrada ?? null,
            primeiroVencimento: vencs[0] ?? null,
            ultimoVencimento: vencs[vencs.length - 1] ?? null,
            parcelas: ord[0]?.total_parcelas ?? ord.length,
            valorTotal: ord.reduce((s, b) => s + (b.valor ?? 0), 0),
            prazoRecebimento: ord[0]?.prazo_recebimento ?? null,
            condicao: ord
              .map((b) => b.prazo_dias)
              .filter((p): p is number => typeof p === "number"),
          };
        })
        .sort((a, b) =>
          (b.ultimoVencimento ?? "").localeCompare(a.ultimoVencimento ?? "")
        );

      let somaValor = 0;
      let somaProduto = 0;
      for (const b of lista) {
        if (typeof b.prazo_dias !== "number" || (b.valor ?? 0) <= 0) continue;
        somaValor += b.valor ?? 0;
        somaProduto += (b.valor ?? 0) * b.prazo_dias;
      }

      return {
        sacado,
        pedidos,
        quantidadePedidos: pedidos.length,
        quantidadeBoletos: lista.length,
        valorTotal: lista.reduce((s, b) => s + (b.valor ?? 0), 0),
        ultimoVencimento: pedidos[0]?.ultimoVencimento ?? null,
        prazoMedio:
          somaValor > 0 ? Math.round((somaProduto / somaValor) * 10) / 10 : null,
      };
    })
    .sort((a, b) =>
      (b.ultimoVencimento ?? "").localeCompare(a.ultimoVencimento ?? "")
    );
}
