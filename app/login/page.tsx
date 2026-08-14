"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Loader2, Lock, LogIn, ShieldCheck, User } from "lucide-react";
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
} from "@simplewebauthn/browser";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [modo, setModo] = useState<"carregando" | "login" | "setup">(
    "carregando"
  );
  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [biometriaDisponivel, setBiometriaDisponivel] = useState(false);
  const [entrandoComBiometria, setEntrandoComBiometria] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => setModo(d?.precisaSetup ? "setup" : "login"))
      .catch(() => setModo("login"));
  }, []);

  useEffect(() => {
    if (!browserSupportsWebAuthn()) return;
    platformAuthenticatorIsAvailable()
      .then((disponivel) => setBiometriaDisponivel(disponivel))
      .catch(() => setBiometriaDisponivel(false));
  }, []);

  async function entrarComBiometria() {
    setEntrandoComBiometria(true);
    setErro(null);
    try {
      const respOpcoes = await fetch("/api/webauthn/login/opcoes", { method: "POST" });
      const dadosOpcoes = (await respOpcoes.json().catch(() => null)) as {
        ok?: boolean;
        opcoes?: Parameters<typeof startAuthentication>[0]["optionsJSON"];
        erro?: string;
      } | null;

      if (!respOpcoes.ok || !dadosOpcoes?.ok || !dadosOpcoes.opcoes) {
        setErro(dadosOpcoes?.erro ?? "Não foi possível iniciar a biometria.");
        setEntrandoComBiometria(false);
        return;
      }

      const resposta = await startAuthentication({ optionsJSON: dadosOpcoes.opcoes });

      const respVerificar = await fetch("/api/webauthn/login/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resposta }),
      });
      const r = (await respVerificar.json().catch(() => null)) as {
        ok?: boolean;
        erro?: string;
      } | null;

      if (respVerificar.ok && r?.ok) {
        window.location.href = "/";
      } else {
        setErro(r?.erro ?? "Não foi possível entrar com biometria.");
        setEntrandoComBiometria(false);
      }
    } catch (err) {
      const cancelado =
        err instanceof Error && (err.name === "NotAllowedError" || err.name === "AbortError");
      setErro(cancelado ? null : "Não foi possível usar a biometria neste aparelho.");
      setEntrandoComBiometria(false);
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);

    if (modo === "setup" && senha !== confirmar) {
      setErro("As senhas não conferem.");
      setEnviando(false);
      return;
    }

    try {
      const url = modo === "setup" ? "/api/setup" : "/api/login";
      const corpo =
        modo === "setup" ? { nome, usuario, senha } : { usuario, senha };

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const r = (await resp.json().catch(() => null)) as {
        ok?: boolean;
        erro?: string;
      } | null;

      if (resp.ok && r?.ok) {
        window.location.href = "/";
      } else {
        setErro(r?.erro ?? "Não foi possível entrar.");
        setEnviando(false);
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
      setEnviando(false);
    }
  }

  const setup = modo === "setup";

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

          {modo === "carregando" ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : (
            <>
              {setup && (
                <div className="rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
                  <p className="flex items-center gap-1.5 font-medium">
                    <ShieldCheck className="h-4 w-4 text-brand" /> Primeiro
                    acesso
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Crie a conta de administrador (senha-mestra). Ela terá acesso
                    total, incluindo usuários e auditoria.
                  </p>
                </div>
              )}

              {!setup && biometriaDisponivel && (
                <div className="space-y-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={entrandoComBiometria}
                    onClick={entrarComBiometria}
                  >
                    {entrandoComBiometria ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Fingerprint />
                    )}
                    Entrar com biometria
                  </Button>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="h-px flex-1 bg-border" />
                    ou
                    <div className="h-px flex-1 bg-border" />
                  </div>
                </div>
              )}

              <form onSubmit={enviar} className="space-y-3">
                {setup && (
                  <div className="space-y-1.5">
                    <Label htmlFor="nome">Seu nome</Label>
                    <Input
                      id="nome"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Pedro Teles"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="usuario">Usuário</Label>
                  <div className="relative">
                    <User className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="usuario"
                      autoFocus={!setup}
                      autoCapitalize="none"
                      autoCorrect="off"
                      className="pl-8"
                      value={usuario}
                      onChange={(e) => setUsuario(e.target.value)}
                      placeholder="pedro"
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
                      placeholder={setup ? "mín. 6 caracteres" : "••••••••"}
                    />
                  </div>
                </div>

                {setup && (
                  <div className="space-y-1.5">
                    <Label htmlFor="confirmar">Confirmar senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirmar"
                        type="password"
                        className="pl-8"
                        value={confirmar}
                        onChange={(e) => setConfirmar(e.target.value)}
                        placeholder="repita a senha"
                      />
                    </div>
                  </div>
                )}

                {erro && (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                    {erro}
                  </p>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={enviando || !usuario || !senha}
                >
                  {enviando ? (
                    <Loader2 className="animate-spin" />
                  ) : setup ? (
                    <ShieldCheck />
                  ) : (
                    <LogIn />
                  )}
                  {setup ? "Criar administrador" : "Entrar"}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
