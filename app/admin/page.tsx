"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyRound,
  Loader2,
  Plus,
  ScrollText,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";

import { PAPEIS, type Papel, type Sessao } from "@/lib/auth";
import { formatarData } from "@/lib/boletos";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface UsuarioLinha {
  id: string;
  nome: string;
  usuario: string;
  papel: Papel;
  ativo: boolean;
  ultimo_acesso: string | null;
  created_at: string;
}

interface RegistroAuditoria {
  id: string;
  usuario: string;
  acao: string;
  detalhe: string;
  created_at: string;
}

type Aba = "usuarios" | "auditoria";

function dataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatarData(iso.slice(0, 10))} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default function AdminPage() {
  const [aba, setAba] = useState<Aba>("usuarios");
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioLinha[]>([]);
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [semAcesso, setSemAcesso] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(
    null
  );

  // Formulário de novo usuário
  const [nome, setNome] = useState("");
  const [novoUsuario, setNovoUsuario] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [papel, setPapel] = useState<Papel>("operador");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const s = await fetch("/api/sessao").then((r) => r.json());
      setSessao(s?.sessao ?? null);

      const respU = await fetch("/api/usuarios");
      if (respU.status === 403) {
        setSemAcesso(true);
        return;
      }
      const dadosU = await respU.json();
      setUsuarios(dadosU.usuarios ?? []);

      const respA = await fetch("/api/auditoria?limite=300");
      if (respA.ok) {
        const dadosA = await respA.json();
        setRegistros(dadosA.registros ?? []);
      }
    } catch {
      setAviso({ tipo: "erro", texto: "Falha ao carregar." });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function criarUsuario(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setAviso(null);
    try {
      const resp = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          usuario: novoUsuario,
          senha: novaSenha,
          papel,
        }),
      });
      const r = await resp.json().catch(() => null);
      if (!resp.ok) {
        setAviso({ tipo: "erro", texto: r?.erro ?? "Erro ao criar usuário." });
        return;
      }
      setNome("");
      setNovoUsuario("");
      setNovaSenha("");
      setPapel("operador");
      setAviso({ tipo: "ok", texto: "Usuário criado." });
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function atualizar(id: string, patch: Record<string, unknown>) {
    setAviso(null);
    const resp = await fetch("/api/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const r = await resp.json().catch(() => null);
    if (!resp.ok) {
      setAviso({ tipo: "erro", texto: r?.erro ?? "Erro ao atualizar." });
      return;
    }
    await carregar();
  }

  async function redefinirSenha(u: UsuarioLinha) {
    const nova = window.prompt(`Nova senha para "${u.usuario}" (mín. 6):`);
    if (!nova) return;
    await atualizar(u.id, { senha: nova });
    setAviso({ tipo: "ok", texto: `Senha de ${u.usuario} redefinida.` });
  }

  const porUsuario = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const r of registros) mapa.set(r.usuario, (mapa.get(r.usuario) ?? 0) + 1);
    return Array.from(mapa.entries()).sort((a, b) => b[1] - a[1]);
  }, [registros]);

  if (semAcesso) {
    return (
      <div className="space-y-6">
        <PageHeader title="Administração" />
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Esta área é restrita a administradores.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administração"
        description="Cadastros, permissões e trilha de auditoria."
      >
        <div className="flex items-center gap-1 rounded-full border border-border/70 bg-card/60 p-1">
          {(
            [
              { id: "usuarios" as Aba, label: "Usuários", icon: Users },
              { id: "auditoria" as Aba, label: "Auditoria", icon: ScrollText },
            ]
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                aba === id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </PageHeader>

      {aviso && (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            aviso.tipo === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          )}
        >
          {aviso.texto}
        </div>
      )}

      {aba === "usuarios" && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserPlus className="h-4 w-4" /> Novo usuário
              </CardTitle>
              <CardDescription>
                Defina o papel conforme o acesso desejado.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={criarUsuario}
                className="grid gap-3 md:grid-cols-2 lg:grid-cols-5"
              >
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Maria Silva"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Usuário</Label>
                  <Input
                    value={novoUsuario}
                    autoCapitalize="none"
                    onChange={(e) => setNovoUsuario(e.target.value)}
                    placeholder="maria"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Senha</Label>
                  <Input
                    type="password"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    placeholder="mín. 6 caracteres"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Papel</Label>
                  <Select value={papel} onValueChange={(v) => setPapel(v as Papel)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAPEIS.map((p) => (
                        <SelectItem key={p.valor} value={p.valor}>
                          {p.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={salvando || !novoUsuario || !novaSenha}
                  >
                    {salvando ? <Loader2 className="animate-spin" /> : <Plus />}
                    Cadastrar
                  </Button>
                </div>
              </form>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {PAPEIS.map((p) => (
                  <div
                    key={p.valor}
                    className="rounded-lg border bg-muted/30 p-3 text-xs"
                  >
                    <div className="mb-0.5 flex items-center gap-1.5 font-medium">
                      <ShieldCheck className="h-3.5 w-3.5" /> {p.rotulo}
                    </div>
                    <p className="text-muted-foreground">{p.descricao}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Usuários cadastrados</CardTitle>
              <CardDescription>{usuarios.length} usuário(s)</CardDescription>
            </CardHeader>
            <CardContent>
              {carregando ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <div className="overflow-x-auto scroll-thin">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Usuário</TableHead>
                        <TableHead className="min-w-[150px]">Papel</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Último acesso</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usuarios.map((u) => {
                        const eu = sessao?.id === u.id;
                        return (
                          <TableRow key={u.id}>
                            <TableCell className="font-medium">
                              {u.nome}
                              {eu && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  (você)
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {u.usuario}
                            </TableCell>
                            <TableCell>
                              <Select
                                value={u.papel}
                                onValueChange={(v) => atualizar(u.id, { papel: v })}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {PAPEIS.map((p) => (
                                    <SelectItem key={p.valor} value={p.valor}>
                                      {p.rotulo}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Badge variant={u.ativo ? "success" : "warning"}>
                                {u.ativo ? "Ativo" : "Inativo"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs tabular-nums">
                              {dataHora(u.ultimo_acesso)}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => redefinirSenha(u)}
                                >
                                  <KeyRound /> Senha
                                </Button>
                                <Button
                                  variant={u.ativo ? "ghost" : "outline"}
                                  size="sm"
                                  onClick={() => atualizar(u.id, { ativo: !u.ativo })}
                                >
                                  {u.ativo ? "Desativar" : "Reativar"}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {aba === "auditoria" && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ações por usuário</CardTitle>
              <CardDescription>
                Total de registros no período carregado.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {porUsuario.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem registros.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {porUsuario.map(([u, n]) => (
                    <span
                      key={u}
                      className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm"
                    >
                      <span className="font-medium">{u}</span>
                      <Badge variant="secondary">{n}</Badge>
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Trilha de auditoria</CardTitle>
              <CardDescription>
                {registros.length} registro(s) — mais recentes primeiro.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {carregando ? (
                <Skeleton className="h-40 w-full" />
              ) : registros.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem registros.</p>
              ) : (
                <div className="overflow-x-auto scroll-thin">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Ação</TableHead>
                        <TableHead>Detalhe</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registros.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap text-xs tabular-nums">
                            {dataHora(r.created_at)}
                          </TableCell>
                          <TableCell className="font-medium">{r.usuario}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                r.acao.includes("falhou")
                                  ? "destructive"
                                  : r.acao.startsWith("usuario")
                                    ? "warning"
                                    : "secondary"
                              }
                            >
                              {r.acao}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.detalhe}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
