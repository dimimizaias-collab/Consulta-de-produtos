import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const isApiPath = request.nextUrl.pathname.startsWith('/api');
  if (isApiPath) {
    // Rotas de API cuidam da própria autorização (RLS ou service role).
    // Login por usuário, por exemplo, precisa ser chamado sem sessão ainda ativa.
    return response;
  }

  // getSession() decodifica o JWT do cookie localmente (sem round-trip pro
  // Supabase Auth). getUser() faz uma chamada de rede pra validar o token a
  // cada request — e nesse ambiente (middleware roda em Edge Runtime) essa
  // chamada estava falhando de forma consistente mesmo com um login recém
  // bem-sucedido e cookie válido, jogando o usuário de volta pro /login sem
  // erro nenhum. Os dados continuam protegidos: qualquer leitura/escrita via
  // RLS valida a assinatura do JWT no Postgres, então um cookie adulterado
  // não passa de qualquer forma — getSession() aqui só decide se deixa a
  // navegação passar, não é a camada de segurança.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const isLoginPath = request.nextUrl.pathname.startsWith('/login');

  if (!user && !isLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && isLoginPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}
