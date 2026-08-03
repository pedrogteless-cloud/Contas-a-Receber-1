import { createClient } from "@supabase/supabase-js";

// Client de browser: usa a ANON KEY (publicável). Seguro para o client-side,
// protegido pela RLS. NUNCA importe o service role aqui.
//
// Fallbacks placeholder garantem que `createClient` não estoure no import
// durante o build/prerender quando as variáveis ainda não estão disponíveis.
// Em produção, defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY
// na Vercel — os valores reais têm prioridade sobre estes placeholders.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});
