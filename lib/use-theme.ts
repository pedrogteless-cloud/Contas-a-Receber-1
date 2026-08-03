"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

function temaAtual(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Lê e alterna o tema (classe `dark` no <html>), persistindo em localStorage.
 * Observa mudanças na classe para que os gráficos reajam ao toggle.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(temaAtual());
    const obs = new MutationObserver(() => setTheme(temaAtual()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  function aplicar(t: Theme) {
    document.documentElement.classList.toggle("dark", t === "dark");
    try {
      localStorage.setItem("theme", t);
    } catch {
      // ignore
    }
    setTheme(t);
  }

  return {
    theme,
    isDark: theme === "dark",
    setTheme: aplicar,
    toggle: () => aplicar(temaAtual() === "dark" ? "light" : "dark"),
  };
}
