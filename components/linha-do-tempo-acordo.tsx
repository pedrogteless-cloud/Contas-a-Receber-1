"use client";

import { ArrowRight, Handshake, TrendingDown } from "lucide-react";

import {
  linhaDoTempo,
  resultadoAcordo,
  type AcordoHistorico,
} from "@/lib/acordos";
import type { LimitesPrazo } from "@/lib/politica-prazo";
import { formatarData } from "@/lib/boletos";
import { cn } from "@/lib/utils";

/**
 * A linha do tempo do prazo de um cliente: de onde ele partiu e onde parou
 * depois de cada conversa.
 *
 * Lê-se da esquerda para a direita, como o tempo anda. O primeiro nó é o
 * retrato de antes de qualquer acordo; cada nó seguinte é uma renegociação,
 * com a diferença em dias no fio que os liga.
 */
export function LinhaDoTempoAcordo({
  historico,
  limites,
  className,
}: {
  historico: AcordoHistorico[];
  limites: LimitesPrazo;
  className?: string;
}) {
  const pontos = linhaDoTempo(historico);
  const resultado = resultadoAcordo(historico, limites);
  const teto = limites.normal + limites.tolerancia;

  if (pontos.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        Nenhum acordo registrado para este cliente ainda.
      </p>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {resultado && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
            <Handshake className="h-3.5 w-3.5" />
            {resultado.rodadas} acordo{resultado.rodadas > 1 ? "s" : ""}
          </span>
          {resultado.reducaoDias != null && resultado.reducaoDias > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <TrendingDown className="h-3.5 w-3.5" />
              −{resultado.reducaoDias} dias
              {resultado.reducaoPercentual != null &&
                ` (${resultado.reducaoPercentual}%)`}
            </span>
          )}
          {resultado.entrouNoPadrao && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white"
              title={`Estava em ${resultado.prazoInicial}d, acima do teto de ${teto}d; hoje está em ${resultado.prazoAtual}d.`}
            >
              ✅ O acordo trouxe para dentro do padrão
            </span>
          )}
        </div>
      )}

      <ol className="flex flex-wrap items-stretch gap-0">
        {pontos.map((p, i) => {
          const dentro = typeof p.prazo === "number" && p.prazo <= teto;
          const inicial = i === 0;
          const ultimo = i === pontos.length - 1;
          return (
            <li key={`${p.rotulo}-${i}`} className="flex items-stretch">
              {i > 0 && (
                <div className="flex flex-col items-center justify-center px-2">
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  {p.variacao != null && p.variacao !== 0 && (
                    <span
                      className={cn(
                        "mt-0.5 rounded px-1 text-[10px] font-semibold tabular-nums",
                        p.variacao < 0
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-red-500/15 text-red-700 dark:text-red-400"
                      )}
                    >
                      {p.variacao > 0 ? "+" : ""}
                      {p.variacao}d
                    </span>
                  )}
                </div>
              )}

              <div
                className={cn(
                  "min-w-[9.5rem] rounded-lg border px-3 py-2",
                  ultimo && !inicial
                    ? "border-brand/40 bg-brand/[0.06] shadow-sm"
                    : "border-border bg-card",
                  inicial && "border-dashed opacity-90"
                )}
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {p.rotulo}
                </p>
                <p
                  className={cn(
                    "mt-0.5 font-mono text-sm font-semibold",
                    inicial && "text-muted-foreground line-through"
                  )}
                >
                  {p.condicao ?? (p.prazo != null ? `${p.prazo}d` : "—")}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                      p.prazo == null
                        ? "bg-muted-foreground"
                        : dentro
                          ? "bg-emerald-500"
                          : "bg-red-500"
                    )}
                  />
                  <span className="tabular-nums text-muted-foreground">
                    {p.prazo != null ? `${p.prazo} dias` : "sem prazo"}
                  </span>
                </p>
                {p.data && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {formatarData(p.data.slice(0, 10))}
                    {p.registrado_por ? ` · ${p.registrado_por}` : ""}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
