// ---------------------------------------------------------------------------
// lib/notificacoes.ts
// Catálogo dos avisos que o sistema manda no Telegram.
//
// Tudo que o bot dispara está listado aqui, com um liga/desliga por tipo. A
// intenção é que ninguém precise abrir o código para saber o que está ativo —
// a aba Notificações mostra a lista, o exemplo da mensagem e o estado atual.
//
// Chave ausente no banco = usa o `padrao` daqui. Assim, criar um aviso novo
// não exige mexer na configuração existente.
// ---------------------------------------------------------------------------

export type ChaveNotificacao =
  | "politica_critico"
  | "politica_excecao"
  | "acordo_descumprido"
  | "acordo_reducao"
  | "fechamento_dia"
  | "meta_do_dia"
  | "dia_sem_importacao"
  | "concentracao_cliente";

export type Momento = "importacao" | "fechamento" | "acao";

export interface DefinicaoNotificacao {
  chave: ChaveNotificacao;
  titulo: string;
  descricao: string;
  /** Quando dispara, em linguagem de quem usa. */
  quando: string;
  momento: Momento;
  emoji: string;
  padrao: boolean;
  /** Se desligar exige consciência do risco. */
  critico?: boolean;
  exemplo: string;
}

export const MOMENTOS: Record<Momento, string> = {
  importacao: "Na importação",
  fechamento: "No fechamento das 18h",
  acao: "Quando alguém age no sistema",
};

