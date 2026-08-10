"use client";

import { useState } from "react";
import { Loader2, Lock } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(false);
  const [entrando, setEntrando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEntrando(true);
    setErro(false);
    try {
      const resp = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha }),
      });
      if (resp.ok) {
        window.location.href = "/";
      } else {
        setErro(true);
        setEntrando(false);
      }
    } catch {
      setErro(true);
      setEntrando(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
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
              <Label htmlFor="senha">Senha de acesso</Label>
              <div className="relative">
                <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="senha"
                  type="password"
                  autoFocus
                  className="pl-8"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>

            {erro && (
              <p className="text-sm text-red-600 dark:text-red-400">
                Senha incorreta.
              </p>
            )}

            <Button type="submit" className="w-full" disabled={entrando || !senha}>
              {entrando ? <Loader2 className="animate-spin" /> : <Lock />}
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
