"use client";

import { useState } from "react";
import {
  ArrowRight,
  BellOff,
  Handshake,
  Loader2,
  Megaphone,
  Trash2,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import {
  chaveCliente,
  interpretarCondicao,
  type Acordo,
} from "@/lib/acordos";
import {
  STATUS,
  classificarPedido,
  type LimitesPrazo,
  type StatusPrazo,
} from "@/lib/politica-prazo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Cor/selo de um status, para o resumo do widget. */
function Selo({ status }: { status: StatusPrazo | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const s = STATUS[status];
  const tom =
    status === "normal"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : status === "fora_do_padrao"
        ? "bg-red-500/15 text-red-700 dark:text-red-400"
        : "bg-red-600/20 text-red-800 dark:text-red-300";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", tom)}>
      {s.emoji} {s.curto}
    </span>
  );
}

/** A média que uma condição interpretada produz — cada parcela pesa igual. */
function mediaDaLista(expandida: string): number | null {
  const nums = expandida
    .split("/")
    .map(Number)
    .filter((n) => Number.isFinite(n));
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

/**
 * Célula de acordo de um cliente na tela de Clientes.
 *
 * O cadastro nasce sozinho: o cliente já está aqui porque apareceu num boleto.
 * Esta célula só grava o que foi COMBINADO com ele — o prazo daqui para frente
 * e/ou o "estou ciente, não me avise".
 *
 * Registrar um acordo abre um widget central: é uma decisão que muda o que o
 * time cobra desse cliente daqui pra frente, e engana fácil clicar errado
 * numa caixinha de tabela. O widget mostra de onde pra onde o prazo vai, se
 * isso tira o cliente do fora do padrão, e se vai sair aviso no Telegram —
 * tudo ANTES de confirmar, não depois.
 */
export function AcordoCliente({
  nome,
  acordo,
  anterior,
  valorCarteira,
  limites,
  aoSalvar,
  aoRegistrarHistorico,
}: {
  nome: string;
  acordo: Acordo | undefined;
  /** O que o cliente praticava — o sistema descobre e grava como "antes". */
  anterior: { condicao: string | null; prazo: number | null };
  valorCarteira?: number;
  limites: LimitesPrazo;
  aoSalvar: (a: Acordo | null) => void;
  /** Avisa a tela para recarregar a linha do tempo depois de um degrau novo. */
  aoRegistrarHistorico?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [condicao, setCondicao] = useState<string>(
    acordo?.condicao_acordada ??
      (acordo?.prazo_acordado != null ? String(acordo.prazo_acordado) : "")
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const chave = chaveCliente(nome);

  // De onde este acordo parte: o prazo que vale HOJE. Na primeira vez é o
  // retrato do que o cliente praticava; na segunda em diante, o acordo
  // anterior — é isso que faz a linha do tempo ter degraus.
  const condicaoAtual = acordo?.condicao_acordada ?? anterior.condicao;
  const prazoAtual = acordo?.prazo_acordado ?? anterior.prazo;
  const mediaAtual =
    condicaoAtual != null
      ? mediaDaLista(interpretarCondicao(condicaoAtual).expandida)
      : null;
  const statusAtual = classificarPedido(mediaAtual, prazoAtual, limites);

  const lido = interpretarCondicao(condicao);
  const mediaNova = lido.expandida ? mediaDaLista(lido.expandida) : null;
  const statusNovo =
    lido.prazo != null ? classificarPedido(mediaNova, lido.prazo, limites) : null;

  const reducao =
    lido.prazo != null && prazoAtual != null ? prazoAtual - lido.prazo : null;
  const vaiAvisarTelegram = reducao != null && reducao > 0;
  const saiuDoForaDoPadrao =
    statusAtual != null && statusAtual !== "normal" && statusNovo === "normal";

  function abrir() {
    setCondicao(
      acordo?.condicao_acordada ??
        (acordo?.prazo_acordado != null ? String(acordo.prazo_acordado) : "")
    );
    setErro(null);
    setAberto(true);
  }

  async function gravar(campos: Partial<Acordo>) {
    setSalvando(true);
    setErro(null);
    try {
      const registro = {
        cliente_chave: chave,
        cliente_nome: nome,
        prazo_acordado: acordo?.prazo_acordado ?? null,
        condicao_acordada: acordo?.condicao_acordada ?? null,
        condicao_anterior: acordo?.condicao_anterior ?? anterior.condicao,
        prazo_anterior: acordo?.prazo_anterior ?? anterior.prazo,
        sem_alerta: acordo?.sem_alerta ?? false,
        acordado_em: acordo?.acordado_em ?? new Date().toISOString(),
        ...campos,
        updated_at: new Date().toISOString(),
      };

      const prazoPartida = acordo?.prazo_acordado ?? anterior.prazo;
      const condicaoPartida =
        acordo?.condicao_acordada ?? acordo?.condicao_anterior ?? anterior.condicao;

      const { data, error } = await supabase
        .from("acordos_prazo")
        .upsert(registro, { onConflict: "cliente_chave" })
        .select("*")
        .single();
      if (error) throw error;

      const salvo = data as Acordo;

      const mudouPrazo =
        campos.prazo_acordado !== undefined &&
        campos.prazo_acordado !== prazoPartida;
      if (mudouPrazo) {
        const { error: erroHist } = await supabase.from("acordos_historico").insert({
          cliente_chave: chave,
          cliente_nome: nome,
          condicao_anterior: condicaoPartida ?? null,
          prazo_anterior: prazoPartida ?? null,
          condicao_nova: salvo.condicao_acordada ?? null,
          prazo_novo: salvo.prazo_acordado ?? null,
        });
        if (erroHist) console.error("[acordo] histórico não gravado:", erroHist);
        else aoRegistrarHistorico?.();
      }

      aoSalvar(salvo);
      setAberto(false);

      const antes = salvo.prazo_anterior ?? anterior.prazo;
      const depois = salvo.prazo_acordado;
      if (typeof antes === "number" && typeof depois === "number" && depois < antes) {
        fetch("/api/telegram/acordo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cliente: nome,
            condicaoAnterior: salvo.condicao_anterior ?? anterior.condicao,
            prazoAnterior: antes,
            condicaoNova: salvo.condicao_acordada,
            prazoNovo: depois,
            valorCarteira,
          }),
        }).catch(() => {});
      }
    } catch (err) {
      console.error(err);
      setErro("Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function limpar() {
    setSalvando(true);
    try {
      const { error } = await supabase
        .from("acordos_prazo")
        .delete()
        .eq("cliente_chave", chave);
      if (error) throw error;
      aoSalvar(null);
      setCondicao("");
      setAberto(false);
    } catch (err) {
      console.error(err);
      setErro("Não foi possível remover.");
    } finally {
      setSalvando(false);
    }
  }

  function confirmar() {
    const { condicao: c, prazo: pr } = interpretarCondicao(condicao);
    gravar({ condicao_acordada: c || null, prazo_acordado: pr });
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        {acordo?.prazo_acordado != null ? (
          <button
            type="button"
            onClick={abrir}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand hover:bg-brand/20"
            title="Clique para ver ou renegociar o acordo"
          >
            <Handshake className="h-3 w-3 shrink-0" />
            {acordo.condicao_anterior && (
              <>
                <span className="font-normal text-muted-foreground line-through">
                  {acordo.condicao_anterior}
                </span>
                <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
              </>
            )}
            <span>{acordo.condicao_acordada ?? `${acordo.prazo_acordado}d`}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={abrir}
            className="rounded-full px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Registrar um acordo de prazo com este cliente"
          >
            + acordo
          </button>
        )}

        <Button
          size="icon"
          variant="ghost"
          className={cn(
            "h-7 w-7",
            acordo?.sem_alerta && "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          )}
          disabled={salvando}
          title={
            acordo?.sem_alerta
              ? "Você está ciente: este cliente não gera alerta. Clique para voltar a avisar."
              : "Estou ciente que este cliente passa do prazo — parar de alertar"
          }
          onClick={() => {
            const novo = !(acordo?.sem_alerta ?? false);
            if (!novo && acordo?.prazo_acordado == null) limpar();
            else gravar({ sem_alerta: novo });
          }}
        >
          {salvando && !aberto ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <BellOff className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Handshake className="h-5 w-5 text-brand" />
              Registrar acordo de prazo
            </DialogTitle>
            <DialogDescription>{nome}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Situação atual — o ponto de partida, para não decidir às cegas. */}
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Prazo em vigor hoje
              </p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="font-mono text-lg font-semibold">
                  {condicaoAtual ?? (prazoAtual != null ? `${prazoAtual}d` : "—")}
                </span>
                <Selo status={statusAtual} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="condicao-acordo">Nova condição combinada</Label>
              <Input
                id="condicao-acordo"
                autoFocus
                placeholder="30/150"
                title="Como você fala com o cliente: 30/150"
                value={condicao}
                onChange={(e) => setCondicao(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && lido.prazo != null) confirmar();
                }}
              />
              {lido.prazo != null ? (
                <p className="text-xs text-muted-foreground">
                  Entendido como {lido.expandida} · {lido.parcelas}x · última
                  parcela em {lido.prazo} dias
                </p>
              ) : (
                condicao.trim() !== "" && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Não consegui ler um prazo aí — escreva como "30/150" ou só o
                    número de dias.
                  </p>
                )
              )}
            </div>

            {/* O resumo da operação: de onde pra onde, bem grande, antes de
                confirmar — é o widget que precisa deixar claro o que vai
                acontecer. */}
            {lido.prazo != null && (
              <div className="rounded-lg border-2 border-brand/30 bg-brand/[0.04] p-3">
                <div className="flex items-center justify-center gap-3 text-center">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      De
                    </p>
                    <p className="font-mono text-base font-semibold text-muted-foreground line-through">
                      {condicaoAtual ?? (prazoAtual != null ? `${prazoAtual}d` : "—")}
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 shrink-0 text-brand" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Para
                    </p>
                    <p className="font-mono text-base font-bold text-brand">
                      {lido.condicao || `${lido.prazo}d`}
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm">
                  {reducao != null && reducao !== 0 && (
                    <span
                      className={cn(
                        "font-semibold",
                        reducao > 0
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-red-700 dark:text-red-400"
                      )}
                    >
                      {reducao > 0 ? "−" : "+"}
                      {Math.abs(reducao)} dia{Math.abs(reducao) > 1 ? "s" : ""}
                    </span>
                  )}
                  <Selo status={statusNovo} />
                </div>

                {saiuDoForaDoPadrao && (
                  <p className="mt-2 text-center text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    ✅ Esse acordo traz o cliente de volta para dentro do padrão.
                  </p>
                )}

                <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                  <Megaphone className="h-3.5 w-3.5 shrink-0" />
                  {vaiAvisarTelegram
                    ? "Isso vai avisar o grupo no Telegram, porque é uma redução de prazo."
                    : "Isso NÃO avisa o Telegram — só reduções de prazo geram aviso."}
                </p>
              </div>
            )}

            {erro && <p className="text-sm text-red-600">{erro}</p>}
          </div>

          <DialogFooter className="items-center sm:justify-between">
            {acordo?.prazo_acordado != null ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-red-600"
                disabled={salvando}
                onClick={limpar}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remover acordo
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAberto(false)} disabled={salvando}>
                Cancelar
              </Button>
              <Button onClick={confirmar} disabled={salvando || lido.prazo == null}>
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar acordo
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
