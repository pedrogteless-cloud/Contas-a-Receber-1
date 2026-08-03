import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Motivo = "ok" | "sem_chave" | "erro";

interface Arquivo {
  tipo: "image" | "pdf";
  media_type: string;
  data: string; // base64 (sem prefixo data URL)
}

interface LinhaExtraida {
  sacado: string;
  nosso_numero: string;
  seu_numero: string;
  data_entrada: string | null;
  data_vencimento: string | null;
  valor: number;
}

const MODELO = process.env.EXTRACAO_MODEL || "claude-opus-5";

const INSTRUCAO = `Você extrai contas a receber de documentos brasileiros (nota fiscal, fatura, duplicata, boleto ou foto de um relatório) para um sistema de controle interno.

Leia com atenção e devolva UMA linha por duplicata/parcela/título a receber. Para cada uma:
- sacado: nome do cliente/pagador/sacado (quem deve pagar). Se houver só a razão social, use-a.
- nosso_numero: "nosso número" do banco, se existir; senão string vazia.
- seu_numero: número do documento/nota/duplicata (ex.: número da NF ou da duplicata); senão string vazia.
- data_entrada: data de emissão/entrada no formato ISO AAAA-MM-DD; se não houver, null.
- data_vencimento: data de vencimento da parcela em ISO AAAA-MM-DD; se não houver, null.
- valor: valor da parcela em número (ponto decimal, ex.: 1797.00). Nunca inclua "R$".

Regras:
- Se a nota tem várias duplicatas/parcelas (ex.: 001, 002, 003 com vencimentos diferentes), gere UMA linha para cada.
- Converta datas DD/MM/AAAA para AAAA-MM-DD.
- Não invente dados: se um campo não aparecer, use string vazia ou null conforme o tipo.
- Não deixe de fora nenhuma parcela. Não some nem agrupe valores.
Chame a ferramenta registrar_boletos com o resultado.`;

const FERRAMENTA: Anthropic.Tool = {
  name: "registrar_boletos",
  description: "Registra as duplicatas/títulos a receber extraídos do documento.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      linhas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            sacado: { type: "string" },
            nosso_numero: { type: "string" },
            seu_numero: { type: "string" },
            data_entrada: {
              type: ["string", "null"],
              description: "ISO AAAA-MM-DD ou null",
            },
            data_vencimento: {
              type: ["string", "null"],
              description: "ISO AAAA-MM-DD ou null",
            },
            valor: { type: "number" },
          },
          required: [
            "sacado",
            "nosso_numero",
            "seu_numero",
            "data_entrada",
            "data_vencimento",
            "valor",
          ],
        },
      },
    },
    required: ["linhas"],
  },
};

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      linhas: [],
      motivo: "sem_chave" as Motivo,
    });
  }

  let arquivos: Arquivo[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.arquivos)) arquivos = body.arquivos;
  } catch {
    return NextResponse.json(
      { linhas: [], motivo: "erro", detalhe: "Corpo inválido." },
      { status: 400 }
    );
  }

  if (arquivos.length === 0) {
    return NextResponse.json(
      { linhas: [], motivo: "erro", detalhe: "Nenhum arquivo enviado." },
      { status: 400 }
    );
  }

  const conteudo: Anthropic.ContentBlockParam[] = [];
  for (const a of arquivos) {
    if (a.tipo === "pdf") {
      conteudo.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: a.data },
      });
    } else {
      conteudo.push({
        type: "image",
        source: {
          type: "base64",
          media_type: a.media_type as
            | "image/jpeg"
            | "image/png"
            | "image/gif"
            | "image/webp",
          data: a.data,
        },
      });
    }
  }
  conteudo.push({ type: "text", text: INSTRUCAO });

  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: MODELO,
      max_tokens: 8000,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      tools: [FERRAMENTA],
      tool_choice: { type: "tool", name: "registrar_boletos" },
      messages: [{ role: "user", content: conteudo }],
    });

    const bloco = resp.content.find((b) => b.type === "tool_use");
    const linhas: LinhaExtraida[] =
      bloco && bloco.type === "tool_use"
        ? ((bloco.input as { linhas?: LinhaExtraida[] })?.linhas ?? [])
        : [];

    // Normaliza datas vazias -> null.
    const limpas = linhas.map((l) => ({
      sacado: String(l.sacado ?? "").trim(),
      nosso_numero: String(l.nosso_numero ?? "").trim(),
      seu_numero: String(l.seu_numero ?? "").trim(),
      data_entrada: l.data_entrada || null,
      data_vencimento: l.data_vencimento || null,
      valor: typeof l.valor === "number" && Number.isFinite(l.valor) ? l.valor : 0,
    }));

    return NextResponse.json({ linhas: limpas, motivo: "ok" as Motivo });
  } catch (err) {
    console.error("[ler-documento] falha:", err);
    return NextResponse.json(
      { linhas: [], motivo: "erro", detalhe: "Falha ao ler o documento." },
      { status: 500 }
    );
  }
}
