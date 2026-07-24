// Informações Contratuais — períodos (Loja/Cargo/Data de Admissão/Salário) de um colaborador
// dentro de um ano fiscal. Um colaborador pode ter vários períodos por ano (reajuste salarial,
// troca de cargo/loja), desde que os intervalos de meses não se sobreponham.

import { supabase } from '@/lib/supabase';

export interface Contrato {
  id: string;
  colaborador_id: string;
  ano: number;
  mes_inicio: number; // 1-12
  mes_fim: number; // 1-12
  loja: string;
  cargo: string;
  data_admissao: string; // ISO date
  salario_base: number;
  salario_complementar: number;
  dias_uteis_pagamento: number;
  created_at: string;
  updated_at: string;
}

export const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const ANOS_FISCAIS = [2026, 2027, 2028, 2029, 2030];

export function periodoLabel(mesInicio: number, mesFim: number): string {
  if (mesInicio === mesFim) return MESES_ABREV[mesInicio - 1];
  return `${MESES_ABREV[mesInicio - 1]} – ${MESES_ABREV[mesFim - 1]}`;
}

// Dois intervalos [mes_inicio, mes_fim] do mesmo ano se sobrepõem se houver interseção.
export function periodsOverlap(a: { mes_inicio: number; mes_fim: number }, b: { mes_inicio: number; mes_fim: number }): boolean {
  return a.mes_inicio <= b.mes_fim && b.mes_inicio <= a.mes_fim;
}

// Retorna true se o candidato NÃO colide com nenhum período existente do mesmo colaborador/ano.
export function validateNoOverlap(
  existentes: Contrato[],
  candidato: { ano: number; mes_inicio: number; mes_fim: number },
  excludeId?: string,
): boolean {
  return !existentes.some(c =>
    c.id !== excludeId &&
    c.ano === candidato.ano &&
    periodsOverlap(c, candidato),
  );
}

// Data de admissão original = a mais antiga entre todos os períodos do colaborador,
// usada para o cálculo contínuo de "Tempo de Casa" mesmo com vários períodos ao longo dos anos.
export function earliestAdmissao(contratos: Contrato[]): string | null {
  if (contratos.length === 0) return null;
  return contratos.reduce((min, c) => (c.data_admissao < min ? c.data_admissao : min), contratos[0].data_admissao);
}

export async function fetchContratosByColaborador(colaboradorId: string): Promise<Contrato[]> {
  const { data } = await supabase
    .from('hr_contratos')
    .select('*')
    .eq('colaborador_id', colaboradorId)
    .order('ano', { ascending: true })
    .order('mes_inicio', { ascending: true });
  return (data as Contrato[]) || [];
}

export async function fetchContratosByAno(ano: number): Promise<Contrato[]> {
  const { data } = await supabase
    .from('hr_contratos')
    .select('*')
    .eq('ano', ano);
  return (data as Contrato[]) || [];
}

export async function fetchAllContratos(): Promise<Contrato[]> {
  const { data } = await supabase.from('hr_contratos').select('*');
  return (data as Contrato[]) || [];
}
