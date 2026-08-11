"use client";

import { useState } from "react";
import { ArrowRight, BellOff, Check, Handshake, Loader2, X } from "lucide-react";

import { supabase } from "@/lib/supabase";
import {
  chaveCliente,
  interpretarCondicao,
  type Acordo,
} from "@/lib/acordos";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Célula de acordo de um cliente na tela de Clientes.
 *
 * O cadastro nasce sozinho: o cliente já está aqui porque apareceu num boleto.
 * Esta célula só grava o que foi COMBINADO com ele — o prazo daqui para frente
 * e/ou o "estou ciente, não me avise".
 */
export function AcordoCliente({
  nome,
  acordo,
  anterior,
  valorCarteira,
  aoSalvar,
}: {
  nome: string;
  acordo: Acordo | undefined;
  /** O que o cliente praticava — o sistema descobre e grava como "antes". */
  anterior: { condicao: string | null; prazo: number | null };
  valorCarteira?: number;
  aoSalvar: (a: Acordo | null) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [condicao, setCondicao] = useState<string>(
    acordo?.condicao_acordada ??
      (acordo?.prazo_acordado != null ? String(acordo.prazo_acordado) : "")
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const chave = chaveCliente(nome);

  async function gravar(campos: Partial<Acordo>) {
    setSalvando(true);
    setErro(null);
    try {
      const registro = {
        cliente_chave: chave,
        cliente_nome: nome,
        prazo_acordado: acordo?.prazo_acordado ?? null,
        condicao_acordada: acordo?.condicao_acordada ?? null,
        // O "antes" é um retrato: gravado uma vez, na criação do acordo, para
        // não mudar depois nem sumir quando o histórico for limpo.
        condicao_anterior: acordo?.condicao_anterior ?? anterior.condicao,
        prazo_anterior: acordo?.prazo_anterior ?? anterior.prazo,
        sem_alerta: acordo?.sem_alerta ?? false,
        // Só reinicia a validade quando o acordo é criado; editar depois não
        // deve fazer o sistema esquecer o que já foi cobrado.
        acordado_em: acordo?.acordado_em ?? new Date().toISOString(),
        ...campos,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("acordos_prazo")
        .upsert(registro, { onConflict: "cliente_chave" })
        .select("*")
        .single();
      if (error) throw error;

      const salvo = data as Acordo;
      aoSalvar(salvo);
      setEditando(false);

      // Redução negociada vira notícia boa no grupo. Falhar aqui não pode
      // desfazer o acordo, que já está gravado — por isso o erro é engolido.
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
      setEditando(false);
    } catch (err) {
      console.error(err);
      setErro("Não foi possível remover.");
    } finally {
      setSalvando(false);
    }
  }

  // Mostra o que o sistema entendeu ENQUANTO se digita: "30/150" vira
  // 30/60/90/120/150, e ninguém precisa adivinhar se foi lido como faixa.
  const lido = interpretarCondicao(condicao);

  if (editando) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center justify-end gap-1">
        <Input
          autoFocus
          className="h-8 w-28 text-right"
          placeholder="30/150"
          title="A condição combinada, como você fala com o cliente: 30/150"
          value={condicao}
          onChange={(e) => setCondicao(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const { condicao: c, prazo: pr } = interpretarCondicao(condicao);
              gravar({ condicao_acordada: c || null, prazo_acordado: pr });
            }
            if (e.key === "Escape") setEditando(false);
          }}
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          disabled={salvando}
          title="Salvar acordo"
          onClick={() => {
            const { condicao: c, prazo: pr } = interpretarCondicao(condicao);
            gravar({ condicao_acordada: c || null, prazo_acordado: pr });
          }}
        >
          {salvando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          title="Cancelar"
          onClick={() => setEditando(false)}
        >
          <X className="h-4 w-4" />
        </Button>
        </div>
        {lido.prazo != null && (
          <p className="text-[11px] text-muted-foreground">
            {lido.expandida} · {lido.parcelas}x · último {lido.prazo}d
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {erro && <span className="text-xs text-red-600">{erro}</span>}

      {acordo?.prazo_acordado != null ? (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand hover:bg-brand/20"
          title={`Antes: ${acordo.condicao_anterior ?? "—"} (${
            acordo.prazo_anterior ?? "—"
          }d) · Agora: ${
            acordo.condicao_acordada ?? acordo.prazo_acordado
          } (${acordo.prazo_acordado}d). Clique para alterar.`}
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
          onClick={() => setEditando(true)}
          className="rounded-full px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Definir o prazo combinado com este cliente"
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
        {salvando ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <BellOff className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
