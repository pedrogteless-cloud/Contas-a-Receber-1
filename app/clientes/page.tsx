"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Search, Users, Wallet } from "lucide-react";

import { supabase } from "@/lib/supabase";
import {
  abreviarNome,
  formatarData,
  formatarMoeda,
  type Boleto,
} from "@/lib/boletos";
import {
  prazoMedio,
  prazoMedioPonderado,
  resumoClientes,
  valorTotal,
} from "@/lib/analytics";
import { AJUDA } from "@/lib/ajuda-textos";
import { CHART, corEmpresa } from "@/lib/theme";
import { useMounted } from "@/lib/use-mounted";
import { useTheme } from "@/lib/use-theme";
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

type Ordem = "valor" | "prazo" | "acima";

export default function ClientesPage() {
  const mounted = useMounted();
  const { isDark } = useTheme();
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [limite, setLimite] = useState(60);
  const [carregando, setCarregando] = useState(true);

  const [busca, setBusca] = useState("");
  const [empresa, setEmpresa] = useState<string>("Todas");
  const [ordem, setOrdem] = useState<Ordem>("valor");

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

  const filtradosBase = useMemo(
    () =>
      boletos.filter((b) => {
        if (empresa === "Todas") return true;
        return (b.empresa || "Não classificado") === empresa;
      }),
    [boletos, empresa]
  );

  const clientes = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    let r = resumoClientes(filtradosBase, limite);
    if (termo) r = r.filter((c) => c.sacado.toLowerCase().includes(termo));
    const cmp: Record<Ordem, (a: (typeof r)[0], b: (typeof r)[0]) => number> = {
      valor: (a, b) => b.valor - a.valor,
      prazo: (a, b) => (b.prazoMedio ?? -1) - (a.prazoMedio ?? -1),
      acima: (a, b) => b.percentualAcima - a.percentualAcima,
    };
    return [...r].sort(cmp[ordem]);
  }, [filtradosBase, busca, limite, ordem]);

  const totalCarteira = valorTotal(filtradosBase);
  const pmGeral = prazoMedioPonderado(filtradosBase);
  const pmSimplesGeral = prazoMedio(filtradosBase);

  // Top 12 clientes por prazo médio, para o gráfico.
  const grafico = useMemo(
    () =>
      resumoClientes(filtradosBase, limite)
        .filter((c) => c.prazoMedio != null)
        .sort((a, b) => (b.prazoMedio ?? 0) - (a.prazoMedio ?? 0))
        .slice(0, 12)
        .map((c) => ({
          sacado: c.sacado,
          prazoMedio: c.prazoMedio as number,
          empresa: c.empresas[0] ?? "Não classificado",
        })),
    [filtradosBase, limite]
  );

  const eixo = isDark ? "#94a3b8" : "#64748b";
  const grade = isDark ? "#1e293b" : "#eef2f7";
  const tip = {
    background: isDark ? "#0f172a" : "#ffffff",
    border: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
    borderRadius: 10,
    color: isDark ? "#f1f5f9" : "#0f172a",
    fontSize: 12,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description={`Prazo médio e carteira por cliente — limite atual de ${limite} dias.`}
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
          <Label className="text-xs">Ordenar por</Label>
          <Select value={ordem} onValueChange={(v) => setOrdem(v as Ordem)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="valor">Valor em carteira</SelectItem>
              <SelectItem value="prazo">Prazo médio</SelectItem>
              <SelectItem value="acima">% acima do limite</SelectItem>
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
            label="Clientes na carteira"
            value={String(clientes.length)}
            icon={Users}
            tom="brand"
            ajuda="Quantos clientes distintos têm boletos no recorte atual."
          />
          <StatCard
            label="Valor total em carteira"
            value={formatarMoeda(totalCarteira)}
            icon={Wallet}
            tom="success"
            ajuda={AJUDA.valorCarteira}
          />
          <StatCard
            label="Prazo médio (ponderado)"
            value={pmGeral != null ? `${pmGeral} dias` : "—"}
            hint={
              pmSimplesGeral != null
                ? `Média simples: ${pmSimplesGeral} dias · limite ${limite}`
                : `Limite: ${limite} dias`
            }
            icon={AlertTriangle}
            ajuda={AJUDA.prazoMedio}
          />
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Prazo médio ponderado por cliente (top 12)
          </CardTitle>
          <CardDescription>
            Barras acima da linha tracejada estão acima do limite de {limite}{" "}
            dias.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[360px]">
            {mounted && grafico.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={grafico}
                  layout="vertical"
                  margin={{ left: 8, right: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={grade} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: eixo }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${v}d`}
                  />
                  <YAxis
                    type="category"
                    dataKey="sacado"
                    width={150}
                    tick={{ fontSize: 11, fill: eixo }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: string) =>
                      v.length > 22 ? `${v.slice(0, 22)}…` : v
                    }
                  />
                  <Tooltip
                    cursor={{ fill: isDark ? "#ffffff10" : "#00000008" }}
                    contentStyle={tip}
                    formatter={(v: number) => [`${v} dias`, "Prazo médio"]}
                  />
                  <ReferenceLine x={limite} stroke={CHART.critical} strokeDasharray="4 4" />
                  <Bar dataKey="prazoMedio" name="Prazo médio" radius={[0, 6, 6, 0]} maxBarSize={22}>
                    {grafico.map((c) => (
                      <Cell
                        key={c.sacado}
                        fill={
                          c.prazoMedio > limite
                            ? CHART.critical
                            : corEmpresa(c.empresa, isDark)
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="h-full w-full" />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Todos os clientes</CardTitle>
              <CardDescription>{clientes.length} cliente(s)</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar cliente"
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
              Nenhum cliente encontrado.
            </p>
          ) : (
            <div className="overflow-x-auto scroll-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead className="text-right">Boletos</TableHead>
                    <TableHead className="text-right"><span className="inline-flex items-center gap-1">Prazo médio<Ajuda titulo="Prazo médio" texto={AJUDA.prazoMedio} /></span></TableHead>
                    <TableHead className="text-right"><span className="inline-flex items-center gap-1">Acima do limite<Ajuda titulo="Acima do limite" texto={AJUDA.acimaLimite} /></span></TableHead>
                    <TableHead className="text-right">Valor em carteira</TableHead>
                    <TableHead>Últ. vencimento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientes.map((c) => {
                    const alto = c.prazoMedio != null && c.prazoMedio > limite;
                    return (
                      <TableRow key={c.sacado}>
                        <TableCell className="max-w-[240px] truncate font-medium" title={c.sacado}>
                          {c.sacado}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {c.empresas.map((e) => (
                              <span
                                key={e}
                                className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-xs"
                                title={e}
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ background: corEmpresa(e) }}
                                />
                                {abreviarNome(e)}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.quantidade}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.prazoMedio != null ? (
                            <div className="flex flex-col items-end leading-tight">
                              <span
                                className={
                                  alto
                                    ? "font-semibold text-red-600 dark:text-red-400"
                                    : "font-medium"
                                }
                              >
                                {c.prazoMedio} dias
                              </span>
                              {c.prazoMedioSimples != null &&
                                c.prazoMedioSimples !== c.prazoMedio && (
                                  <span className="text-[10px] text-muted-foreground">
                                    simples: {c.prazoMedioSimples}d
                                  </span>
                                )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.acimaLimite > 0 ? (
                            <Badge variant="destructive">
                              {c.acimaLimite} · {c.percentualAcima}%
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatarMoeda(c.valor)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatarData(c.ultimoVencimento)}
                        </TableCell>
                      </TableRow>
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