export const NOTIFICACOES: DefinicaoNotificacao[] = [
  {
    chave: "politica_critico",
    titulo: "Prazo não permitido",
    descricao:
      "Pedido cujo último vencimento passou do teto da política. É a única regra que não deveria ser silenciada — nem por cliente marcado como “estou ciente”.",
    quando: "Assim que a importação é confirmada",
    momento: "importacao",
    emoji: "🚨",
    padrao: true,
    critico: true,
    exemplo: `🚨 1 pedido ACIMA DE 180 DIAS · R$ 95.000
Prazo não permitido pela política.

• CARLOS EDUARDO · Móveis
  Pedido 998877 · R$ 95.000
  Condição: 30/240
  Último venc.: 08/03 · 210d
  🔺 Cliente em 120d · 33,3% acima da meta (90d)`,
  },
  {
    chave: "politica_excecao",
    titulo: "Exceção estratégica",
    descricao:
      "Pedido entre o prazo padrão e o teto. Não é proibido, mas precisa de decisão consciente — por isso aparece com cliente, valor e condição.",
    quando: "Assim que a importação é confirmada",
    momento: "importacao",
    emoji: "⚠️",
    padrao: true,
    exemplo: `⚠️ 3 exceções estratégicas · R$ 225.000
Prazo de recebimento entre 151 e 180 dias.

• FERNANDA DUARTE · Móveis
  Pedido 442415 · R$ 120.000
  Condição: 33/66/99/132/165
  Último venc.: 22/01 · 165d
  🔺 Cliente em 99d · 10% acima da meta (90d)`,
  },
  {
    chave: "acordo_descumprido",
    titulo: "Pedido fora do acordo",
    descricao:
      "O cliente tinha prazo combinado e o pedido novo passou dele. Vale mais que a exceção comum: aqui houve uma conversa que não foi respeitada.",
    quando: "Assim que a importação é confirmada",
    momento: "importacao",
    emoji: "🤝",
    padrao: true,
    exemplo: `🤝 1 pedido FORA DO ACORDO · R$ 42.000
Estes clientes já tinham prazo combinado — e o pedido passou dele.

• F G LOPES · Colchões
  Pedido 54120 · R$ 42.000
  Condição: 30/180
  Último venc.: 10/02 · 180d
  🔺 Cliente em 139,3d · 54,8% acima da meta (90d)`,
  },
  {
    chave: "acordo_reducao",
    titulo: "Redução de prazo negociada",
    descricao:
      "Quando um cliente aceita encurtar o prazo. O grupo só recebia notícia ruim; uma redução é trabalho comercial que deu certo.",
    quando: "Ao registrar um acordo que diminui o prazo",
    momento: "acao",
    emoji: "🎉",
    padrao: true,
    exemplo: `🎉 Redução do prazo médio concedido

👤 F G LOPES DE FREITAS MAIA
📉 33/245 → 30/150
   245d → 150d · 95 dias a menos
💰 Carteira do cliente: R$ 27.020

📝 Acordo registrado pelo usuário: Pedro Teles`,
  },
  {
    chave: "fechamento_dia",
    titulo: "Fechamento do dia",
    descricao:
      "O panorama das 18h: o que foi emitido, o prazo médio concedido no dia contra a meta e quais clientes ficaram acima.",
    quando: "Todo dia às 18h",
    momento: "fechamento",
    emoji: "📊",
    padrao: true,
    exemplo: `📊 Fechamento do dia · seg, 10 ago

📥 4 pedidos · 18 boletos · R$ 248.997
🔺 Prazo médio concedido hoje: 102,5d · 13,9% acima da meta (90d)

🔺 Clientes acima da meta hoje
• CARLOS EDUARDO · 120d · 33,3% acima da meta

✅ 2 clientes dentro da meta hoje.

📦 Carteira: prazo médio concedido 102,5d · 13,9% acima da meta`,
  },
  {
    chave: "meta_do_dia",
    titulo: "Meta do dia batida",
    descricao:
      "Reforço positivo: quando o dia fecha com o prazo médio concedido dentro da meta. Sai junto do fechamento, como uma linha de destaque.",
    quando: "No fechamento, se o dia ficou na meta",
    momento: "fechamento",
    emoji: "🎯",
    padrao: true,
    exemplo: `🎯 META DO DIA BATIDA
Prazo médio concedido hoje: 84,2d — 6,4% melhor que a meta de 90d.`,
  },
  {
    chave: "dia_sem_importacao",
    titulo: "Dia sem importação",
    descricao:
      "O fechamento rodou e nada foi importado. O controle inteiro depende da importação diária — se alguém esquecer, ninguém percebe sem este aviso.",
    quando: "No fechamento, se nada entrou no dia",
    momento: "fechamento",
    emoji: "😴",
    padrao: true,
    exemplo: `😴 Nenhum boleto foi importado hoje.
Se houve emissão, o relatório do banco ainda não subiu no sistema.`,
  },
  {
    chave: "concentracao_cliente",
    titulo: "Concentração em um cliente",
    descricao:
      "Um único cliente passou de 25% de tudo que há a receber. Não é sobre prazo, é sobre risco: se ele atrasar, o caixa sente.",
    quando: "No fechamento, se algum cliente passar de 25%",
    momento: "fechamento",
    emoji: "📈",
    padrao: false,
    exemplo: `📈 Concentração de carteira
MAGAZINI LILIANI S/A representa 31% do total a receber (R$ 254.900).`,
  },
];

/** Percentual a partir do qual um cliente conta como concentração. */
export const LIMIAR_CONCENTRACAO = 0.25;

export type MapaNotificacoes = Partial<Record<ChaveNotificacao, boolean>>;

/** Está ligada? Sem registro no banco, vale o padrão do catálogo. */
export function notificacaoAtiva(
  mapa: MapaNotificacoes | null | undefined,
  chave: ChaveNotificacao
): boolean {
  const gravado = mapa?.[chave];
  if (typeof gravado === "boolean") return gravado;
  return NOTIFICACOES.find((n) => n.chave === chave)?.padrao ?? true;
}

/** Lê o mapa da linha de configuração, tolerando coluna ausente ou lixo. */
export function lerNotificacoes(
  config: { notificacoes?: unknown } | null | undefined
): MapaNotificacoes {
  const bruto = config?.notificacoes;
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  const mapa: MapaNotificacoes = {};
  for (const n of NOTIFICACOES) {
    const v = (bruto as Record<string, unknown>)[n.chave];
    if (typeof v === "boolean") mapa[n.chave] = v;
  }
  return mapa;
}
