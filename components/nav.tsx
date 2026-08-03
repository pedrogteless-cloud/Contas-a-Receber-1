"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileUp, LayoutDashboard, History, Settings } from "lucide-react";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Importação", icon: FileUp },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/historico", label: "Histórico", icon: History },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-0 sm:h-16">
        <div className="flex flex-col">
          <span className="text-base font-semibold leading-tight">
            Contas a Receber 1
          </span>
          <span className="text-xs text-muted-foreground">
            Grupo Ley · Controle interno
          </span>
        </div>

        <nav className="flex flex-wrap items-center gap-1">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const ativo =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  ativo
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
