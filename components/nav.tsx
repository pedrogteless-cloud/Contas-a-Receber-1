"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileUp, LayoutDashboard, History, Settings } from "lucide-react";

import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const LINKS = [
  { href: "/", label: "Importação", icon: FileUp },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/historico", label: "Histórico", icon: History },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-lg">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <Logo />
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Contas a Receber 1</span>
            <span className="text-xs text-muted-foreground">
              Grupo Ley · Controle interno
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <nav className="flex items-center gap-0.5 rounded-full border border-border/70 bg-card/60 p-1 shadow-sm">
            {LINKS.map(({ href, label, icon: Icon }) => {
              const ativo =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    ativo
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden md:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
