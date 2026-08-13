"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type Direcao = "asc" | "desc";

export interface Ordenacao<T extends string> {
  campo: T;
  direcao: Direcao;
}

/**
 * Alterna a ordenação ao clicar num cabeçalho: primeiro clique usa a direção
 * padrão daquele campo (alfabético começa em A-Z, número começa do maior);
 * clicar de novo no mesmo campo inverte.
 */
export function alternarOrdenacao<T extends string>(
  atual: Ordenacao<T>,
  campo: T,
  direcaoPadrao: Direcao
): Ordenacao<T> {
  if (atual.campo !== campo) return { campo, direcao: direcaoPadrao };
  return { campo, direcao: atual.direcao === "asc" ? "desc" : "asc" };
}

/** Cabeçalho de tabela clicável, com seta indicando a ordenação atual. */
export function ThOrdenavel<T extends string>({
  campo,
  ordenacao,
  onOrdenar,
  align = "left",
  className,
  children,
}: {
  campo: T;
  ordenacao: Ordenacao<T>;
  onOrdenar: (campo: T) => void;
  align?: "left" | "right" | "center";
  className?: string;
  children: ReactNode;
}) {
  const ativo = ordenacao.campo === campo;
  return (
    <TableHead
      onClick={() => onOrdenar(campo)}
      className={cn(
        "cursor-pointer select-none whitespace-nowrap transition-colors hover:text-foreground",
        align === "right" && "text-right",
        align === "center" && "text-center",
        ativo && "text-foreground",
        className
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1",
          align === "right" && "flex-row-reverse"
        )}
      >
        {children}
        {ativo ? (
          ordenacao.direcao === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </TableHead>
  );
}
