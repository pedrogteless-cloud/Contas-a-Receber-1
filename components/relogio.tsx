"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";

import { dataCurta, dataPorExtenso, horaCurta } from "@/lib/tempo";
import { ComAjuda } from "@/components/ajuda";

/**
 * Data e hora de hoje no cabeçalho. Renderiza vazio no servidor e preenche
 * após a montagem, evitando divergência de hidratação (o servidor pode estar
 * em outro fuso). Atualiza a cada 30s.
 */
export function Relogio() {
  const [agora, setAgora] = useState<Date | null>(null);

  useEffect(() => {
    setAgora(new Date());
    const id = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!agora) {
    // Espaço reservado para não "pular" o layout quando o relógio aparecer.
    return <div className="hidden h-9 w-[9.5rem] sm:block" aria-hidden />;
  }

  return (
    <ComAjuda
      titulo="Data de hoje"
      texto={`Hoje é ${dataPorExtenso(agora)}. Todos os prazos e o "a vencer" são calculados a partir desta data.`}
      lado="bottom"
    >
      <div className="hidden items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1.5 sm:flex">
        <CalendarDays className="h-4 w-4 text-brand" />
        <span className="flex flex-col leading-tight">
          <span className="text-xs font-semibold capitalize">
            {dataCurta(agora)}
          </span>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {horaCurta(agora)}
          </span>
        </span>
      </div>
    </ComAjuda>
  );
}
