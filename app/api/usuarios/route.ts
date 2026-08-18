import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const ROLES = ['admin', 'gerente', 'estoque', 'caixa'] as const;

function hasServiceKey() {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .select('id, email, role, ativo, created_at, employee_id, username, avatar_url, hr_employees(nome, cargo, loja, foto_url)')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Erro ao listar usuários', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ usuarios: data });
  } catch (error: any) {
    return NextResponse.json({ error: 'Erro ao listar usuários', details: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!hasServiceKey()) {
      return NextResponse.json({
        error: 'SUPABASE_SERVICE_ROLE_KEY não configurada',
        details: 'Sem essa chave o servidor não pode criar contas de login. Configure a variável de ambiente SUPABASE_SERVICE_ROLE_KEY.',
      }, { status: 500 });
    }

    const body = await request.json();
    const { employeeId, email, password, role } = body as {
      employeeId?: string; email?: string; password?: string; role?: string;
    };

    if (!employeeId || !email || !password) {
      return NextResponse.json({ error: 'Preencha funcionário, e-mail e senha.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, { status: 400 });
    }
    const finalRole = role && ROLES.includes(role as any) ? role : 'admin';

    const { data: employee, error: employeeError } = await supabaseAdmin
      .from('hr_employees')
      .select('id, nome')
      .eq('id', employeeId)
      .maybeSingle();

    if (employeeError || !employee) {
      return NextResponse.json({ error: 'Funcionário não encontrado.' }, { status: 404 });
    }

    const { data: existingLink } = await supabaseAdmin
      .from('usuarios')
      .select('id')
      .eq('employee_id', employeeId)
      .maybeSingle();

    if (existingLink) {
      return NextResponse.json({ error: 'Este funcionário já possui um login vinculado.' }, { status: 409 });
    }

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authUser?.user) {
      return NextResponse.json({ error: 'Erro ao criar login', details: authError?.message }, { status: 400 });
    }

    const { data: usuario, error: insertError } = await supabaseAdmin
      .from('usuarios')
      .insert({
        auth_user_id: authUser.user.id,
        employee_id: employeeId,
        email,
        role: finalRole,
      })
      .select('id, email, role, ativo, created_at, employee_id')
      .single();

    if (insertError) {
      // Desfaz a criação do login no Auth se não conseguirmos vincular ao funcionário
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json({ error: 'Erro ao vincular usuário ao funcionário', details: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ usuario }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: 'Erro ao criar usuário', details: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ativo, role, username, avatarUrl, employeeId } = body as {
      id?: string; ativo?: boolean; role?: string; username?: string | null; avatarUrl?: string | null; employeeId?: string;
    };

    if (!id) {
      return NextResponse.json({ error: 'ID do usuário é obrigatório.' }, { status: 400 });
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (typeof ativo === 'boolean') updates.ativo = ativo;
    if (role) {
      if (!ROLES.includes(role as any)) {
        return NextResponse.json({ error: 'Papel inválido.' }, { status: 400 });
      }
      updates.role = role;
    }
    if (employeeId) updates.employee_id = employeeId;
    if (typeof avatarUrl !== 'undefined') updates.avatar_url = avatarUrl;
    if (typeof username !== 'undefined') {
      const cleaned = username ? username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') : null;
      updates.username = cleaned || null;
    }

    const { data, error } = await supabaseAdmin
      .from('usuarios')
      .update(updates)
      .eq('id', id)
      .select('id, email, role, ativo, username, avatar_url, employee_id')
      .single();

    if (error) {
      if (error.message.includes('usuarios_username_key')) {
        return NextResponse.json({ error: 'Esse nome de usuário já está em uso.' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Erro ao atualizar usuário', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ usuario: data });
  } catch (error: any) {
    return NextResponse.json({ error: 'Erro ao atualizar usuário', details: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!hasServiceKey()) {
      return NextResponse.json({
        error: 'SUPABASE_SERVICE_ROLE_KEY não configurada',
        details: 'Sem essa chave o servidor não pode remover contas de login.',
      }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID do usuário é obrigatório.' }, { status: 400 });
    }

    const { data: usuario, error: fetchError } = await supabaseAdmin
      .from('usuarios')
      .select('auth_user_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !usuario) {
      return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 });
    }

    const { error: deleteError } = await supabaseAdmin.from('usuarios').delete().eq('id', id);
    if (deleteError) {
      return NextResponse.json({ error: 'Erro ao remover usuário', details: deleteError.message }, { status: 500 });
    }

    await supabaseAdmin.auth.admin.deleteUser(usuario.auth_user_id);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Erro ao remover usuário', details: error.message }, { status: 500 });
  }
}
