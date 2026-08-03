import { createClient } from "@supabase/supabase-js";

// Client de browser: usa a ANON KEY (publicável). Seguro para o client-side,
// protegido pela RLS. NUNCA importe o service role aqui.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});
