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
  abaCompras:
    "Agrupa os boletos que fazem parte da mesma compra parcelada. Ex.: uma venda de R$ 10.000 em 4x aparece como uma linha só, com as 4 parcelas.",
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
    "Ponderado pelo valor (PMR): soma de (valor × prazo) ÷ soma dos valores. Mostra quanto tempo o DINHEIRO fica na rua — um título de R$ 10.000 pesa 100x mais que um de R$ 100. A 'média simples' logo abaixo trata todo boleto igual e responde outra coisa: o prazo típico por título.",
  prazoMedioEmpresa:
    "Mesma conta do prazo médio ponderado, considerando só os boletos daquela empresa.",
  prazoMedioSimples:
    "Média simples: soma dos prazos ÷ quantidade de boletos. Cada boleto pesa igual, independentemente do valor. Serve para ver o prazo típico concedido por título — não o risco financeiro.",
  limite:
    "Limite de prazo definido em Configurações (padrão 60 dias). Boletos com prazo acima disso são marcados em vermelho e geram alerta.",
  acimaLimite:
    "Quantidade e percentual de boletos cujo prazo passou do limite. O percentual é sobre o total de boletos filtrados.",
  valorCarteira:
    "Soma do valor de todos os boletos filtrados — o total que ainda há a receber no recorte atual.",
  aVencer7:
    "Boletos que vencem de hoje até 7 dias à frente, com a soma dos valores.",
  faixaPrazo:
    "Distribuição dos boletos por faixa de prazo (até 30, 31–45, 46–60, 61–90 e mais de 90 dias). Ajuda a ver a concentração dos prazos concedidos.",
  evolucaoPrazo:
    "Prazo médio ponderado pelo valor, agrupado pelo mês de vencimento e separado por empresa. Mostra se os prazos estão aumentando ou diminuindo.",
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

  // Compras
  compra:
    "Uma compra é o conjunto de boletos do mesmo documento. O sistema identifica pelo 'seu número': 442415-01, 442415-02 e 442415-03 são 3 parcelas da mesma compra.",
  valorTotalCompra:
    "Soma de todas as parcelas da compra — o valor cheio da venda.",
  prazoUltimaParcela:
    "Prazo em dias da parcela que vence por último. É o tempo total até receber tudo daquela compra.",

  // Histórico / ações
  alertaStatus:
    "Enviado = o alerta desse boleto já foi para o Telegram. Pendente = ainda não (falta token, destinatário, ou o envio falhou).",
  enviarAlertas:
    "Envia no Telegram os alertas dos boletos acima do limite que ainda não foram avisados. Nunca reenvia um alerta já enviado.",
  exportarExcel:
    "Baixa em .xlsx exatamente os boletos que estão passando pelos filtros atuais.",
  limparHistorico:
    "Apaga TODOS os boletos importados. Serve para zerar a base depois dos testes. Não afeta usuários nem configurações, e não tem como desfazer.",
} as const;
