"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BellOff,
  Eye,
  EyeOff,
  Loader2,
  Send,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import {
  MOMENTOS,
  NOTIFICACOES,
  lerNotificacoes,
  notificacaoAtiva,
  type ChaveNotificacao,
  type MapaNotificacoes,
  type Momento,
} from "@/lib/notificacoes";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface StatusBot {
  configurado: boolean;
  bot?: { username: string; nome: string };
}

export default function NotificacoesPage() {
  const [configId, setConfigId] = useState<string | null>(null);
  const [mapa, setMapa] = useState<MapaNotificacoes>({});
  const [destinatarios, setDestinatarios] = useState<number>(0);
  const [status, setStatus] = useState<StatusBot | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<ChaveNotificacao | null>(null);
  const [enviandoFechamento, setEnviandoFechamento] = useState(false);
  const [aberto, setAberto] = useState<ChaveNotificacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("configuracoes")
      .select("*")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setConfigId(data.id);
          setMapa(lerNotificacoes(data));
          setDestinatarios(
            Array.isArray(data.telegram_chat_ids)
              ? data.telegram_chat_ids.filter(Boolean).length
              : 0
          );
        }
        setCarregando(false);
      });

    fetch("/api/telegram/status")
      .then((r) => r.json())
      .then((d) => setStatus(d as StatusBot))
      .catch(() => setStatus({ configurado: false }));
  }, []);

  const ativas = useMemo(
    () => NOTIFICACOES.filter((n) => notificacaoAtiva(mapa, n.chave)).length,
    [mapa]
  );

  async function alternar(chave: ChaveNotificacao) {
    const novo = { ...mapa, [chave]: !notificacaoAtiva(mapa, chave) };
    setMapa(novo);
    setSalvando(chave);
    setErro(null);
    setAviso(null);
    try {
      const { error } = configId
        ? await supabase
            .from("configuracoes")
            .update({ notificacoes: novo, updated_at: new Date().toISOString() })
            .eq("id", configId)
        : await supabase.from("configuracoes").insert({ notificacoes: novo });
      if (error) throw error;
    } catch (err) {
      console.error(err);
      setErro("Não foi possível salvar. O estado voltou ao anterior.");
      setMapa(mapa); // desfaz
    } finally {
      setSalvando(null);
    }
  }

  async function enviarFechamentoAgora() {
    setEnviandoFechamento(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await fetch("/api/telegram/resumo", { method: "POST" }).then(
        (x) => x.json()
      );
      if (r?.ok) {
        setAviso(
          `Avisos das 18h enviados para ${r.enviados} destinatário(s).`
        );
        return;
      }

      setErro(
        r?.motivo === "sem_token"
          ? "Bot sem token configurado."
          : r?.motivo === "sem_destinatarios"
            ? "Cadastre ao menos um destinatário antes."
            : r?.motivo === "aviso_desligado"
              ? "O aviso de fechamento do dia está desligado."
              : r?.erro ?? "Não foi possível enviar os avisos das 18h."
      );
    } finally {
      setEnviandoFechamento(false);
    }
  }

  const porMomento = useMemo(() => {
    const g = new Map<Momento, typeof NOTIFICACOES>();
    for (const n of NOTIFICACOES) {
      if (!g.has(n.momento)) g.set(n.momento, []);
      g.get(n.momento)!.push(n);
    }
    return g;
  }, []);

  const botOk = status?.configurado && destinatarios > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificações"
        description="Tudo que o sistema manda no Telegram — e o que está ligado agora."
      />

      {carregando ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Avisos ativos"
            value={`${ativas} de ${NOTIFICACOES.length}`}
            icon={Bell}
            tom="brand"
            ajuda="Quantos tipos de aviso estão ligados. Desligar um tipo não apaga nada — só para de enviar."
          />
          <StatCard
            label="Bot do Telegram"
            value={status?.configurado ? "Conectado" : "Sem token"}
            hint={status?.bot ? `@${status.bot.username}` : undefined}
            icon={Bell}
            tom={status?.configurado ? "success" : "danger"}
            ajuda="O bot precisa de token válido na Vercel para qualquer aviso sair."
          />
          <StatCard
            label="Destinatários"
            value={String(destinatarios)}
            hint={destinatarios === 0 ? "Cadastre em Configurações" : undefined}
            icon={Bell}
            tom={destinatarios > 0 ? "success" : "warning"}
            ajuda="Grupos e pessoas que recebem os avisos. Sem destinatário, nada é enviado."
          />
        </div>
      )}

      {!carregando && !botOk && (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="flex gap-3 p-4 text-sm text-amber-900 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Com o bot sem token ou sem destinatário, <b>nenhum aviso sai</b> —
              mesmo os que aparecem ligados aqui. Resolva primeiro em{" "}
              <b>Configurações</b>.
            </p>
          </CardContent>
        </Card>
      )}

      {erro && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {erro}
        </p>
      )}

      {aviso && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {aviso}
        </p>
      )}

      {Array.from(porMomento.entries()).map(([momento, lista]) => (
        <Card key={momento}>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{MOMENTOS[momento]}</CardTitle>
                <CardDescription>
                  {momento === "importacao"
                    ? "Saem na hora em que alguém confirma uma importação."
                    : momento === "fechamento"
                      ? "Saem uma vez por dia, às 18h."
                      : "Saem quando alguém registra algo no sistema."}
                </CardDescription>
              </div>
              {momento === "fechamento" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!botOk || enviandoFechamento}
                  onClick={enviarFechamentoAgora}
                >
                  {enviandoFechamento ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Enviar agora
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {lista.map((n) => {
              const ligada = notificacaoAtiva(mapa, n.chave);
              const vendo = aberto === n.chave;
              return (
                <div
                  key={n.chave}
                  className={cn(
                    "rounded-lg border p-3 transition-colors",
                    ligada ? "bg-card" : "bg-muted/40"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-lg leading-none">{n.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {n.titulo}
                        {!ligada && (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            desligado
                          </span>
                        )}
                        {n.critico && ligada && (
                          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                            crítico
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {n.descricao}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/80">
                        ⏱ {n.quando}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title={vendo ? "Esconder exemplo" : "Ver exemplo da mensagem"}
                        onClick={() => setAberto(vendo ? null : n.chave)}
                      >
                        {vendo ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant={ligada ? "default" : "outline"}
                        className="w-[6.5rem]"
                        disabled={salvando === n.chave}
                        onClick={() => alternar(n.chave)}
                      >
                        {salvando === n.chave ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : ligada ? (
                          <>
                            <Bell className="h-3.5 w-3.5" /> Ligado
                          </>
                        ) : (
                          <>
                            <BellOff className="h-3.5 w-3.5" /> Desligado
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {vendo && (
                    <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed text-foreground scroll-thin">
                      {n.exemplo}
                    </pre>
                  )}

                  {n.critico && !ligada && (
                    <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                      Este é o aviso de prazo <b>não permitido</b>. Com ele
                      desligado, um pedido acima do teto passa sem ninguém saber.
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
