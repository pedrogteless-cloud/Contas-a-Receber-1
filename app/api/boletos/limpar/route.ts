import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ehAdmin } from "@/lib/auth";
import { registrarAuditoria, sessaoAtual } from "@/lib/sessao-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Apaga TODOS os boletos. Restrito ao administrador — usado para zerar a base
 * depois dos testes. Não mexe em usuários, configurações nem auditoria.
 */
export async function POST() {
  const s = sessaoAtual();
  if (!ehAdmin(s?.papel)) {
    return NextResponse.json(
      { erro: "Apenas o administrador pode limpar o histórico." },
      { status: 403 }
    );
  }

  const supabase = getSupabaseAdmin();

  const { count: antes } = await supabase
    .from("boletos")
    .select("id", { count: "exact", head: true });

  const { error } = await supabase
    .from("boletos")
    .delete()
    .not("id", "is", null);

  if (error) {
    console.error("[limpar] erro:", error);
    return NextResponse.json(
      { erro: "Não foi possível limpar o histórico." },
      { status: 500 }
    );
  }

  await registrarAuditoria(
    "historico.limpo",
    `Apagou ${antes ?? 0} boleto(s) do histórico.`,
    s
  );

  return NextResponse.json({ ok: true, apagados: antes ?? 0 });
}
