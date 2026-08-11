"use client";

import { useState } from "react";
import { BellOff, Check, Handshake, Loader2, X } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { chaveCliente, type Acordo } from "@/lib/acordos";
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
  aoSalvar,
}: {
  nome: string;
  acordo: Acordo | undefined;
  aoSalvar: (a: Acordo | null) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [prazo, setPrazo] = useState<string>(
    acordo?.prazo_acordado != null ? String(acordo.prazo_acordado) : ""
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

      aoSalvar(data as Acordo);
      setEditando(false);
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
      setPrazo("");
      setEditando(false);
    } catch (err) {
      console.error(err);
      setErro("Não foi possível remover.");
    } finally {
      setSalvando(false);
    }
  }

  if (editando) {
    return (
      <div className="flex items-center justify-end gap-1">
        <Input
          type="number"
          min={1}
          autoFocus
          className="h-8 w-20 text-right"
          placeholder="150"
          value={prazo}
          onChange={(e) => setPrazo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              gravar({ prazo_acordado: parseInt(prazo) || null });
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
          onClick={() => gravar({ prazo_acordado: parseInt(prazo) || null })}
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
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {erro && <span className="text-xs text-red-600">{erro}</span>}

      {acordo?.prazo_acordado != null ? (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand hover:bg-brand/20"
          title="Prazo combinado com este cliente — clique para alterar"
        >
          <Handshake className="h-3 w-3" />
          {acordo.prazo_acordado}d
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
