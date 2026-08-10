"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { AJUDA } from "@/lib/ajuda-textos";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Ajuda } from "@/components/ajuda";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Aviso = { tipo: "ok" | "erro"; texto: string } | null;

interface StatusBot {
  configurado: boolean;
  motivo?: string;
  detalhe?: string;
  bot?: { username: string; nome: string };
}

interface ChatEncontrado {
  id: string;
  nome: string;
  tipo: string;
}

export default function ConfiguracoesPage() {
  const [configId, setConfigId] = useState<string | null>(null);
  const [limite, setLimite] = useState<number>(60);
  const [regra, setRegra] = useState<"venda" | "boleto">("venda");
  const [chatIds, setChatIds] = useState<string[]>([]);
  const [novoChat, setNovoChat] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [limpando, setLimpando] = useState(false);
  const [ehAdminAtual, setEhAdminAtual] = useState(false);
  const [status, setStatus] = useState<StatusBot | null>(null);
  const [chatsEncontrados, setChatsEncontrados] = useState<
    ChatEncontrado[] | null
  >(null);
  const [buscando, setBuscando] = useState(false);
  const [testando, setTestando] = useState<string | null>(null);
  const [enviandoResumo, setEnviandoResumo] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);

  useEffect(() => {
    supabase
      .from("configuracoes")
      .select("id, limite_prazo_dias, telegram_chat_ids, regra_limite")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setConfigId(data.id);
          setLimite(data.limite_prazo_dias ?? 60);
          setRegra((data.regra_limite as "venda" | "boleto") ?? "venda");
          setChatIds(
            Array.isArray(data.telegram_chat_ids) ? data.telegram_chat_ids : []
          );
        }
        setCarregando(false);
      });

    fetch("/api/sessao")
      .then((r) => r.json())
      .then((d) => setEhAdminAtual(d?.sessao?.papel === "admin"))
      .catch(() => setEhAdminAtual(false));

    fetch("/api/telegram/status")
      .then((r) => r.json())
      .then((d) => setStatus(d as StatusBot))
      .catch(() => setStatus({ configurado: false, motivo: "erro_rede" }));
  }, []);

  async function buscarChats() {
    setBuscando(true);
    setAviso(null);
    try {
      const r = await fetch("/api/telegram/chats").then((x) => x.json());
      setChatsEncontrados(r?.chats ?? []);
      if (r?.motivo && r.motivo !== "ok" && r.motivo !== "sem_token") {
        setAviso({
          tipo: "erro",
          texto: r.detalhe ?? "Não foi possível consultar o Telegram.",
        });
      }
    } finally {
      setBuscando(false);
    }
  }

  async function enviarTeste(chatId: string) {
    setTestando(chatId);
    setAviso(null);
    try {
      const r = await fetch("/api/telegram/teste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId }),
      }).then((x) => x.json());
      setAviso(
        r?.ok
          ? { tipo: "ok", texto: `Mensagem de teste enviada para ${chatId}.` }
          : { tipo: "erro", texto: r?.erro ?? "Falha ao enviar o teste." }
      );
    } finally {
      setTestando(null);
    }
  }

  async function enviarResumoAgora() {
    setEnviandoResumo(true);
    setAviso(null);
    try {
      const r = await fetch("/api/telegram/resumo", { method: "POST" }).then(
        (x) => x.json()
      );
      setAviso(
        r?.ok
          ? {
              tipo: "ok",
              texto: `Resumo enviado para ${r.enviados} destinatário(s).`,
            }
          : {
              tipo: "erro",
              texto:
                r?.motivo === "sem_token"
                  ? "Bot sem token configurado."
                  : r?.motivo === "sem_destinatarios"
                    ? "Cadastre ao menos um destinatário antes."
                    : "Não foi possível enviar o resumo.",
            }
      );
    } finally {
      setEnviandoResumo(false);
    }
  }

  function adicionarChat() {
    const v = novoChat.trim();
    if (!v) return;
    if (chatIds.includes(v)) {
      setAviso({ tipo: "erro", texto: "Esse chat_id já está cadastrado." });
      return;
    }
    setChatIds((prev) => [...prev, v]);
    setNovoChat("");
    setAviso(null);
  }

  function removerChat(id: string) {
    setChatIds((prev) => prev.filter((c) => c !== id));
  }

  async function salvar() {
    setSalvando(true);
    setAviso(null);
    try {
      const payload = {
        limite_prazo_dias: Number(limite) || 0,
        regra_limite: regra,
        telegram_chat_ids: chatIds,
        updated_at: new Date().toISOString(),
      };

      let error;
      if (configId) {
        ({ error } = await supabase
          .from("configuracoes")
          .update(payload)
          .eq("id", configId));
      } else {
        const res = await supabase
          .from("configuracoes")
          .insert(payload)
          .select("id")
          .single();
        error = res.error;
        if (res.data) setConfigId(res.data.id);
      }
      if (error) throw error;
      setAviso({ tipo: "ok", texto: "Configurações salvas." });
    } catch (err) {
      console.error(err);
      setAviso({ tipo: "erro", texto: "Erro ao salvar as configurações." });
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Configurações"
        description="Defina o limite de prazo e os destinatários dos alertas no Telegram."
      />

      <Card>
        <CardHeader>
          <CardTitle>Limite de prazo</CardTitle>
          <CardDescription>
            Boletos com prazo (dias corridos) acima deste valor são marcados
            como excedidos e geram alerta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="limite" className="flex items-center gap-1.5">Limite (dias)<Ajuda titulo="Limite de prazo" texto={AJUDA.limite} /></Label>
              <Input
                id="limite"
                type="number"
                min={1}
                className="w-32"
                value={limite}
                onChange={(e) => setLimite(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label className="flex items-center gap-1.5">
                Aplicar o limite sobre
                <Ajuda titulo="Regra do limite" texto={AJUDA.regraLimite} />
              </Label>
              <Select
                value={regra}
                onValueChange={(v) => setRegra(v as "venda" | "boleto")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="venda">
                    Prazo de recebimento da venda
                  </SelectItem>
                  <SelectItem value="boleto">Prazo de cada parcela</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {regra === "venda"
              ? "Uma venda de R$ 10.000 em 4x é avaliada como um crédito único até a última parcela (ex.: 120 dias) — e gera um alerta só."
              : "Cada parcela é avaliada isoladamente pelo seu próprio vencimento."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            Alertas no Telegram
            <Ajuda titulo="Telegram" texto={AJUDA.telegram} />
          </CardTitle>
          <CardDescription>
            Quem deve receber os avisos de venda acima do limite.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Estado da conexão do bot */}
          <div
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm",
              status?.configurado
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
            )}
          >
            {status === null ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Verificando o bot…
              </>
            ) : status.configurado ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Bot conectado:{" "}
                <span className="font-medium">@{status.bot?.username}</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4" />
                {status.motivo === "sem_token"
                  ? "Bot ainda não configurado — falta a variável TELEGRAM_BOT_TOKEN na Vercel."
                  : status.motivo === "token_invalido"
                    ? `Token recusado pelo Telegram. ${status.detalhe ?? ""}`
                    : "Não foi possível falar com o Telegram agora."}
              </>
            )}
          </div>

          {/* Descoberta de destinatários */}
          {status?.configurado && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">Adicionar quem vai receber</p>
              <p className="text-xs text-muted-foreground">
                Peça para a pessoa abrir o Telegram, procurar{" "}
                <span className="font-medium">@{status.bot?.username}</span> e
                enviar qualquer mensagem (ex.: “oi”). Depois clique em buscar —
                ela aparece aqui para adicionar com um clique.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={buscando}
                  onClick={buscarChats}
                >
                  {buscando ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <RefreshCw />
                  )}
                  Buscar quem falou com o bot
                </Button>
              </div>

              {chatsEncontrados !== null &&
                (chatsEncontrados.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Ninguém encontrado. A pessoa precisa enviar uma mensagem ao
                    bot — e o Telegram só guarda as conversas recentes.
                  </p>
                ) : (
                  <ul className="divide-y rounded-md border bg-card">
                    {chatsEncontrados.map((c) => {
                      const jaTem = chatIds.includes(c.id);
                      return (
                        <li
                          key={c.id}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {c.nome}
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {c.id} · {c.tipo}
                            </span>
                          </span>
                          <Button
                            size="sm"
                            variant={jaTem ? "ghost" : "outline"}
                            disabled={jaTem}
                            onClick={() => {
                              setChatIds((prev) => [...prev, c.id]);
                              setAviso({
                                tipo: "ok",
                                texto: `${c.nome} adicionado. Clique em "Salvar configurações" para confirmar.`,
                              });
                            }}
                          >
                            {jaTem ? "Já cadastrado" : <><Plus /> Adicionar</>}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="novoChat">Ou informe o chat_id manualmente</Label>
              <Input
                id="novoChat"
                value={novoChat}
                placeholder="Ex.: 123456789"
                onChange={(e) => setNovoChat(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    adicionarChat();
                  }
                }}
              />
            </div>
            <Button type="button" variant="outline" onClick={adicionarChat}>
              <Plus /> Adicionar
            </Button>
          </div>

          {chatIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum destinatário cadastrado.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {chatIds.map((id) => (
                <li
                  key={id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span className="font-mono">{id}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!status?.configurado || testando === id}
                      onClick={() => enviarTeste(id)}
                    >
                      {testando === id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Send />
                      )}
                      Testar
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removerChat(id)}
                      aria-label="Remover destinatário"
                    >
                      <Trash2 className="text-muted-foreground" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              Resumo diário
              <Ajuda titulo="Resumo diário" texto={AJUDA.resumoDiario} />
            </p>
            <p className="text-xs text-muted-foreground">
              Todo dia às 18h (horário de Brasília) o bot manda o panorama da
              carteira: o que entrou no dia, quanto passou do limite, prazo médio
              de recebimento, o que vence em 7 dias e o que já venceu.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!status?.configurado || enviandoResumo}
              onClick={enviarResumoAgora}
            >
              {enviandoResumo ? <Loader2 className="animate-spin" /> : <Send />}
              Enviar resumo agora
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar configurações
        </Button>
        {aviso && (
          <span
            className={cn(
              "text-sm",
              aviso.tipo === "ok" ? "text-emerald-600" : "text-red-600"
            )}
          >
            {aviso.texto}
          </span>
        )}
      </div>

      {ehAdminAtual && (
        <Card className="border-red-200 dark:border-red-900/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-1.5 text-base">
              Zona de risco
              <Ajuda titulo="Limpar histórico" texto={AJUDA.limparHistorico} />
            </CardTitle>
            <CardDescription>
              Apaga todos os boletos importados. Útil para zerar a base depois
              dos testes. Não afeta usuários nem configurações.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="destructive"
              disabled={limpando}
              onClick={async () => {
                if (
                  !window.confirm(
                    "Apagar TODOS os boletos importados?\n\nIsso não pode ser desfeito. Usuários e configurações não serão afetados."
                  )
                )
                  return;
                setLimpando(true);
                try {
                  const resp = await fetch("/api/boletos/limpar", {
                    method: "POST",
                  });
                  const r = await resp.json().catch(() => null);
                  setAviso(
                    resp.ok
                      ? { tipo: "ok", texto: `${r?.apagados ?? 0} boleto(s) apagado(s).` }
                      : { tipo: "erro", texto: r?.erro ?? "Erro ao limpar." }
                  );
                } finally {
                  setLimpando(false);
                }
              }}
            >
              {limpando ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Limpar histórico de boletos
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Acesso</CardTitle>
          <CardDescription>
            Encerra a sessão neste dispositivo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={async () => {
              await fetch("/api/logout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            <LogOut /> Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
