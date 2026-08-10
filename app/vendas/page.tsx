"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Layers, Search, Wallet } from "lucide-react";

import { supabase } from "@/lib/supabase";
import {
  documentoEParcela,
  formatarData,
  formatarMoeda,
  type Boleto,
} from "@/lib/boletos";
import { agruparVendas } from "@/lib/analytics";
import { AJUDA } from "@/lib/ajuda-textos";
import { corEmpresa } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Ajuda } from "@/components/ajuda";
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

export default function VendasPage() {
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [limite, setLimite] = useState(60);
  const [carregando, setCarregando] = useState(true);

  const [busca, setBusca] = useState("");
  const [empresa, setEmpresa] = useState<string>("Todas");
  const [soParceladas, setSoParceladas] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("boletos").select("*"),
      supabase
        .from("configuracoes")
        .select("limite_prazo_dias")
        .limit(1)
        .maybeSingle(),
    ]).then(([b, c]) => {
      setBoletos((b.data ?? []) as Boleto[]);
      if (c.data?.limite_prazo_dias != null) setLimite(c.data.limite_prazo_dias);
      setCarregando(false);
    });
  }, []);

  const vendas = useMemo(() => {
    const base = boletos.filter((b) =>
      empresa === "Todas" ? true : (b.empresa || "Não classificado") === empresa
    );
    let lista = agruparVendas(base, limite);

    const termo = busca.trim().toLowerCase();
    if (termo) {
      lista = lista.filter(
        (c) =>
          c.sacado.toLowerCase().includes(termo) ||
          c.documento.toLowerCase().includes(termo)
      );
    }
    if (soParceladas) lista = lista.filter((c) => c.parcelas > 1);
    return lista;
  }, [boletos, empresa, limite, busca, soParceladas]);

  const totalVendas = vendas.length;
  const parceladas = vendas.filter((c) => c.parcelas > 1).length;
  const valorTotal = vendas.reduce((s, c) => s + c.valorTotal, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendas a prazo"
        description="Cada linha é uma venda a prazo, com suas parcelas agrupadas."
      >
        <div className="space-y-1">
          <Label className="text-xs">Empresa</Label>
          <Select value={empresa} onValueChange={setEmpresa}>
            <SelectTrigger className="w-40">
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
        <div className="space-y-1">
          <Label className="text-xs">Mostrar</Label>
          <Select
            value={soParceladas ? "parceladas" : "todas"}
            onValueChange={(v) => setSoParceladas(v === "parceladas")}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as vendas</SelectItem>
              <SelectItem value="parceladas">Só parceladas (2x ou +)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </PageHeader>

      {carregando ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Vendas a prazo"
            value={String(totalVendas)}
            hint={`${parceladas} parcelada(s)`}
            icon={Layers}
            tom="brand"
            ajuda={AJUDA.venda}
          />
          <StatCard
            label="Valor total"
            value={formatarMoeda(valorTotal)}
            icon={Wallet}
            tom="success"
            ajuda={AJUDA.valorTotalVenda}
          />
          <StatCard
            label="Boletos agrupados"
            value={String(vendas.reduce((s, c) => s + c.parcelas, 0))}
            hint={`Limite: ${limite} dias`}
            icon={Layers}
            ajuda={AJUDA.limite}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-1.5 text-base">
                Vendas e parcelas
                <Ajuda titulo="Como agrupamos" texto={AJUDA.venda} />
              </CardTitle>
              <CardDescription>
                Clique numa linha para ver as parcelas.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Cliente ou nº do documento"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <Skeleton className="h-48 w-full" />
          ) : vendas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma venda encontrada. Importe um relatório na aba Importação.
            </p>
          ) : (
            <div className="overflow-x-auto scroll-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead className="text-center">Parcelas</TableHead>
                    <TableHead className="text-right">Valor da parcela</TableHead>
                    <TableHead className="text-right">Valor total</TableHead>
                    <TableHead>1º venc.</TableHead>
                    <TableHead>Último venc.</TableHead>
                    <TableHead className="text-right"><span className="inline-flex items-center gap-1">Prazo receb.<Ajuda titulo="Prazo de recebimento" texto={AJUDA.prazoRecebimento} /></span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendas.map((c) => {
                    const expandida = aberta === c.chave;
                    const excede = c.acimaLimite > 0;
                    return (
                      <Fragment key={c.chave}>
                        <TableRow
                          onClick={() => setAberta(expandida ? null : c.chave)}
                          className={cn(
                            "cursor-pointer",
                            excede && "bg-red-50/60 dark:bg-red-950/20"
                          )}
                        >
                          <TableCell>
                            {expandida ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell
                            className="max-w-[220px] truncate font-medium"
                            title={c.sacado}
                          >
                            {c.sacado}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5 text-sm">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ background: corEmpresa(c.empresa) }}
                              />
                              {c.empresa}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {c.documento}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={c.parcelas > 1 ? "default" : "secondary"}>
                              {c.parcelas}x
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {c.valorParcela != null
                              ? formatarMoeda(c.valorParcela)
                              : "variável"}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatarMoeda(c.valorTotal)}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {formatarData(c.primeiroVencimento)}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {formatarData(c.ultimoVencimento)}
                          </TableCell>
                          <TableCell className="text-right">
                            {c.prazoUltima != null ? (
                              <Badge
                                variant={
                                  c.prazoUltima > limite ? "destructive" : "success"
                                }
                              >
                                {c.prazoUltima}d
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        </TableRow>

                        {expandida &&
                          c.boletos.map((b) => {
                            const { parcela } = documentoEParcela(b.seu_numero);
                            const acima =
                              b.prazo_dias != null && b.prazo_dias > limite;
                            return (
                              <TableRow
                                key={b.id}
                                className="bg-muted/40 text-sm hover:bg-muted/60"
                              >
                                <TableCell></TableCell>
                                <TableCell
                                  colSpan={3}
                                  className="pl-6 text-muted-foreground"
                                >
                                  Parcela {parcela ?? "—"}
                                  {c.parcelas > 1 ? ` de ${c.parcelas}` : ""} ·
                                  nosso nº {b.nosso_numero || "—"}
                                </TableCell>
                                <TableCell className="text-center text-muted-foreground">
                                  {parcela ?? "—"}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {formatarMoeda(b.valor)}
                                </TableCell>
                                <TableCell></TableCell>
                                <TableCell className="tabular-nums text-muted-foreground">
                                  {formatarData(b.data_entrada)}
                                </TableCell>
                                <TableCell className="tabular-nums">
                                  {formatarData(b.data_vencimento)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <span
                                    className={cn(
                                      "tabular-nums",
                                      acima &&
                                        "font-semibold text-red-600 dark:text-red-400"
                                    )}
                                  >
                                    {b.prazo_dias ?? "—"}d
                                  </span>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
