// Ponte entre um período de Informações Contratuais (hr_contratos) e o Controle Financeiro:
// gera 1 parcela por mês do período (vencimento = N-ésimo dia útil do mês) e recalcula o
// valor de parcelas ainda não pagas quando o Caderninho lança um Bônus/Vale/Mercadoria dentro
// da janela de 30 dias (10 a 40 dias antes do pagamento) daquele colaborador.

import { supabase } from '@/lib/supabase';
import { nthBusinessDay, toIsoDate } from '@/lib/hrBusinessDays';
import { type Contrato } from '@/lib/hrContratos';

async function fetchFeriados(): Promise<Set<string>> {
  const { data } = await supabase.from('hr_feriados').select('data');
  return new Set((data || []).map((f: { data: string }) => f.data));
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  return toIsoDate(date);
}

// Gera (ou regenera) as parcelas de salário no Controle Financeiro para um período.
// Meses que já têm uma parcela paga são preservados; as demais parcelas não pagas são
// substituídas pelas recém-calculadas.
export async function generateParcelasForPeriodo(contrato: Contrato, colaboradorNome: string): Promise<void> {
  const feriados = await fetchFeriados();

  const { data: existentes } = await supabase
    .from('finance_transactions')
    .select('id, numero_parcela, pago, parcelamento_id')
    .eq('hr_period_id', contrato.id);
  const existentesRows = existentes || [];

  const mesesPagos = new Set(existentesRows.filter(r => r.pago).map(r => r.numero_parcela));
  const idsParaExcluir = existentesRows.filter(r => !r.pago).map(r => r.id);
  if (idsParaExcluir.length > 0) {
    await supabase.from('finance_transactions').delete().in('id', idsParaExcluir);
  }

  const parcelamentoId = existentesRows.find(r => r.pago)?.parcelamento_id ?? crypto.randomUUID();
  const totalParcelas = contrato.mes_fim - contrato.mes_inicio + 1;
  const salarioTotal = contrato.salario_base + contrato.salario_complementar;

  const vencimentos: { mes: number; numeroParcela: number; vencimento: string }[] = [];
  for (let mes = contrato.mes_inicio; mes <= contrato.mes_fim; mes++) {
    const numeroParcela = mes - contrato.mes_inicio + 1;
    if (mesesPagos.has(numeroParcela)) continue;
    const dia = nthBusinessDay(contrato.ano, mes, contrato.dias_uteis_pagamento, feriados);
    vencimentos.push({ mes, numeroParcela, vencimento: toIsoDate(dia) });
  }
  if (vencimentos.length === 0) return;

  const dataLancamento = vencimentos[vencimentos.length - 1].vencimento;

  const rows = vencimentos.map(v => ({
    data: dataLancamento,
    tipo: 'Despesa' as const,
    tipo_pagamento: 'Transferência',
    favorecido: colaboradorNome,
    estabelecimento: contrato.loja || '—',
    vencimento: v.vencimento,
    valor_final: salarioTotal,
    total_pago: 0,
    pago: false,
    numero_parcela: v.numeroParcela,
    total_parcelas: totalParcelas,
    parcelamento_id: parcelamentoId,
    hr_employee_id: contrato.colaborador_id,
    hr_period_id: contrato.id,
    origem: 'hr_salario' as const,
  }));

  await supabase.from('finance_transactions').insert(rows);

  // Aplica de imediato eventuais lançamentos do Caderninho que já existam dentro da janela
  // de cada parcela recém-criada (ex: usuário lança um Bônus antes de configurar o salário).
  for (const v of vencimentos) {
    await recomputeInstallmentByVencimento(contrato.colaborador_id, v.vencimento);
  }
}

// Remove as parcelas não pagas de um período (usado antes de excluir o próprio período).
export async function deleteUnpaidParcelasForPeriodo(periodoId: string): Promise<void> {
  await supabase.from('finance_transactions').delete().eq('hr_period_id', periodoId).eq('pago', false);
}

// Recalcula o valor_final de UMA parcela (identificada por colaborador + vencimento) a partir
// do salário base do período + o saldo líquido do Caderninho na janela de 30 dias
// (vencimento - 40 a vencimento - 10). Parcelas já pagas nunca são tocadas.
export async function recomputeInstallmentByVencimento(colaboradorId: string, vencimento: string): Promise<void> {
  const { data: parcela } = await supabase
    .from('finance_transactions')
    .select('id, hr_period_id, pago')
    .eq('hr_employee_id', colaboradorId)
    .eq('origem', 'hr_salario')
    .eq('vencimento', vencimento)
    .maybeSingle();
  if (!parcela || parcela.pago || !parcela.hr_period_id) return;

  const { data: contrato } = await supabase
    .from('hr_contratos')
    .select('salario_base, salario_complementar')
    .eq('id', parcela.hr_period_id)
    .maybeSingle();
  if (!contrato) return;

  const salarioTotal = contrato.salario_base + contrato.salario_complementar;
  const janelaFim = addDays(vencimento, -10);
  const janelaInicio = addDays(vencimento, -40);

  const { data: lancamentos } = await supabase
    .from('hr_caderninho')
    .select('valor, tipo')
    .eq('colaborador_id', colaboradorId)
    .gte('data', janelaInicio)
    .lte('data', janelaFim);

  const net = (lancamentos || []).reduce((sum: number, l: { valor: number; tipo: 'Despesa' | 'Receita' }) =>
    sum + (l.tipo === 'Receita' ? l.valor : -l.valor), 0);

  const novoValor = Math.max(0, salarioTotal + net);
  await supabase.from('finance_transactions').update({ valor_final: novoValor }).eq('id', parcela.id);
}

// Dado um lançamento do Caderninho (novo/editado/excluído), localiza e recalcula a(s)
// parcela(s) de salário cuja janela de 30 dias contém a data do lançamento.
export async function recomputeParcelasForCaderninhoEntry(colaboradorId: string, entryData: string): Promise<void> {
  const { data: parcelas } = await supabase
    .from('finance_transactions')
    .select('vencimento')
    .eq('hr_employee_id', colaboradorId)
    .eq('origem', 'hr_salario')
    .eq('pago', false)
    .not('vencimento', 'is', null);

  for (const p of parcelas || []) {
    const vencimento = p.vencimento as string;
    const janelaFim = addDays(vencimento, -10);
    const janelaInicio = addDays(vencimento, -40);
    if (entryData >= janelaInicio && entryData <= janelaFim) {
      await recomputeInstallmentByVencimento(colaboradorId, vencimento);
    }
  }
}
