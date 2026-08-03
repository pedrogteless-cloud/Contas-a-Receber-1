"use client";

import { useEffect, useState } from "react";

/**
 * Retorna true somente após a montagem no client. Usado para adiar a
 * renderização dos gráficos Recharts (ResponsiveContainer) e evitar largura 0
 * durante a hidratação SSR.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
