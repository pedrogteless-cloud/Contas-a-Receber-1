// ---------------------------------------------------------------------------
// lib/theme.ts
// Cores de gráfico (por empresa e por status) e formatadores compactos.
// Paleta validada para daltonismo em modo claro e escuro.
// ---------------------------------------------------------------------------

export const CHART = {
  // Cor segue a ENTIDADE (empresa), nunca a posição na lista.
  moveis: { light: "#eb6834", dark: "#d95926" }, // laranja
  colchoes: { light: "#2a78d6", dark: "#3987e5" }, // azul
  outros: { light: "#1baf7a", dark: "#199e70" }, // aqua
  // Sequência única (uma série) — magnitude.
  seq: { light: "#2a78d6", dark: "#3987e5" },
  // Status (fixos, sempre com rótulo/ícone).
  good: "#0ca30c",
  warning: "#fab219",
  critical: "#d03b3b",
} as const;

export function corEmpresa(nome: string, isDark = false): string {
  const modo = isDark ? "dark" : "light";
  if (nome === "Ley Móveis") return CHART.moveis[modo];
  if (nome === "Ley Colchões") return CHART.colchoes[modo];
  return CHART.outros[modo];
}

/** Eixos: "R$ 12,5 mil", "R$ 1,3 mi". */
export function formatarCompacto(valor: number): string {
  const abs = Math.abs(valor);
  if (abs >= 1_000_000)
    return `R$ ${(valor / 1_000_000).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })} mi`;
  if (abs >= 1_000)
    return `R$ ${(valor / 1_000).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })} mil`;
  return `R$ ${valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}
