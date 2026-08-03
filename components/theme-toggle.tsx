"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/lib/use-theme";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { isDark, toggle } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      title={isDark ? "Tema claro" : "Tema escuro"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
