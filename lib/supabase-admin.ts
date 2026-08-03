import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Client de servidor com SERVICE ROLE. Ignora a RLS e nunca deve ser
// importado em componentes de client — apenas em route handlers do servidor.
// Criado de forma preguiçosa para que o build não exija o segredo em tempo
// de compilação (o segredo só existe em runtime, na Vercel).
let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL não configurada.");
  }
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
