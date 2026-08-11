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
import {
  AlertTriangle,
  CalendarClock,
  Gauge,
  Lightbulb,
  Wallet,
  Sofa,
  BedDouble,
  ShieldAlert,
  Ban,
} from "lucide-react";

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
  prazoMedioPonderado,
  prazoMedioPonderadoEmpresa,
  prazoMedioPorEmpresa,
  topClientes,
  valorTotal,
} from "@/lib/analytics";
import { AJUDA } from "@/lib/ajuda-textos";
import {
  LIMITES_PADRAO,
  agruparPedidos,
  indicadoresPolitica,
  lerLimites,
  type LimitesPrazo,
} from "@/lib/politica-prazo";
import { dataPorExtenso, diasAte, hojeISO } from "@/lib/tempo";
import { CHART, corEmpresa, formatarCompacto } from "@/lib/theme";
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
import { Skeleton } from "@/components/ui/skeleton";
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

export default function DashboardPage() {
  const mounted = useMounted();
  const { isDark } = useTheme();
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [limites, setLimites] = useState<LimitesPrazo>(LIMITES_PADRAO);
  const limite = limites.normal;
  const [carregando, setCarregando] = useState(true);

  const [empresa, setEmpresa] = useState<string>("Todas");
  const [vencIni, setVencIni] = useState("");
  const [vencFim, setVencFim] = useState("");

  useEffect(() => {
    Promise.all([
      supabase.from("boletos").select("*"),
      supabase
        .from("configuracoes")
        .select("*")
        .limit(1)
        .maybeSingle(),
    ]).then(([b, c]) => {
      setBoletos((b.data ?? []) as Boleto[]);
      setLimites(lerLimites(c.data));
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

  const pmGeral = prazoMedioPonderado(dados);
  const pmSimples = prazoMedio(dados);
  const pmMoveis = prazoMedioPonderadoEmpresa(dados, "Ley Móveis");
  const pmColchoes = prazoMedioPonderadoEmpresa(dados, "Ley Colchões");
  const total = valorTotal(dados);
  const est = estatisticasLimite(dados, limite);
  const aVencer = aVencerEmDias(dados, 7);

  // Contexto de tempo: o que já venceu e o que vence hoje.
  const hoje = hojeISO();
  const vencidos = useMemo(
    () =>
      dados.filter((b) => {
        const d = diasAte(b.data_vencimento, hoje);
        return d != null && d < 0;
      }),
    [dados, hoje]
  );
  const vencemHoje = useMemo(
    () => dados.filter((b) => diasAte(b.data_vencimento, hoje) === 0),
    [dados, hoje]
  );

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
  const top = useMemo(() => topClientes(dados, 8), [dados]);
  const insights = useMemo(() => gerarInsights(dados, limite), [dados, limite]);

  // Política de prazo: avaliada por PEDIDO, pelo vencimento do último boleto.
  const pedidos = useMemo(() => agruparPedidos(dados), [dados]);
  const politica = useMemo(
    () => indicadoresPolitica(pedidos, limites),
    [pedidos, limites]
  );

  const eixo = isDark ? "#94a3b8" : "#64748b";
  const grade = isDark ? "#1e293b" : "#eef2f7";
  const tip = {
    background: isDark ? "#0f172a" : "#ffffff",
    border: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
    borderRadius: 10,
    color: isDark ? "#f1f5f9" : "#0f172a",
    fontSize: 12,
    boxShadow: "0 8px 24px rgba(2,6,23,.12)",
  };

  const vazio = !carregando && dados.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Prazos concedidos nas vendas — política de ${limites.normal}/${limites.maximo} dias.`}
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
          <Label className="text-xs">Vencimento de</Label>
          <Input
            type="date"
            className="w-[9.5rem]"
            value={vencIni}
            onChange={(e) => setVencIni(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">até</Label>
          <Input
            type="date"
            className="w-[9.5rem]"
            value={vencFim}
            onChange={(e) => setVencFim(e.target.value)}
          />
        </div>
      </PageHeader>

      {carregando ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Prazo médio concedido"
            value={pmGeral != null ? `${pmGeral} dias` : "—"}
            hint={
              pmSimples != null
                ? `Ponderado pelo valor · média simples: ${pmSimples} dias`
                : "Ponderado pelo valor"
            }
            icon={Gauge}
            tom="brand"
            ajuda={AJUDA.prazoMedio}
          />
          <StatCard
            label="Prazo concedido · Ley Móveis"
            value={pmMoveis != null ? `${pmMoveis} dias` : "—"}
            icon={Sofa}
            ajuda={AJUDA.prazoMedioEmpresa}
          />
          <StatCard
            label="Prazo concedido · Ley Colchões"
            value={pmColchoes != null ? `${pmColchoes} dias` : "—"}
            icon={BedDouble}
            ajuda={AJUDA.prazoMedioEmpresa}
          />
          <StatCard
            label="Valor total em carteira"
            value={formatarMoeda(total)}
            hint={`${dados.length} boleto(s)`}
            icon={Wallet}
            tom="success"
            ajuda={AJUDA.valorCarteira}
          />
          <StatCard
            label="Acima do limite"
            value={`${est.quantidade} · ${est.percentual}%`}
            hint={formatarMoeda(est.valor)}
            icon={AlertTriangle}
            tom={est.quantidade > 0 ? "danger" : "success"}
            ajuda={AJUDA.acimaLimite}
          />
          <StatCard
            label="A vencer em 7 dias"
            value={String(aVencer.quantidade)}
            hint={`${formatarMoeda(aVencer.valor)}${
              vencemHoje.length > 0 ? ` · ${vencemHoje.length} vence(m) hoje` : ""
            }`}
            icon={CalendarClock}
            tom="warning"
            ajuda={AJUDA.aVencer7}
          />
          <StatCard
            label="Já vencidos"
            value={String(vencidos.length)}
            hint={formatarMoeda(vencidos.reduce((s, b) => s + (b.valor ?? 0), 0))}
            icon={CalendarClock}
            tom={vencidos.length > 0 ? "danger" : "success"}
            ajuda={AJUDA.vencidos}
          />
        </div>
      )}

      {!carregando && !vazio && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-1.5 text-base">
              Política de prazo
              <Ajuda titulo="Política de prazo" texto={AJUDA.politicaPrazo} />
            </CardTitle>
            <CardDescription>
              Por pedido, pelo vencimento do último boleto · normal até{" "}
              {limites.normal} dias, teto de {limites.maximo}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label={`Último venc. acima de ${limites.normal} dias`}
              value={String(politica.acimaDoNormal.quantidade)}
              hint={`${formatarMoeda(politica.acimaDoNormal.valor)} · ${
                pedidos.length
              } pedido(s) no recorte`}
              icon={AlertTriangle}
              tom={politica.acimaDoNormal.quantidade > 0 ? "warning" : "success"}
              ajuda={AJUDA.acimaLimite}
            />
            <StatCard
              label={`Exceções estratégicas (${limites.normal + 1}–${
                limites.maximo
              }d)`}
              value={String(politica.excecoes.quantidade)}
              hint={formatarMoeda(politica.excecoes.valor)}
              icon={ShieldAlert}
              tom={politica.excecoes.quantidade > 0 ? "warning" : "success"}
              ajuda={AJUDA.excecoesEstrategicas}
            />
            <StatCard
              label={`Acima de ${limites.maximo} dias`}
              value={String(politica.naoPermitidos.quantidade)}
              hint={`${formatarMoeda(politica.naoPermitidos.valor)}${
                politica.naoPermitidos.quantidade > 0 ? " · não permitido" : ""
              }`}
              icon={Ban}
              tom={politica.naoPermitidos.quantidade > 0 ? "danger" : "success"}
              ajuda={AJUDA.naoPermitidos}
            />
          </CardContent>
        </Card>
      )}

      {vazio && (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum boleto encontrado para os filtros atuais. Importe um relatório
            na aba <span className="font-medium">Importação</span>.
          </p>
        </Card>
      )}

      {!vazio && insights.length > 0 && (
        <Card className="border-brand/20 bg-brand/[0.03]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4 text-brand" /> Insights automáticos
              <Ajuda titulo="Insights" texto={AJUDA.insights} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {insights.map((t, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {!vazio && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Prazo médio concedido por empresa"
              subtitle="Dias corridos entre entrada e vencimento"
              mounted={mounted}
              ajuda={AJUDA.prazoMedioEmpresa}
            >
              <BarChart data={porEmpresa} margin={{ top: 8, right: 12, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grade} vertical={false} />
                <XAxis
                  dataKey="empresa"
                  tick={{ fontSize: 12, fill: eixo }}
                  tickLine={false}
                  axisLine={{ stroke: grade }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: eixo }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  cursor={{ fill: isDark ? "#ffffff10" : "#00000008" }}
                  contentStyle={tip}
                  formatter={(v: number) => [`${v} dias`, "Prazo concedido"]}
                />
                <Bar dataKey="prazoMedio" name="Prazo concedido" radius={[6, 6, 0, 0]} maxBarSize={90}>
                  {porEmpresa.map((d) => (
                    <Cell key={d.empresa} fill={corEmpresa(d.empresa, isDark)} />
                  ))}
                </Bar>
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Participação no valor por empresa"
              subtitle={`Total em carteira: ${formatarMoeda(total)}`}
              mounted={mounted}
              ajuda={AJUDA.participacaoEmpresa}
            >
              <PieChart>
                <Pie
                  data={participacao}
                  dataKey="valor"
                  nameKey="empresa"
                  innerRadius={62}
                  outerRadius={96}
                  paddingAngle={2}
                  stroke={isDark ? "#0b1220" : "#ffffff"}
                  strokeWidth={2}
                >
                  {participacao.map((d) => (
                    <Cell key={d.empresa} fill={corEmpresa(d.empresa, isDark)} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tip}
                  formatter={(v: number, n) => [formatarMoeda(v), n as string]}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12, color: eixo }}
                />
              </PieChart>
            </ChartCard>

            <ChartCard
              title="Distribuição por faixa de prazo"
              subtitle="Quantidade de boletos por faixa (dias)"
              mounted={mounted}
              ajuda={AJUDA.faixaPrazo}
            >
              <BarChart data={faixas} margin={{ top: 8, right: 12, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grade} vertical={false} />
                <XAxis
                  dataKey="faixa"
                  tick={{ fontSize: 12, fill: eixo }}
                  tickLine={false}
                  axisLine={{ stroke: grade }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: eixo }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={32}
                />
                <Tooltip
                  cursor={{ fill: isDark ? "#ffffff10" : "#00000008" }}
                  contentStyle={tip}
                  formatter={(v: number, _n, p) => [
                    `${v} boleto(s) · ${formatarMoeda((p?.payload?.valor as number) ?? 0)}`,
                    "Faixa",
                  ]}
                />
                <Bar
                  dataKey="quantidade"
                  name="Boletos"
                  fill={isDark ? CHART.seq.dark : CHART.seq.light}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={70}
                />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Evolução do prazo concedido"
              subtitle="Por mês de vencimento e empresa"
              mounted={mounted}
              ajuda={AJUDA.evolucaoPrazo}
            >
              <LineChart data={evolucao} margin={{ top: 8, right: 12, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grade} vertical={false} />
                <XAxis
                  dataKey="mes"
                  tick={{ fontSize: 12, fill: eixo }}
                  tickLine={false}
                  axisLine={{ stroke: grade }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: eixo }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip contentStyle={tip} />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: eixo }} />
                {empresasPresentes.map((emp) => (
                  <Line
                    key={emp}
                    type="monotone"
                    dataKey={emp}
                    stroke={corEmpresa(emp, isDark)}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ChartCard>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-base">
                Top clientes por valor em carteira
                <Ajuda titulo="Top clientes" texto={AJUDA.topClientes} />
              </CardTitle>
              <CardDescription>Maiores saldos a receber</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-2">
              <div className="h-[320px]">
                {mounted ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={top} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={grade} horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: eixo }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => formatarCompacto(v)}
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
                        formatter={(v: number) => [formatarMoeda(v), "Valor"]}
                      />
                      <Bar
                        dataKey="valor"
                        name="Valor"
                        fill={isDark ? CHART.outros.dark : CHART.outros.light}
                        radius={[0, 6, 6, 0]}
                        maxBarSize={26}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Skeleton className="h-full w-full" />
                )}
              </div>
              <div className="overflow-auto scroll-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Boletos</TableHead>
                      <TableHead className="text-right">Prazo conc.</TableHead>
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
                          <TableCell className="text-right tabular-nums">{c.quantidade}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {c.prazoMedio != null ? `${c.prazoMedio}d` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
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
        </>
      )}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  mounted,
  ajuda,
  children,
}: {
  title: string;
  subtitle?: string;
  mounted: boolean;
  ajuda?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-base">
          {title}
          {ajuda && <Ajuda titulo={title} texto={ajuda} />}
        </CardTitle>
        {subtitle && <CardDescription>{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              {children as React.ReactElement}
            </ResponsiveContainer>
          ) : (
            <Skeleton className="h-full w-full" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
