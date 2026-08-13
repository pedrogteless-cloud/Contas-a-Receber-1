"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Botão liga/desliga, para filtros que são "mostra isso ou não" — não faixa de opções. */
export function ChipToggle({
  ativo,
  onClick,
  children,
  tom = "danger",
}: {
  ativo: boolean;
  onClick: () => void;
  children: ReactNode;
  tom?: "danger" | "brand";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
        !ativo && "border-input bg-background text-muted-foreground hover:text-foreground",
        ativo &&
          tom === "danger" &&
          "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400",
        ativo &&
          tom === "brand" &&
          "border-brand/30 bg-brand/10 text-brand dark:bg-brand/20"
      )}
    >
      {children}
    </button>
  );
}
