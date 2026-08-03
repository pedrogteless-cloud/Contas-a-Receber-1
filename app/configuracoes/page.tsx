"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
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

type Aviso = { tipo: "ok" | "erro"; texto: string } | null;

export default function ConfiguracoesPage() {
  const [configId, setConfigId] = useState<string | null>(null);
  const [limite, setLimite] = useState<number>(60);
  const [chatIds, setChatIds] = useState<string[]>([]);
  const [novoChat, setNovoChat] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);

  useEffect(() => {
    supabase
      .from("configuracoes")
      .select("id, limite_prazo_dias, telegram_chat_ids")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setConfigId(data.id);
          setLimite(data.limite_prazo_dias ?? 60);
          setChatIds(
            Array.isArray(data.telegram_chat_ids) ? data.telegram_chat_ids : []
          );
        }
        setCarregando(false);
      });
  }, []);

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
              <Label htmlFor="limite">Limite (dias)</Label>
              <Input
                id="limite"
                type="number"
                min={1}
                className="w-32"
                value={limite}
                onChange={(e) => setLimite(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Destinatários do Telegram</CardTitle>
          <CardDescription>
            Cadastre os <code>chat_id</code> que devem receber os alertas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="novoChat">Novo chat_id</Label>
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
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span className="font-mono">{id}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removerChat(id)}
                    aria-label="Remover destinatário"
                  >
                    <Trash2 className="text-muted-foreground" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
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
    </div>
  );
}
