"use client";

import { HelpCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Ícone de ajuda: ao passar o mouse (ou tocar/focar), explica o dado ou botão.
 * Ex.: <Ajuda texto="Prazo médio = média dos dias entre entrada e vencimento." />
 */
export function Ajuda({
  texto,
  titulo,
  className,
  lado = "top",
}: {
  texto: string;
  titulo?: string;
  className?: string;
  lado?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={titulo ? `Ajuda: ${titulo}` : "Ajuda"}
          onClick={(e) => e.preventDefault()}
          className={cn(
            "inline-flex shrink-0 text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            className
          )}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={lado}>
        {titulo && <p className="mb-0.5 font-semibold">{titulo}</p>}
        <p className="text-muted-foreground">{texto}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Envolve um elemento qualquer com um tooltip explicativo. */
export function ComAjuda({
  texto,
  titulo,
  lado = "top",
  children,
}: {
  texto: string;
  titulo?: string;
  lado?: "top" | "right" | "bottom" | "left";
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={lado}>
        {titulo && <p className="mb-0.5 font-semibold">{titulo}</p>}
        <p className="text-muted-foreground">{texto}</p>
      </TooltipContent>
    </Tooltip>
  );
}
