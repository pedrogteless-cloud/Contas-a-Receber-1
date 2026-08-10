"use client";

import { formatarData } from "@/lib/boletos";
import { descreverPrazo, situacaoVencimento, type Situacao } from "@/lib/tempo";
import { cn } from "@/lib/utils";

const TOM: Record<Situacao, string> = {
  vencido: "text-red-600 dark:text-red-400",
  hoje: "text-amber-600 dark:text-amber-400 font-semibold",
  proximo: "text-amber-600 dark:text-amber-400",
  futuro: "text-muted-foreground",
};

/**
 * Data com o contexto de tempo embaixo: "10/09/2026" + "em 31 dias".
 * Vencido aparece em vermelho; vencendo hoje ou nos próximos 7 dias, em âmbar.
 */
export function DataRelativa({
  iso,
  className,
}: {
  iso: string | null | undefined;
  className?: string;
}) {
  if (!iso) return <span className="text-muted-foreground">—</span>;

  const situacao = situacaoVencimento(iso);
  const relativo = descreverPrazo(iso);

  return (
    <span className={cn("flex flex-col leading-tight", className)}>
      <span className="tabular-nums">{formatarData(iso)}</span>
      {relativo && (
        <span className={cn("text-[10px]", situacao ? TOM[situacao] : "")}>
          {situacao === "vencido" ? `venceu ${relativo}` : relativo}
        </span>
      )}
    </span>
  );
}
