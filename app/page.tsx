"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import {
  EMPRESAS,
  abreviarNome,
  calcularPrazoDias,
  extrairDeMatriz,
  extrairDeTexto,
  formatarMoeda,
  type LinhaImportada,
} from "@/lib/boletos";
import { corEmpresa } from "@/lib/theme";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LinhaEditavel extends LinhaImportada {
  _id: string;
}

let uidSeq = 0;
const novoId = () => `l${Date.now()}_${uidSeq++}`;

type Aviso = { tipo: "ok" | "erro" | "info"; texto: string } | null;

export default function ImportacaoPage() {
  const [empresaPadrao, setEmpresaPadrao] = useState<string>(EMPRESAS[0]);
  const [linhas, setLinhas] = useState<LinhaEditavel[]>([]);
  const [limite, setLimite] = useState<number>(60);
  const [processando, setProcessando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string>("");
  const [arrastando, setArrastando] = useState(false);
  const [lendoIA, setLendoIA] = useState(false);
  const [arrastandoIA, setArrastandoIA] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const iaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase
      .from("configuracoes")
      .select("limite_prazo_dias")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.limite_prazo_dias != null) setLimite(data.limite_prazo_dias);
      });
  }, []);

  async function processarArquivo(file: File) {
    setProcessando(true);
    setAviso(null);
    setNomeArquivo(file.name);
    try {
      const nome = file.name.toLowerCase();
      let extraidas: LinhaImportada[] = [];

      if (nome.endsWith(".xlsx") || nome.endsWith(".xls")) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const matriz = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          raw: true,
          defval: "",
        });
        extraidas = extrairDeMatriz(matriz, empresaPadrao);
      } else if (nome.endsWith(".pdf")) {
        const base64 = await lerComoBase64(file);
        const resp = await fetch("/api/parse-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdf: base64 }),
        });
        if (!resp.ok) throw new Error("Falha ao ler o PDF no servidor.");
        const { texto } = (await resp.json()) as { texto: string };
        extraidas = extrairDeTexto(texto, empresaPadrao);
      } else {
        setAviso({ tipo: "erro", texto: "Formato não suportado. Use .xlsx ou .pdf." });
        return;
      }

      const editaveis = extraidas.map((l) => ({ ...l, _id: novoId() }));
      setLinhas(editaveis);

      if (editaveis.length === 0) {
        setAviso({
          tipo: "info",
          texto:
            "Nenhuma linha reconhecida automaticamente. Confira o arquivo ou adicione as linhas manualmente.",
        });
      } else {
        setAviso({
          tipo: "ok",
          texto: `${editaveis.length} linha(s) extraída(s). Confira e ajuste antes de importar.`,
        });
      }
    } catch (err) {
      console.error(err);
      setAviso({ tipo: "erro", texto: "Erro ao processar o arquivo." });
    } finally {
      setProcessando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function lerComIA(files: FileList) {
    setLendoIA(true);
    setAviso(null);
    try {
      const arquivos = [];
      for (const f of Array.from(files)) {
        const nome = f.name.toLowerCase();
        const data = await lerComoBase64(f);
        if (nome.endsWith(".pdf")) {
          arquivos.push({ tipo: "pdf", media_type: "application/pdf", data });
        } else {
          const media_type =
            f.type ||
            (nome.endsWith(".png")
              ? "image/png"
              : nome.endsWith(".webp")
                ? "image/webp"
                : "image/jpeg");
          arquivos.push({ tipo: "image", media_type, data });
        }
      }

      const resp = await fetch("/api/ler-documento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arquivos }),
      });
      const r = (await resp.json()) as {
        linhas: LinhaImportada[];
        motivo: string;
      };

      if (r.motivo === "sem_chave") {
        setAviso({
          tipo: "erro",
          texto:
            "Leitor por IA ainda não configurado — falta a ANTHROPIC_API_KEY (adicione na Vercel).",
        });
        return;
      }
      if (r.motivo !== "ok") {
        setAviso({ tipo: "erro", texto: "Não foi possível ler o documento." });
        return;
      }

      const editaveis: LinhaEditavel[] = (r.linhas ?? []).map((l) => ({
        ...l,
        _id: novoId(),
        empresa: empresaPadrao,
        prazo_dias: calcularPrazoDias(l.data_entrada, l.data_vencimento),
      }));
      setLinhas(editaveis);
      setAviso(
        editaveis.length > 0
          ? {
              tipo: "ok",
              texto: `${editaveis.length} linha(s) lida(s) pela IA. Confira e ajuste antes de importar.`,
            }
          : {
              tipo: "info",
              texto:
                "A IA não encontrou duplicatas no documento. Adicione manualmente se necessário.",
            }
      );
    } catch (err) {
      console.error(err);
      setAviso({ tipo: "erro", texto: "Erro ao ler o documento com IA." });
    } finally {
      setLendoIA(false);
      if (iaRef.current) iaRef.current.value = "";
    }
  }

  function atualizarLinha(id: string, patch: Partial<LinhaImportada>) {
    setLinhas((prev) =>
      prev.map((l) => {
        if (l._id !== id) return l;
        const atual = { ...l, ...patch };
        atual.prazo_dias = calcularPrazoDias(
          atual.data_entrada,
          atual.data_vencimento
        );
        return atual;
      })
    );
  }

  function removerLinha(id: string) {
    setLinhas((prev) => prev.filter((l) => l._id !== id));
  }

  function adicionarLinha() {
    setLinhas((prev) => [
      ...prev,
      {
        _id: novoId(),
        empresa: empresaPadrao,
        sacado: "",
        nosso_numero: "",
        seu_numero: "",
        data_entrada: null,
        data_vencimento: null,
        valor: 0,
        prazo_dias: null,
      },
    ]);
  }

  async function confirmarImportacao() {
    if (linhas.length === 0) {
      setAviso({ tipo: "erro", texto: "Nenhuma linha para importar." });
      return;
    }
    if (linhas.some((l) => !l.empresa)) {
      setAviso({ tipo: "erro", texto: "Defina a empresa em todas as linhas." });
      return;
    }
    if (linhas.some((l) => !l.data_entrada || !l.data_vencimento)) {
      setAviso({
        tipo: "erro",
        texto: "Preencha entrada e vencimento em todas as linhas.",
      });
      return;
    }

    setSalvando(true);
    setAviso(null);
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      const registros = linhas.map((l) => {
        const prazo = calcularPrazoDias(l.data_entrada, l.data_vencimento);
        return {
          data_importacao: hoje,
          empresa: l.empresa,
          sacado: l.sacado,
          nosso_numero: l.nosso_numero || null,
          seu_numero: l.seu_numero || null,
          data_entrada: l.data_entrada,
          data_vencimento: l.data_vencimento,
          valor: l.valor,
          prazo_dias: prazo,
          excedeu_limite: prazo != null && prazo > limite,
          alerta_enviado: false,
        };
      });

      const { data, error } = await supabase
        .from("boletos")
        .insert(registros)
        .select("id, excedeu_limite");
      if (error) throw error;

      const idsExcedidos = (data ?? [])
        .filter((r) => r.excedeu_limite)
        .map((r) => r.id);

      let msgTelegram = "";
      if (idsExcedidos.length > 0) {
        try {
          const resp = await fetch("/api/telegram", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: idsExcedidos }),
          });
          const r = (await resp.json()) as {
            enviados: number;
            pendentes: number;
            motivo: string;
          };
          if (r.motivo === "ok") msgTelegram = ` ${r.enviados} alerta(s) enviado(s) no Telegram.`;
          else if (r.motivo === "sem_token")
            msgTelegram = " (Telegram sem token — alertas pendentes.)";
          else if (r.motivo === "sem_destinatarios")
            msgTelegram = " (Sem destinatários no Telegram — cadastre em Configurações.)";
        } catch {
          msgTelegram = " (Falha ao disparar alertas do Telegram.)";
        }
      }

      setLinhas([]);
      setNomeArquivo("");
      setAviso({
        tipo: "ok",
        texto: `${registros.length} boleto(s) importado(s). ${idsExcedidos.length} acima do limite.${msgTelegram}`,
      });
    } catch (err) {
      console.error(err);
      setAviso({ tipo: "erro", texto: "Erro ao salvar os boletos." });
    } finally {
      setSalvando(false);
    }
  }

  const totalValor = useMemo(
    () => linhas.reduce((s, l) => s + (l.valor || 0), 0),
    [linhas]
  );
  const totalExcedidos = useMemo(
    () => linhas.filter((l) => l.prazo_dias != null && l.prazo_dias > limite).length,
    [linhas, limite]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importação"
        description="Importe o relatório do Sicoob (.xlsx ou .pdf), confira as linhas e confirme para registrar os boletos."
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Empresa</CardTitle>
            <CardDescription>Aplicada às linhas importadas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {EMPRESAS.map((e) => {
              const ativo = empresaPadrao === e;
              return (
                <button
                  key={e}
                  onClick={() => setEmpresaPadrao(e)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors",
                    ativo
                      ? "border-primary/40 bg-primary/5"
                      : "border-border hover:bg-accent"
                  )}
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: corEmpresa(e) }}
                  />
                  {e}
                  {ativo && <CheckCircle2 className="ml-auto h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Relatório Sicoob</CardTitle>
            <CardDescription>Arraste o arquivo ou clique para selecionar (.xlsx ou .pdf).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) processarArquivo(f);
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setArrastando(true);
              }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastando(false);
                const f = e.dataTransfer.files?.[0];
                if (f) processarArquivo(f);
              }}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                arrastando
                  ? "border-brand bg-brand/5"
                  : "border-border hover:border-brand/50 hover:bg-accent/50"
              )}
            >
              {processando ? (
                <Loader2 className="h-8 w-8 animate-spin text-brand" />
              ) : (
                <UploadCloud className="h-8 w-8 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                {processando ? "Processando…" : "Solte o arquivo aqui ou clique"}
              </span>
              {nomeArquivo && !processando && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> {nomeArquivo}
                </span>
              )}
            </button>

            {aviso && (
              <div
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm",
                  aviso.tipo === "ok" &&
                    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
                  aviso.tipo === "erro" &&
                    "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
                  aviso.tipo === "info" &&
                    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                )}
              >
                {aviso.texto}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-brand/25 bg-brand/[0.03]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-brand" /> Leitor por IA — nota ou
            duplicata
          </CardTitle>
          <CardDescription>
            Mande a foto ou o PDF de uma nota/duplicata (não precisa de padrão).
            A IA lê e preenche a conferência com as parcelas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            ref={iaRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) lerComIA(e.target.files);
            }}
          />
          <button
            type="button"
            onClick={() => iaRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastandoIA(true);
            }}
            onDragLeave={() => setArrastandoIA(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastandoIA(false);
              if (e.dataTransfer.files?.length) lerComIA(e.dataTransfer.files);
            }}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
              arrastandoIA
                ? "border-brand bg-brand/10"
                : "border-brand/40 hover:border-brand hover:bg-brand/5"
            )}
          >
            {lendoIA ? (
              <Loader2 className="h-7 w-7 animate-spin text-brand" />
            ) : (
              <Sparkles className="h-7 w-7 text-brand" />
            )}
            <span className="text-sm font-medium">
              {lendoIA
                ? "Lendo o documento…"
                : "Solte a foto/PDF aqui ou clique para ler com IA"}
            </span>
            <span className="text-xs text-muted-foreground">
              Aceita JPG, PNG e PDF · pode enviar vários
            </span>
          </button>
        </CardContent>
      </Card>

      {linhas.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Conferência</CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{linhas.length} linha(s)</span>
                  <span className="text-border">•</span>
                  <span className="font-medium text-foreground">{formatarMoeda(totalValor)}</span>
                  <span className="text-border">•</span>
                  <span className={totalExcedidos > 0 ? "text-red-600 dark:text-red-400" : ""}>
                    {totalExcedidos} acima do limite ({limite} dias)
                  </span>
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={adicionarLinha}>
                  <Plus /> Adicionar
                </Button>
                <Button onClick={confirmarImportacao} disabled={salvando}>
                  {salvando ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                  Confirmar importação
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto scroll-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[150px]">Empresa</TableHead>
                    <TableHead className="min-w-[200px]">Sacado</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Nosso nº</TableHead>
                    <TableHead>Seu nº</TableHead>
                    <TableHead>Entrada</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-center">Prazo</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => {
                    const excede = l.prazo_dias != null && l.prazo_dias > limite;
                    const dentro = l.prazo_dias != null && l.prazo_dias <= limite;
                    return (
                      <TableRow
                        key={l._id}
                        className={cn(
                          excede && "bg-red-50/70 hover:bg-red-100/60 dark:bg-red-950/20",
                          dentro && "bg-emerald-50/60 hover:bg-emerald-100/50 dark:bg-emerald-950/15"
                        )}
                      >
                        <TableCell>
                          <Select
                            value={l.empresa || undefined}
                            onValueChange={(v) => atualizarLinha(l._id, { empresa: v })}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {EMPRESAS.map((e) => (
                                <SelectItem key={e} value={e}>
                                  {e}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 min-w-[180px]"
                            value={l.sacado}
                            onChange={(e) => atualizarLinha(l._id, { sacado: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <span
                            className="inline-flex max-w-[150px] items-center gap-1.5 truncate rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                            title={l.sacado}
                          >
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: corEmpresa(l.empresa) }}
                            />
                            {abreviarNome(l.sacado)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 w-28 font-mono text-xs"
                            value={l.nosso_numero}
                            onChange={(e) => atualizarLinha(l._id, { nosso_numero: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 w-28 font-mono text-xs"
                            value={l.seu_numero}
                            onChange={(e) => atualizarLinha(l._id, { seu_numero: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            className="h-8 w-[8.5rem]"
                            value={l.data_entrada ?? ""}
                            onChange={(e) =>
                              atualizarLinha(l._id, { data_entrada: e.target.value || null })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            className="h-8 w-[8.5rem]"
                            value={l.data_vencimento ?? ""}
                            onChange={(e) =>
                              atualizarLinha(l._id, { data_vencimento: e.target.value || null })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8 w-28 text-right tabular-nums"
                            value={Number.isFinite(l.valor) ? l.valor : 0}
                            onChange={(e) =>
                              atualizarLinha(l._id, { valor: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          {l.prazo_dias == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Badge variant={excede ? "destructive" : "success"}>
                              {l.prazo_dias}d
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removerLinha(l._id)}
                            aria-label="Remover linha"
                          >
                            <Trash2 className="text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function lerComoBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const idx = result.indexOf("base64,");
      resolve(idx >= 0 ? result.slice(idx + 7) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
