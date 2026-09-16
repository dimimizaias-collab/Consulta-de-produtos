import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Login feito no servidor, não no cliente.
//
// As duas tentativas anteriores de corrigir o login travando no Safari
// (406d1fa, af30d87) mexeram no lado do cliente: o signInWithPassword ali
// grava a sessão via document.cookie, e o WebKit tem um bug conhecido onde
// a navegação seguinte pode começar antes desse cookie ser persistido em
// disco — o middleware não vê sessão, redireciona de volta pro /login, e o
// formulário "reseta" sem erro nenhum. Um delay fixo (setTimeout) reduz a
// chance da race mas não a elimina — daí o problema ter voltado depois de
// "corrigido" mais de uma vez.
//
// Fazendo o signIn aqui, a sessão é gravada via Set-Cookie na resposta HTTP
// (não via document.cookie), que o navegador aplica de forma confiável antes
// de resolver o fetch — sem depender de timing. Isso remove a classe inteira
// do bug em vez de só torná-la menos provável.
export async function POST(request: NextRequest) {
  const { email, password } = await request.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'E-mail e senha são obrigatórios.' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: 'E-mail/usuário ou senha incorretos.' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
