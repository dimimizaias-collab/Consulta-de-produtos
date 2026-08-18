import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Resolve a login identifier (username) to the e-mail used for Supabase Auth.
// Called from the (unauthenticated) login screen, so it only ever returns the e-mail —
// never role, employee, or any other profile data.
export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get('username')?.trim().toLowerCase();
  if (!username) {
    return NextResponse.json({ error: 'Nome de usuário é obrigatório.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('usuarios')
    .select('email')
    .eq('username', username)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Nome de usuário não encontrado.' }, { status: 404 });
  }

  return NextResponse.json({ email: data.email });
}
