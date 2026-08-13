"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  Layers,
  Loader2,
  Users,
  Wallet,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { formatarMoeda, type Boleto } from "@/lib/boletos";
import {
  LIMITES_PADRAO,
  agruparPedidos,
  lerLimites,
  type LimitesPrazo,
} from "@/lib/politica-prazo";
import { separarPorVencimento } from "@/lib/arquivo";
import { valorTotal } from "@/lib/analytics";
import {
  gerarRelatorioExcel,
  nomeArquivoRelatorio,
  type AbaRelatorio,
  type Agrupamento,
  type Ordenacao,
  type OpcoesRelatorio,
} from "@/lib/relatorio-excel";
import type { Acordo } from "@/lib/acordos";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Ajuda } from "@/components/ajuda";
import { FiltroEmpresa } from "@/components/filtro-empresa";
import { ChipToggle } from "@/components/chip-toggle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ABAS: { chave: AbaRelatorio; rotulo: string; descricao: string }[] = [
  { chave: "resumo", rotulo: "📊 Resumo", descricao: "KPIs da carteira, por empresa" },
  { chave: "clientes", rotulo: "👥 Clientes", descricao: "Um cliente por linha" },
  { chave: "vendas", rotulo: "🧾 DAVs", descricao: "Uma venda por linha" },
  { chave: "boletos", rotulo: "📄 Boletos", descricao: "Cada título, um a um" },
];

const AJUDA_RELATORIO =
  "Gera uma planilha .xlsx com as abas marcadas abaixo, já filtrada pelo recorte escolhido aqui em cima. Cada aba tem cabeçalho fixo com filtro (a setinha do Excel em cada coluna), e as células de status vêm coloridas. Quando agrupado, as linhas ficam com o \"+/-\" do Excel — dá pra recolher tudo e ver só os totais de cada grupo.";

