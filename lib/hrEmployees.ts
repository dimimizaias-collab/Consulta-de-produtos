// Tipos e utilitários para a aba "Colaboradores" do módulo de Recursos Humanos.

import { supabase } from '@/lib/supabase';

export interface Employee {
  id: string;
  nome: string;
  idade: number | null;
  cargo: string;
  loja: string;
  data_admissao: string; // ISO date (YYYY-MM-DD)
  salario: number;
  foto_url: string | null;
}

export const fmtSalario = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Calcula o tempo de casa a partir da data de admissão, ex: "2 anos e 3 meses", "8 meses", "Hoje".
export function tempoDeCasa(dataAdmissao: string): string {
  const [y, m, d] = dataAdmissao.split('T')[0].split('-').map(Number);
  const admissao = new Date(y, (m || 1) - 1, d || 1);
  const hoje = new Date();

  let anos = hoje.getFullYear() - admissao.getFullYear();
  let meses = hoje.getMonth() - admissao.getMonth();
  if (hoje.getDate() < admissao.getDate()) meses -= 1;
  if (meses < 0) { anos -= 1; meses += 12; }

  if (anos <= 0 && meses <= 0) return 'Hoje';
  if (anos <= 0) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
  if (meses === 0) return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
  return `${anos} ${anos === 1 ? 'ano' : 'anos'} e ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
}

export function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export const EMPLOYEE_PHOTO_BUCKET = 'hr-employees-images';

export async function uploadEmployeePhoto(file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `employees/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(EMPLOYEE_PHOTO_BUCKET).upload(path, file);
  if (error) throw error;
  return supabase.storage.from(EMPLOYEE_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}
