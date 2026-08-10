"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  Download,
  FileStack,
  Gauge,
  Loader2,
  Search,
  Send,
  Wallet,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import {
  abreviarNome,
  formatarData,
  formatarMoeda,
  type Boleto,
} from "@/lib/boletos";
import { prazoMedio } from "@/lib/analytics";
import { AJUDA } from "@/lib/ajuda-textos";
import { descreverPrazo, hojeISO, situacaoVencimento } from "@/lib/tempo";
import { corEmpresa } from "@/lib/theme";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Ajuda, ComAjuda } from "@/components/ajuda";
import { DataRelativa } from "@/components/data-relativa";
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
import { Skeleton } from "@/components/ui/skeleton";
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

const OPCOES_EMPRESA = [
  "Todas",
  "Ley Móveis",
  "Ley Colchões",
  "Não classificado",
] as const;

export default function HistoricoPage() {
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [empresa, setEmpresa] = useState<string>("Todas");
  const [impIni, setImpIni] = useState("");
  const [impFim, setImpFim] = useState("");
  const [vencIni, setVencIni] = useState("");
  const [vencFim, setVencFim] = useState("");

  async function carregar() {
    setCarregando(true);
    const { data } = await supabase
      .from("boletos")
      .select("*")
      .order("created_at", { ascending: false });
    setBoletos((data ?? []) as Boleto[]);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return boletos.filter((b) => {
      if (termo && !(b.sacado ?? "").toLowerCase().includes(termo)) return false;
      if (empresa !== "Todas") {
        const emp = b.empresa || "Não classificado";
        if (emp !== empresa) return false;
      }
      if (impIni && (!b.data_importacao || b.data_importacao < impIni)) return false;
      if (impFim && (!b.data_importacao || b.data_importacao > impFim)) return false;
      if (vencIni && (!b.data_vencimento || b.data_vencimento < vencIni)) return false;
      if (vencFim && (!b.data_vencimento || b.data_vencimento > vencFim)) return false;
      return true;
    });
  }, [boletos, busca, empresa, impIni, impFim, vencIni, vencFim]);

  const excedidos = useMemo(() => filtrados.filter((b) => b.excedeu_limite), [filtrados]);
  const pm = prazoMedio(filtrados);
  const valorExcedido = excedidos.reduce((s, b) => s + (b.valor ?? 0), 0);
  const pendentes = excedidos.filter((b) => !b.alerta_enviado).length;

  const resumoImportacoes = useMemo(() => {
    const mapa = new Map<
      string,
      { quantidade: number; valor: number; excedidos: number }
    >();
    for (const b of filtrados) {
      const chave = b.data_importacao || "—";
      const cur = mapa.get(chave) ?? { quantidade: 0, valor: 0, excedidos: 0 };
      cur.quantidade++;
      cur.valor += b.valor ?? 0;
      if (b.excedeu_limite) cur.excedidos++;
      mapa.set(chave, cur);
    }
    return Array.from(mapa.entries())
      .map(([data, v]) => ({ data, ...v }))
      .sort((a, b) => (a.data < b.data ? 1 : -1));
  }, [filtrados]);

  async function enviarPendentes() {
    setEnviando(true);
    setAviso(null);
    try {
      const resp = await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const r = (await resp.json()) as {
        enviados: number;
        pendentes: number;
        motivo: string;
      };
      if (r.motivo === "ok")
        setAviso(`${r.enviados} alerta(s) enviado(s). ${r.pendentes} pendente(s).`);
      else if (r.motivo === "sem_token")
        setAviso("Telegram sem token configurado — nada enviado.");
      else if (r.motivo === "sem_destinatarios")
        setAviso("Nenhum destinatário cadastrado em Configurações.");
      await carregar();
    } catch (err) {
      console.error(err);
      setAviso("Erro ao enviar alertas.");
    } finally {
      setEnviando(false);
    }
  }

  function exportarExcel() {
    const linhas = filtrados.map((b) => ({
      Empresa: b.empresa || "",
      Sacado: b.sacado || "",
      "Nosso número": b.nosso_numero || "",
      "Seu número": b.seu_numero || "",
      Entrada: formatarData(b.data_entrada),
      Vencimento: formatarData(b.data_vencimento),
      "Prazo parcela (dias)": b.prazo_dias ?? "",
      "Prazo recebimento (dias)": b.prazo_recebimento ?? "",
      Documento: b.documento ?? "",
      Parcela: b.parcela ?? "",
      "Total parcelas": b.total_parcelas ?? "",
      Valor: b.valor ?? 0,
      "Acima do limite": b.excedeu_limite ? "Sim" : "Não",
      Alerta: b.alerta_enviado
        ? "Enviado"
        : b.excedeu_limite
          ? "Pendente"
          : "",
      "Data importação": formatarData(b.data_importacao),
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    ws["!cols"] = [
      { wch: 14 }, { wch: 34 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
      { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 9 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Boletos");
    const hoje = hojeISO();
    XLSX.writeFile(wb, `contas-a-receber-${hoje}.xlsx`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Histórico"
        description="Consulte importações e boletos acima do limite de prazo."
      >
        <ComAjuda titulo="Exportar Excel" texto={AJUDA.exportarExcel}>
          <Button
            variant="outline"
            onClick={exportarExcel}
            disabled={filtrados.length === 0}
          >
            <Download /> Exportar Excel
          </Button>
        </ComAjuda>
      </PageHeader>

      {carregando ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total de boletos" value={String(filtrados.length)} icon={FileStack} tom="brand" ajuda="Quantidade de boletos que passam pelos filtros atuais." />
          <StatCard
            label="Prazo médio de recebimento"
            value={pm != null ? `${pm} dias` : "—"}
            icon={Gauge}
            ajuda={AJUDA.prazoMedio}
          />
          <StatCard
            label="Excederam o limite"
            value={String(excedidos.length)}
            hint={`${pendentes} alerta(s) pendente(s)`}
            icon={AlertTriangle}
            tom={excedidos.length > 0 ? "danger" : "success"}
            ajuda={AJUDA.acimaLimite}
          />
          <StatCard label="Valor que excedeu" value={formatarMoeda(valorExcedido)} icon={Wallet} tom="warning" ajuda="Soma do valor dos boletos que passaram do limite de prazo." />
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Buscar sacado</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Nome do sacado"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <Select value={empresa} onValueChange={setEmpresa}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPCOES_EMPRESA.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Importação de</Label>
              <Input type="date" value={impIni} onChange={(e) => setImpIni(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>até</Label>
              <Input type="date" value={impFim} onChange={(e) => setImpFim(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Vencimento de</Label>
              <Input type="date" value={vencIni} onChange={(e) => setVencIni(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>até</Label>
              <Input type="date" value={vencFim} onChange={(e) => setVencFim(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Importações por data</CardTitle>
          <CardDescription>Resumo de cada data de importação (após filtros).</CardDescription>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <Skeleton className="h-24 w-full" />
          ) : resumoImportacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados.</p>
          ) : (
            <div className="overflow-x-auto scroll-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Boletos</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Acima do limite</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resumoImportacoes.map((r) => (
                    <TableRow key={r.data}>
                      <TableCell className="font-medium">{formatarData(r.data)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.quantidade}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(r.valor)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.excedidos > 0 ? (
                          <span className="text-red-600 dark:text-red-400">{r.excedidos}</span>
                        ) : (
                          r.excedidos
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Boletos acima do limite</CardTitle>
              <CardDescription>
                {excedidos.length} boleto(s) · {pendentes} alerta(s) pendente(s)
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {aviso && <span className="text-sm text-muted-foreground">{aviso}</span>}
              <ComAjuda titulo="Enviar alertas" texto={AJUDA.enviarAlertas}>
                <Button onClick={enviarPendentes} disabled={enviando || pendentes === 0}>
                  {enviando ? <Loader2 className="animate-spin" /> : <Send />}
                  Enviar alertas pendentes
                </Button>
              </ComAjuda>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <Skeleton className="h-40 w-full" />
          ) : excedidos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum boleto acima do limite nos filtros atuais.
            </p>
          ) : (
            <div className="overflow-x-auto scroll-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Sacado</TableHead>
                    <TableHead>Nosso nº</TableHead>
                    <TableHead>Entrada</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-center"><span className="inline-flex items-center gap-1">Prazo<Ajuda titulo="Prazo da parcela" texto={AJUDA.prazoDias} /></span></TableHead>
                    <TableHead className="text-center"><span className="inline-flex items-center gap-1">Recebimento<Ajuda titulo="Prazo de recebimento" texto={AJUDA.prazoRecebimento} /></span></TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead><span className="inline-flex items-center gap-1">Alerta<Ajuda titulo="Alerta" texto={AJUDA.alertaStatus} /></span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {excedidos.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: corEmpresa(b.empresa) }}
                          />
                          {b.empresa || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className="inline-flex max-w-[150px] truncate rounded-full bg-secondary px-2 py-0.5 text-xs"
                          title={b.sacado}
                        >
                          {abreviarNome(b.sacado)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate" title={b.sacado}>
                        {b.sacado}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{b.nosso_numero || "—"}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatarData(b.data_entrada)}
                      </TableCell>
                      <TableCell>
                        <DataRelativa iso={b.data_vencimento} />
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-muted-foreground">
                        {b.prazo_dias ?? "—"}d
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="destructive">
                          {b.prazo_recebimento ?? b.prazo_dias ?? "—"}d
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatarMoeda(b.valor)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={b.alerta_enviado ? "success" : "warning"}>
                          {b.alerta_enviado ? "Enviado" : "Pendente"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
