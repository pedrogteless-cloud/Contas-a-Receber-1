"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileUp,
  LayoutDashboard,
  History,
  Layers,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Sessao } from "@/lib/auth";
import { AJUDA } from "@/lib/ajuda-textos";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { ComAjuda } from "@/components/ajuda";
import { Relogio } from "@/components/relogio";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

interface LinkNav {
  href: string;
  label: string;
  icon: LucideIcon;
  ajuda: string;
}

const LINKS: LinkNav[] = [
  { href: "/", label: "Importação", icon: FileUp, ajuda: AJUDA.abaImportacao },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    ajuda: AJUDA.abaDashboard,
  },
  { href: "/clientes", label: "Clientes", icon: Users, ajuda: AJUDA.abaClientes },
  {
    href: "/vendas",
    label: "Vendas",
    icon: Layers,
    ajuda: AJUDA.abaVendas,
  },
  {
    href: "/historico",
    label: "Histórico",
    icon: History,
    ajuda: AJUDA.abaHistorico,
  },
  {
    href: "/configuracoes",
    label: "Configurações",
    icon: Settings,
    ajuda: AJUDA.abaConfiguracoes,
  },
];

export function Nav() {
  const pathname = usePathname();
  const [sessao, setSessao] = useState<Sessao | null>(null);

  useEffect(() => {
    fetch("/api/sessao")
      .then((r) => r.json())
      .then((d) => setSessao(d?.sessao ?? null))
      .catch(() => setSessao(null));
  }, []);

  if (pathname === "/login") return null;

  const links = [...LINKS];
  if (sessao?.papel === "admin") {
    links.push({
      href: "/admin",
      label: "Admin",
      icon: ShieldCheck,
      ajuda: AJUDA.abaAdmin,
    });
  }

  async function sair() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-lg">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <Logo />
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-semibold">Contas a Receber 1</span>
            <span className="text-xs text-muted-foreground">
              Grupo Ley · Controle interno
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Relogio />
          <nav className="flex items-center gap-0.5 rounded-full border border-border/70 bg-card/60 p-1 shadow-sm">
            {links.map(({ href, label, icon: Icon, ajuda }) => {
              const ativo =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <ComAjuda key={href} titulo={label} texto={ajuda} lado="bottom">
                  <Link
                    href={href}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                      ativo
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden lg:inline">{label}</span>
                  </Link>
                </ComAjuda>
              );
            })}
          </nav>

          {sessao && (
            <div className="ml-1 hidden items-center gap-2 md:flex">
              <span className="flex flex-col leading-tight text-right">
                <span className="text-xs font-medium">{sessao.nome}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {sessao.papel}
                </span>
              </span>
              <Button variant="ghost" size="icon" onClick={sair} title="Sair">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
