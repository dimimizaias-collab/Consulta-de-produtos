import { createClient } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Cliente usado em quase todo o client-side. Precisa ser o cliente com cookies
// (@supabase/ssr) e não o createClient() puro do supabase-js — do contrário ele
// nunca carrega a sessão criada no login (que usa cookies, não localStorage),
// e toda leitura/escrita passa a ser tratada como anônima pelas policies de RLS.
export const supabase = createBrowserSupabaseClient();

// Use service role key for server-side operations if available
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : supabase;
