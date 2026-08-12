"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Search,
  Users,
  Wallet,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { formatarData, formatarMoeda, type Boleto } from "@/lib/boletos";
import { arquivoPorCliente, separarPorVencimento } from "@/lib/arquivo";
import { resumirCondicao } from "@/lib/acordos";
import { corEmpresa } from "@/lib/theme";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Arquivo: pedidos cuja última parcela já venceu.
 *
 * Não entra em nenhum cálculo do sistema — é consulta pura, para quando
 * alguém precisar olhar o histórico de um cliente.
 */
export default function ArquivoPage() {
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("boletos")
      .select("*")
      .then(({ data }) => {
        setBoletos((data ?? []) as Boleto[]);
        setCarregando(false);
      });
  }, []);

  const { arquivados, ativos } = useMemo(
    () => separarPorVencimento(boletos),
    [boletos]
  );

  const clientes = useMemo(() => {
    const lista = arquivoPorCliente(arquivados);
    const termo = busca.trim().toLowerCase();
    if (!termo) return lista;
    return lista.filter(
      (c) =>
        c.sacado.toLowerCase().includes(termo) ||
        c.pedidos.some((p) => p.documento.toLowerCase().includes(termo))
    );
  }, [arquivados, busca]);

  const totalValor = clientes.reduce((s, c) => s + c.valorTotal, 0);
  const totalPedidos = clientes.reduce((s, c) => s + c.quantidadePedidos, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Arquivo"
        description="Pedidos já vencidos por completo — registro para consulta, fora de todos os cálculos."
      />

      <Card className="border-dashed">
        <CardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
          <Archive className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Um pedido vem para cá quando a <b>última parcela vence</b> — nunca
            antes. Enquanto tiver parcela a vencer, ele continua nas telas
            normais contando com a condição inteira, senão o prazo médio
            concedido subiria sozinho conforme as parcelas curtas fossem
            vencendo. Nada aqui entra em prazo médio, meta, política ou carteira.
          </p>
        </CardContent>
      </Card>

      {carregando ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Clientes no arquivo"
            value={String(clientes.length)}
            hint={`${totalPedidos} pedido(s)`}
            icon={Users}
            ajuda="Clientes com ao menos um pedido totalmente vencido."
          />
          <StatCard
            label="Valor arquivado"
            value={formatarMoeda(totalValor)}
            icon={Wallet}
            ajuda="Soma histórica dos pedidos arquivados. Não é dinheiro a receber — é registro."
          />
          <StatCard
            label="Ainda na rua"
            value={String(ativos.length)}
            hint="boletos ativos, nas outras telas"
            icon={Archive}
            tom="brand"
            ajuda="Quantos boletos continuam ativos e entrando nos cálculos."
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Por cliente</CardTitle>
              <CardDescription>
                Clique num cliente para ver os pedidos.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Cliente ou número do pedido"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <Skeleton className="h-48 w-full" />
          ) : clientes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {arquivados.length === 0
                ? "Nada arquivado ainda. Pedidos aparecem aqui quando a última parcela vence."
                : "Nenhum cliente encontrado para essa busca."}
            </p>
          ) : (
            <div className="overflow-x-auto scroll-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Boletos</TableHead>
                    <TableHead className="text-right">Prazo médio</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Último vencimento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientes.map((c) => {
                    const expandido = aberto === c.sacado;
                    return (
                      <Fragment key={c.sacado}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => setAberto(expandido ? null : c.sacado)}
                        >
                          <TableCell>
                            {expandido ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell
                            className="max-w-[260px] truncate font-medium"
                            title={c.sacado}
                          >
                            {c.sacado}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {c.quantidadePedidos}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {c.quantidadeBoletos}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {c.prazoMedio != null ? `${c.prazoMedio}d` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatarMoeda(c.valorTotal)}
                          </TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {formatarData(c.ultimoVencimento)}
                          </TableCell>
                        </TableRow>

                        {expandido &&
                          c.pedidos.map((p) => (
                            <TableRow
                              key={p.chave}
                              className="bg-muted/40 text-sm"
                            >
                              <TableCell></TableCell>
                              <TableCell className="pl-6 text-muted-foreground">
                                <span className="inline-flex items-center gap-1.5">
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ background: corEmpresa(p.empresa) }}
                                  />
                                  Pedido{" "}
                                  <span className="font-mono">{p.documento}</span>
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="secondary">{p.parcelas}x</Badge>
                              </TableCell>
                              <TableCell
                                className="text-right font-mono text-xs text-muted-foreground"
                                colSpan={2}
                              >
                                {resumirCondicao(p.condicao) || "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatarMoeda(p.valorTotal)}
                              </TableCell>
                              <TableCell className="tabular-nums text-muted-foreground">
                                {formatarData(p.primeiroVencimento)} →{" "}
                                {formatarData(p.ultimoVencimento)}
                              </TableCell>
                            </TableRow>
                          ))}
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
