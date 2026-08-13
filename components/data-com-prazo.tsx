import { formatarData } from "@/lib/boletos";
import { cn } from "@/lib/utils";

/**
 * Data fixa (DD/MM/AAAA) com o prazo em dias desde a emissão ao lado —
 * "18/09/2026 (30d)". Sem contagem regressiva: aqui o que importa é o prazo
 * que foi concedido, não quanto falta para vencer.
 */
export function DataComPrazo({
  iso,
  dias,
  className,
}: {
  iso: string | null | undefined;
  dias?: number | null;
  className?: string;
}) {
  if (!iso) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("tabular-nums", className)}>
      {formatarData(iso)}
      {dias != null && <span className="text-muted-foreground"> ({dias}d)</span>}
    </span>
  );
}