export default function RelatoriosPage() {
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [acordos, setAcordos] = useState<Acordo[]>([]);
  const [limites, setLimites] = useState<LimitesPrazo>(LIMITES_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);

  const [empresa, setEmpresa] = useState<string>("Todas");
  const [vencIni, setVencIni] = useState("");
  const [vencFim, setVencFim] = useState("");
  const [abas, setAbas] = useState<Record<AbaRelatorio, boolean>>({
    resumo: true,
    clientes: true,
    vendas: true,
    boletos: true,
  });
  const [agrupar, setAgrupar] = useState<Agrupamento>("cliente");
  const [ordenar, setOrdenar] = useState<Ordenacao>("valor");

  useEffect(() => {
    Promise.all([
      supabase.from("boletos").select("*"),
      supabase.from("configuracoes").select("*").limit(1).maybeSingle(),
      supabase.from("acordos_prazo").select("*"),
    ]).then(([b, c, a]) => {
      setBoletos(separarPorVencimento((b.data ?? []) as Boleto[]).ativos);
      setLimites(lerLimites(c.data));
      setAcordos((a.data ?? []) as Acordo[]);
      setCarregando(false);
    });
  }, []);

  const dados = useMemo(() => {
    return boletos.filter((b) => {
      if (empresa !== "Todas" && (b.empresa || "Não classificado") !== empresa)
        return false;
      if (vencIni && (!b.data_vencimento || b.data_vencimento < vencIni))
        return false;
      if (vencFim && (!b.data_vencimento || b.data_vencimento > vencFim))
        return false;
      return true;
    });
  }, [boletos, empresa, vencIni, vencFim]);

  const pedidos = useMemo(() => agruparPedidos(dados), [dados]);
  const clientes = useMemo(
    () => new Set(dados.map((b) => b.sacado || "—")).size,
    [dados]
  );
  const total = valorTotal(dados);

  const nenhumaAba = !Object.values(abas).some(Boolean);

  function alternarAba(aba: AbaRelatorio) {
    setAbas((prev) => ({ ...prev, [aba]: !prev[aba] }));
  }

  function descreverFiltro(): string {
    const partes: string[] = [];
    partes.push(empresa === "Todas" ? "Todas as empresas" : empresa);
    if (vencIni || vencFim) {
      partes.push(
        `vencimento ${vencIni ? `de ${vencIni.split("-").reverse().join("/")}` : ""}${
          vencFim ? ` até ${vencFim.split("-").reverse().join("/")}` : ""
        }`.trim()
      );
    }
    return partes.join(" · ");
  }

  async function baixar() {
    setGerando(true);
    try {
      const opcoes: OpcoesRelatorio = {
        abas,
        agrupar,
        ordenar,
        filtroDescricao: descreverFiltro(),
      };
      const buffer = await gerarRelatorioExcel(dados, limites, acordos, opcoes);
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeArquivoRelatorio();
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description="Monte a planilha do jeito que você quer: escolha o recorte, as abas e como agrupar."
      >
        <div className="space-y-1">
          <Label className="text-xs">Empresa</Label>
          <FiltroEmpresa valor={empresa} onChange={setEmpresa} />
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
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="DAVs no recorte"
            value={String(pedidos.length)}
            hint={`${dados.length} boleto(s)`}
            icon={Layers}
            tom="brand"
            ajuda="Quantas vendas (DAVs) entram no relatório com os filtros de cima."
          />
          <StatCard
            label="Clientes no recorte"
            value={String(clientes)}
            icon={Users}
            ajuda="Clientes distintos que aparecem no recorte atual."
          />
          <StatCard
            label="Valor total"
            value={formatarMoeda(total)}
            icon={Wallet}
            tom="success"
            ajuda="Soma dos boletos que entram no relatório."
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-base">
            <FileSpreadsheet className="h-4 w-4" />
            Montar planilha
            <Ajuda titulo="Como funciona" texto={AJUDA_RELATORIO} />
          </CardTitle>
          <CardDescription>
            Marque as abas, escolha o agrupamento e baixe. Tudo roda aqui no
            navegador — nada fica salvo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs">Abas da planilha</Label>
            <div className="flex flex-wrap gap-2">
              {ABAS.map((a) => (
                <ChipToggle
                  key={a.chave}
                  ativo={abas[a.chave]}
                  onClick={() => alternarAba(a.chave)}
                  tom="brand"
                >
                  {a.rotulo}
                </ChipToggle>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {ABAS.filter((a) => abas[a.chave]).map((a) => a.descricao).join(" · ") ||
                "Nenhuma aba selecionada."}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Agrupar Clientes / DAVs / Boletos por
              </Label>
              <Select value={agrupar} onValueChange={(v) => setAgrupar(v as Agrupamento)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Sem agrupar</SelectItem>
                  <SelectItem value="cliente">Cliente</SelectItem>
                  <SelectItem value="empresa">Empresa</SelectItem>
                  <SelectItem value="status">Status (dentro/fora do padrão)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ordenar por</Label>
              <Select value={ordenar} onValueChange={(v) => setOrdenar(v as Ordenacao)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="valor">Valor (maior primeiro)</SelectItem>
                  <SelectItem value="prazo">Prazo (maior primeiro)</SelectItem>
                  <SelectItem value="nome">Cliente (A-Z)</SelectItem>
                  <SelectItem value="vencimento">Vencimento (mais recente primeiro)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {agrupar !== "nenhum" && (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Cada grupo vira uma seção com o "+/-" do Excel: clique para recolher
              e ver só os totais, ou expandir e ver as linhas de dentro.
            </p>
          )}

          <Button
            size="lg"
            className="w-full sm:w-auto"
            disabled={nenhumaAba || carregando || gerando || dados.length === 0}
            onClick={baixar}
          >
            {gerando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {gerando ? "Gerando..." : "Baixar relatório (.xlsx)"}
          </Button>
          {dados.length === 0 && !carregando && (
            <p className="text-xs text-muted-foreground">
              Nenhum boleto no recorte atual — ajuste os filtros em cima.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
