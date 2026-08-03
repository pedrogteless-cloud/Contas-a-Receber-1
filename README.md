# Contas a Receber 1

**Grupo Ley · Controle interno** — app interno para acompanhar prazos de
recebimento de boletos (Sicoob), sinalizar títulos acima do limite e disparar
alertas no Telegram.

Stack: **Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui**,
banco no **Supabase**, gráficos com **Recharts**.

## Páginas

- **Importação** (inicial) — seleciona a empresa (Ley Móveis / Ley Colchões),
  faz upload do relatório Sicoob em `.xlsx` (parse no navegador com SheetJS) ou
  `.pdf` (texto extraído no servidor via `unpdf`), abre uma tela de conferência
  editável e grava os boletos, disparando os alertas dos que excederam o limite.
- **Dashboard** — cards (prazo médio geral e por empresa, valor em carteira,
  % acima do limite, a vencer em 7 dias), gráficos Recharts e insights
  automáticos. Filtros por empresa e por período de vencimento.
- **Histórico** — indicadores, filtros (sacado, empresa, período de importação
  e de vencimento), resumo das importações por data e lista dos boletos acima
  do limite com status do alerta e botão para enviar os pendentes.
- **Configurações** — edita o limite de prazo (padrão 60 dias) e gerencia os
  destinatários (`chat_id`) do Telegram.

## Variáveis de ambiente

Copie `.env.example` para `.env.local`. As duas primeiras são públicas; as duas
últimas são **segredos** — só no servidor, nunca no client nem no banco, e
nunca commitadas.

```
NEXT_PUBLIC_SUPABASE_URL=          # URL do projeto Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # chave publicável (anon)
SUPABASE_SERVICE_ROLE_KEY=         # Supabase -> Settings -> API -> service_role
TELEGRAM_BOT_TOKEN=                # token do bot criado no @BotFather
```

`SUPABASE_SERVICE_ROLE_KEY` e `TELEGRAM_BOT_TOKEN` são usados **apenas** em
route handlers do servidor (`app/api/telegram`). O `.env.local` está no
`.gitignore`.

## Banco de dados

O projeto Supabase já está provisionado, com as tabelas `boletos` e
`configuracoes`, RLS habilitada, policies permissivas e a linha inicial de
configuração (`limite_prazo_dias = 60`). Não é necessário rodar migração.

## Desenvolvimento

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # build de produção
```

## Deploy (Vercel)

1. `git push` para o GitHub.
2. Na Vercel: **Add New → Project** e importe o repositório.
3. Em **Environment Variables**, cole as 4 variáveis (as duas do Supabase, a
   `service_role` do painel Supabase e o `TELEGRAM_BOT_TOKEN` do @BotFather).
   Nunca coloque a `service_role` em nada que vá para o GitHub.
4. **Deploy**. A cada `git push` a Vercel refaz o deploy automaticamente.
5. Crie o bot no @BotFather, pegue o token e cadastre os `chat_id` (você e o
   time de Crédito/Cobrança) na tela de **Configurações** do app publicado.

## Observações sobre o parser Sicoob

`lib/boletos.ts` reconhece as colunas do relatório por heurística (cabeçalhos
como *Sacado/Pagador*, *Nosso número*, *Seu número/Documento*, *Entrada/Emissão*,
*Vencimento* e *Valor*) tanto no `.xlsx` quanto no texto do `.pdf`. A tela de
conferência é obrigatória justamente para ajustar qualquer linha antes de
gravar — se algum layout específico não for reconhecido, ajuste o mapeamento em
`detectarColunas` / `extrairDeTexto`.
