import { NextResponse } from "next/server";

import { ehAdmin } from "@/lib/auth";
import { registrarAuditoria, sessaoAtual } from "@/lib/sessao-servidor";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dump em JSON dos dados operacionais, para backup manual. Só admin. */
export async function GET() {
  const sessao = sessaoAtual();
  if (!ehAdmin(sessao?.papel)) {
    return NextResponse.json({ ok: false, erro: "Acesso restrito ao administrador." }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const [boletos, configuracoes, acordosPrazo, acordosHistorico] = await Promise.all([
    supabase.from("boletos").select("*"),
    supabase.from("configuracoes").select("*"),
    supabase.from("acordos_prazo").select("*"),
    supabase.from("acordos_historico").select("*"),
  ]);

  const erro = [boletos, configuracoes, acordosPrazo, acordosHistorico].find((r) => r.error);
  if (erro) {
    return NextResponse.json({ ok: false, erro: "Erro ao gerar o backup." }, { status: 500 });
  }

  const dump = {
    gerado_em: new Date().toISOString(),
    boletos: boletos.data ?? [],
    configuracoes: configuracoes.data ?? [],
    acordos_prazo: acordosPrazo.data ?? [],
    acordos_historico: acordosHistorico.data ?? [],
  };

  await registrarAuditoria("backup.exportado", "Exportou um backup dos dados em JSON.", sessao);

  return new NextResponse(JSON.stringify(dump, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="backup-contas-a-receber-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
    },
  });
}
