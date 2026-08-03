"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2, Lightbulb } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { formatarMoeda, type Boleto } from "@/lib/boletos";
import {
  aVencerEmDias,
  distribuicaoPorFaixa,
  estatisticasLimite,
  evolucaoMensalPrazo,
  gerarInsights,
  participacaoPorEmpresa,
  prazoMedio,
  prazoMedioEmpresa,
  prazoMedioPorEmpresa,
  topClientes,
  valorTotal,
} from "@/lib/analytics";
import { useMounted } from "@/lib/use-mounted";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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

const CORES = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2"];

export default function DashboardPage() {
  const mounted = useMounted();
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [limite, setLimite] = useState<number>(60);
  const [carregando, setCarregando] = useState(true);

  const [empresa, setEmpresa] = useState<string>("Todas");
  const [vencIni, setVencIni] = useState("");
  const [vencFim, setVencFim] = useState("");

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

  const dados = useMemo(() => {
    return boletos.filter((b) => {
      if (empresa !== "Todas") {
        const emp = b.empresa || "Não classificado";
        if (emp !== empresa) return false;
      }
      if (vencIni && (!b.data_vencimento || b.data_vencimento < vencIni))
        return false;
      if (vencFim && (!b.data_vencimento || b.data_vencimento > vencFim))
        return false;
      return true;
    });
  }, [boletos, empresa, vencIni, vencFim]);

  const pmGeral = prazoMedio(dados);
  const pmMoveis = prazoMedioEmpresa(dados, "Ley Móveis");
  const pmColchoes = prazoMedioEmpresa(dados, "Ley Colchões");
  const total = valorTotal(dados);
  const est = estatisticasLimite(dados, limite);
  const aVencer = aVencerEmDias(dados, 7);

  const porEmpresa = useMemo(() => prazoMedioPorEmpresa(dados), [dados]);
  const participacao = useMemo(() => participacaoPorEmpresa(dados), [dados]);
  const faixas = useMemo(() => distribuicaoPorFaixa(dados), [dados]);
  const empresasPresentes = useMemo(
    () => Array.from(new Set(dados.map((b) => b.empresa || "Não classificado"))),
    [dados]
  );
  const evolucao = useMemo(
    () => evolucaoMensalPrazo(dados, empresasPresentes),
    [dados, empresasPresentes]
  );
  const top = useMemo(() => topClientes(dados, 10), [dados]);
  const insights = useMemo(() => gerarInsights(dados, limite), [dados, limite]);

  if (carregando) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Indicadores de prazo de recebimento — limite atual: {limite} dias.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <Select value={empresa} onValueChange={setEmpresa}>
              <SelectTrigger className="w-44">
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
          <div className="space-y-1.5">
            <Label>Vencimento de</Label>
            <Input
              type="date"
              className="w-40"
              value={vencIni}
              onChange={(e) => setVencIni(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>até</Label>
            <Input
              type="date"
              className="w-40"
              value={vencFim}
              onChange={(e) => setVencFim(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Metrica titulo="Prazo médio geral" valor={pmGeral != null ? `${pmGeral} dias` : "—"} />
        <Metrica titulo="Prazo médio · Ley Móveis" valor={pmMoveis != null ? `${pmMoveis} dias` : "—"} />
        <Metrica titulo="Prazo médio · Ley Colchões" valor={pmColchoes != null ? `${pmColchoes} dias` : "—"} />
        <Metrica titulo="Valor total em carteira" valor={formatarMoeda(total)} />
        <Metrica
          titulo="Acima do limite"
          valor={`${est.quantidade} (${est.percentual}%)`}
          detalhe={formatarMoeda(est.valor)}
        />
        <Metrica
          titulo="A vencer em 7 dias"
          valor={String(aVencer.quantidade)}
          detalhe={formatarMoeda(aVencer.valor)}
        />
      </div>

      {insights.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4 text-amber-500" /> Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {insights.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Grafico titulo="Prazo médio por empresa" mounted={mounted}>
          <BarChart data={porEmpresa}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="empresa" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v: number) => [`${v} dias`, "Prazo médio"]} />
            <Bar dataKey="prazoMedio" name="Prazo médio" radius={[4, 4, 0, 0]}>
              {porEmpresa.map((_, i) => (
                <Cell key={i} fill={CORES[i % CORES.length]} />
              ))}
            </Bar>
          </BarChart>
        </Grafico>

        <Grafico titulo="Participação no valor por empresa" mounted={mounted}>
          <PieChart>
            <Pie
              data={participacao}
              dataKey="valor"
              nameKey="empresa"
              innerRadius={60}
              outerRadius={95}
              paddingAngle={2}
            >
              {participacao.map((_, i) => (
                <Cell key={i} fill={CORES[i % CORES.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => formatarMoeda(v)} />
            <Legend />
          </PieChart>
        </Grafico>

        <Grafico titulo="Distribuição por faixa de prazo" mounted={mounted}>
          <BarChart data={faixas}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="faixa" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip
              formatter={(v: number, n) =>
                n === "valor" ? formatarMoeda(v) : [String(v), "Boletos"]
              }
            />
            <Bar dataKey="quantidade" name="Boletos" fill={CORES[0]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </Grafico>

        <Grafico titulo="Evolução do prazo médio (por vencimento)" mounted={mounted}>
          <LineChart data={evolucao}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            {empresasPresentes.map((emp, i) => (
              <Line
                key={emp}
                type="monotone"
                dataKey={emp}
                stroke={CORES[i % CORES.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            ))}
          </LineChart>
        </Grafico>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top clientes por valor em carteira</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <div className="h-[320px]">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="sacado"
                    width={140}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) =>
                      v.length > 20 ? `${v.slice(0, 20)}…` : v
                    }
                  />
                  <Tooltip formatter={(v: number) => formatarMoeda(v)} />
                  <Bar dataKey="valor" name="Valor" fill={CORES[1]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <PlaceholderGrafico />
            )}
          </div>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Boletos</TableHead>
                  <TableHead className="text-right">Prazo médio</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Sem dados.
                    </TableCell>
                  </TableRow>
                ) : (
                  top.map((c) => (
                    <TableRow key={c.sacado}>
                      <TableCell className="max-w-[220px] truncate" title={c.sacado}>
                        {c.sacado}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.quantidade}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.prazoMedio != null ? `${c.prazoMedio} d` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatarMoeda(c.valor)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metrica({
  titulo,
  valor,
  detalhe,
}: {
  titulo: string;
  valor: string;
  detalhe?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{titulo}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{valor}</div>
        {detalhe && (
          <div className="mt-0.5 text-sm text-muted-foreground">{detalhe}</div>
        )}
      </CardContent>
    </Card>
  );
}

function Grafico({
  titulo,
  mounted,
  children,
}: {
  titulo: string;
  mounted: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              {children as React.ReactElement}
            </ResponsiveContainer>
          ) : (
            <PlaceholderGrafico />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PlaceholderGrafico() {
  return (
    <div className="flex h-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando gráfico…
    </div>
  );
}
