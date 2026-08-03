import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Recebe um PDF em base64 e devolve o texto puro para o client rodar
 * `extrairDeTexto`. Nenhum dado é persistido aqui.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const base64: string | undefined = body?.pdf;

    if (!base64 || typeof base64 !== "string") {
      return NextResponse.json(
        { error: "Envie o PDF no campo 'pdf' (base64)." },
        { status: 400 }
      );
    }

    // Remove eventual prefixo data URL.
    const limpo = base64.replace(/^data:application\/pdf;base64,/, "");
    const bytes = Uint8Array.from(Buffer.from(limpo, "base64"));

    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });

    const texto = Array.isArray(text) ? text.join("\n") : text;
    return NextResponse.json({ texto });
  } catch (err) {
    console.error("[parse-pdf] falha ao extrair texto:", err);
    return NextResponse.json(
      { error: "Não foi possível ler o PDF." },
      { status: 500 }
    );
  }
}
