"use client";

import { corEmpresa } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const OPCOES_EMPRESA = [
  "Todas",
  "Ley Móveis",
  "Ley Colchões",
  "Não classificado",
] as const;

/**
 * Separa Ley Móveis / Ley Colchões num toque só, em vez de escondido num
 * dropdown. Cada opção mostra a bolinha da cor da empresa, igual ao resto
 * do sistema, para reconhecer de relance qual está selecionada.
 */
export function FiltroEmpresa({
  valor,
  onChange,
}: {
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
      {OPCOES_EMPRESA.map((op) => {
        const ativo = valor === op;
        return (
          <button
            key={op}
            type="button"
            onClick={() => onChange(op)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              ativo
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {op !== "Todas" && (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: corEmpresa(op) }}
              />
            )}
            {op}
          </button>
        );
      })}
    </div>
  );
}
