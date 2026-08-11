// ---------------------------------------------------------------------------
// lib/ajuda-textos.ts
// Textos de ajuda exibidos nos tooltips. Centralizados para manter a mesma
// explicação em todas as telas.
// ---------------------------------------------------------------------------

export const AJUDA = {
  // Abas
  abaImportacao:
    "Onde você envia os relatórios dos bancos (Sicoob e Itaú). O sistema lê o arquivo, mostra as linhas para conferência e só grava depois que você confirmar.",
  abaDashboard:
    "Visão geral da carteira: prazo médio, valor a receber, quanto está acima do limite e como os prazos evoluem mês a mês.",
  abaClientes:
    "Análise por cliente: prazo médio que cada um recebe, valor em carteira e quantos boletos passaram do limite.",
  abaVendas:
    "Agrupa os boletos da mesma venda a prazo. Ex.: uma venda de R$ 10.000 em 4x aparece como uma linha só, com as 4 parcelas e o prazo de recebimento total.",
  abaHistorico:
    "Todas as importações já feitas, com filtros por data, empresa e cliente, e a lista dos boletos acima do limite.",
  abaConfiguracoes:
    "Define o limite de prazo (padrão 60 dias) e os destinatários dos alertas no Telegram.",
  abaAdmin:
    "Cadastro de usuários, permissões e a trilha de auditoria (quem fez o quê e quando).",

  // Conceitos centrais
  prazoDias:
    "Prazo do boleto = número de dias corridos entre a data de entrada (emissão) e a data de vencimento.",
  prazoMedio:
    "Prazo médio CONCEDIDO, ponderado pelo valor: soma de (valor × prazo) ÷ soma dos valores. Mostra por quanto tempo o dinheiro fica na rua — um título de R$ 10.000 pesa 100x mais que um de R$ 100. Atenção: não é o \"PMR\" da contabilidade (contas a receber ÷ receita × 365), que mede quanto tempo você LEVA para receber. Este mede o prazo que você DÁ. A média simples ao lado trata todo boleto igual e responde outra coisa: o prazo típico por título.",
  prazoMedioEmpresa:
    "Mesma conta do prazo médio concedido, considerando só os boletos daquela empresa.",
  prazoMedioSimples:
    "Média simples: soma dos prazos ÷ quantidade de boletos. Cada boleto pesa igual, independentemente do valor. Serve para ver o prazo típico concedido por título — não o risco financeiro.",
  regraLimite:
    "Prazo de recebimento da venda (recomendado): a venda inteira é avaliada pelo tempo até a ÚLTIMA parcela — R$ 10.000 em 4x é um crédito de ~120 dias, e o alerta sai uma vez só. Prazo de cada parcela: avalia cada boleto isolado, o que gera vários alertas para a mesma venda.",
  prazoRecebimento:
    "Dias entre a entrada e o vencimento da ÚLTIMA parcela da venda — o tempo total até receber tudo daquela compra. É o que representa a decisão de crédito.",
  limite:
    "Prazo padrão máximo da política (150 dias). Pedidos cujo ÚLTIMO boleto vence dentro desse prazo são Normais. Acima dele, o pedido vira exceção estratégica ou passa a não ser permitido.",
  limiteMaximo:
    "Teto absoluto da política (180 dias). Entre o prazo padrão e este teto, o pedido é uma exceção estratégica e gera alerta. Acima do teto, o prazo não é permitido e gera alerta crítico.",
  tolerancia:
    "Folga para a variação de calendário, não para afrouxar a regra. Uma condição \"5x mensal\" dá 150 a 153 dias corridos dependendo dos meses que atravessa \u2014 só quem entra em fevereiro fecha exatos 150 \u2014 e o vencimento em fim de semana empurra mais 1 ou 2. Sem esta folga, quase toda condição mensal padrão viraria alerta.",
  politicaPrazo:
    "Três faixas, sempre pelo vencimento do ÚLTIMO boleto do pedido: até o prazo padrão = Normal; do padrão até o teto = Exceção estratégica (alerta); acima do teto = Não permitido (alerta crítico).",
  excecoesEstrategicas:
    "Pedidos com prazo entre o padrão e o teto da política. Não são proibidos, mas precisam de decisão consciente — por isso aparecem no alerta com cliente, pedido, valor, condição de pagamento e último vencimento.",
  acordoCliente:
    "O que foi combinado com aquele cliente, valendo daqui para frente. Escreva como voc\u00ea fala: \"30/150\" \u00e9 a faixa \u2014 da primeira parcela aos 30 dias at\u00e9 a \u00faltima aos 150, de 30 em 30 \u2014 e o sistema expande para 30/60/90/120/150 na sua frente. A regra cobra o \u00faltimo vencimento (150). O \"antes\" ao lado \u00e9 preenchido sozinho, a partir do pior pedido que o cliente vinha praticando. O sino cortado marca \u201cestou ciente\u201d: o cliente para de gerar alerta, mas pedidos acima do teto da pol\u00edtica continuam avisando.",
  naoPermitidos:
    "Pedidos com prazo acima do teto da política. Fogem da regra e geram alerta crítico, em mensagem separada para não se perderem no meio das exceções.",
  acimaLimite:
    "Quantidade e percentual de boletos cujo prazo passou do limite. O percentual é sobre o total de boletos filtrados.",
  valorCarteira:
    "Soma do valor de todos os boletos filtrados — o total que ainda há a receber no recorte atual.",
  aVencer7:
    "Boletos que vencem de hoje até 7 dias à frente, com a soma dos valores. A data de referência é a de hoje, mostrada no topo da tela.",
  vencidos:
    "Boletos cuja data de vencimento já passou, considerando a data de hoje. Nas tabelas eles aparecem em vermelho, com há quanto tempo venceram.",
  faixaPrazo:
    "Distribuição dos boletos por faixa de prazo (até 30, 31–45, 46–60, 61–90 e mais de 90 dias). Ajuda a ver a concentração dos prazos concedidos.",
  evolucaoPrazo:
    "Prazo concedido, ponderado pelo valor, agrupado pelo mês de VENCIMENTO e separado por empresa. Cuidado ao ler tendência: numa venda parcelada as parcelas caem em meses diferentes, e os meses mais à frente só recebem as parcelas finais — o que faz a linha subir sozinha na ponta direita.",
  participacaoEmpresa:
    "Quanto cada empresa representa do valor total em carteira.",
  topClientes:
    "Clientes com maior valor a receber no recorte atual.",
  insights:
    "Observações geradas automaticamente a partir dos números da tela — não são metas nem previsões.",

  // Importação
  empresaPadrao:
    "O sistema tenta identificar a empresa pelo próprio relatório (e pelo nome do arquivo). Esta escolha só é usada quando ele não conseguir identificar.",
  uploadArquivos:
    "Aceita .pdf e .xlsx do Sicoob e do Itaú. Pode soltar vários de uma vez — cada arquivo é lido com o formato do seu banco.",
  conferencia:
    "Revise antes de gravar: dá para corrigir qualquer campo, adicionar e remover linhas. Nada é salvo até você confirmar.",
  confirmarImportacao:
    "Grava os boletos com a data de hoje, calcula o prazo de cada um, marca os que passaram do limite e dispara os alertas no Telegram.",
  duplicados:
    "Boletos já importados antes são ignorados automaticamente (compara empresa, nosso número, seu número, vencimento e valor). Pode reimportar o mesmo arquivo sem duplicar.",

  // Vendas a prazo
  venda:
    "Uma venda a prazo é o conjunto de boletos do mesmo documento. O sistema identifica pelo 'seu número': 442415-01, 442415-02 e 442415-03 são 3 parcelas da mesma venda.",
  valorTotalVenda:
    "Soma de todas as parcelas — o valor cheio da venda a prazo.",
  prazoUltimaParcela:
    "Prazo em dias da parcela que vence por último. É o tempo total até receber tudo daquela venda.",

  // Histórico / ações
  alertaStatus:
    "Enviado = o alerta desse boleto já foi para o Telegram. Pendente = ainda não (falta token, destinatário, ou o envio falhou).",
  telegram:
    "O app avisa no Telegram sempre que uma venda passa do limite de prazo. Para funcionar: (1) criar um bot no @BotFather e colocar o token na Vercel; (2) cada pessoa envia uma mensagem ao bot; (3) você a adiciona aqui como destinatária.",
  resumoDiario:
    "Fechamento do dia enviado ao grupo às 18h: quanto foi importado hoje, o prazo médio concedido NO DIA, quantas vendas passaram do limite e as três de maior prazo. No rodapé, uma linha com a carteira toda (total, prazo médio geral e o que vence em 7 dias).",
  enviarAlertas:
    "Envia no Telegram os alertas dos boletos acima do limite que ainda não foram avisados. Nunca reenvia um alerta já enviado.",
  exportarExcel:
    "Baixa em .xlsx exatamente os boletos que estão passando pelos filtros atuais.",
  recalcular:
    "Reaplica o limite e a regra atuais a todos os boletos já importados, atualizando quem está acima do limite. Use depois de mudar o limite. Não reenvia alertas já enviados.",
  limparHistorico:
    "Apaga TODOS os boletos importados. Serve para zerar a base depois dos testes. Não afeta usuários nem configurações, e não tem como desfazer.",
} as const;
