"use client";

import { useState } from "react";
import { Loader2, Lock, LogIn, User } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEntrando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, senha }),
      });
      const r = (await resp.json().catch(() => null)) as {
        ok?: boolean;
        erro?: string;
      } | null;

      if (resp.ok && r?.ok) {
        window.location.href = "/";
      } else {
        setErro(r?.erro ?? "Não foi possível entrar.");
        setEntrando(false);
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
      setEntrando(false);
    }
  }

  return (
    <div className="flex min-h-[75vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <Logo className="h-11 w-11" />
            <div>
              <h1 className="text-lg font-semibold">Contas a Receber 1</h1>
              <p className="text-xs text-muted-foreground">
                Grupo Ley · Controle interno
              </p>
            </div>
          </div>

          <form onSubmit={entrar} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="usuario">Usuário</Label>
              <div className="relative">
                <User className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="usuario"
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="pl-8"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder="seu.usuario"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="senha">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="senha"
                  type="password"
                  className="pl-8"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>

            {erro && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {erro}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={entrando || !usuario || !senha}
            >
              {entrando ? <Loader2 className="animate-spin" /> : <LogIn />}
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
