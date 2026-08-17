import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Liberação do lock de edição de uma nota via navigator.sendBeacon, disparada no
// beforeunload/pagehide (fechar aba, atualizar página) — um fetch normal pode ser
// cancelado nesse momento, então usamos uma rota dedicada que aceita o POST do beacon.
// Se isso não disparar (crash, queda de energia), o heartbeat expira o lock sozinho
// depois de alguns minutos sem renovação.
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const { noteId, colaboradorId } = JSON.parse(body || '{}');
    if (!noteId || !colaboradorId) {
      return NextResponse.json({ error: 'noteId e colaboradorId são obrigatórios' }, { status: 400 });
    }

    await supabaseAdmin
      .from('review_notes')
      .update({ locked_by_id: null, locked_by_name: null, locked_at: null })
      .eq('id', noteId)
      .eq('locked_by_id', colaboradorId);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro ao liberar lock' }, { status: 500 });
  }
}
