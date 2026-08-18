// Tipos compartilhados do módulo Controle Financeiro.
// Usado por FinanceManager.tsx (desktop) e MobileFinancePage.tsx (mobile) para evitar
// que os dois lados divirjam ao adicionar campos novos (ex: cartão de crédito/fatura).

export type PaymentType = 'Boleto' | 'Crédito' | 'Débito' | 'PIX' | 'Dinheiro' | 'Transferência' | 'Cheque' | 'Outro';
export type TransactionType = 'Receita' | 'Despesa';

export interface Transaction {
  id: string;
  data: string;
  tipo: TransactionType;
  tipo_pagamento: PaymentType;
  favorecido: string;
  estabelecimento: string;
  vencimento: string | null;
  valor_final: number;
  total_pago: number;
  pago: boolean;
  numero_cheque: string | null;
  identificacao: string | null;
  numero_parcela: number | null;
  total_parcelas: number | null;
  parcelamento_id: string | null;
  codigo_barras: string | null;
  import_id?: string | null;
  account_id?: string | null;
  tag_ids: string[];
  observacoes: string | null;
  origem?: 'manual' | 'hr_salario';
  data_pagamento?: string | null;
  codigo?: string | null;
  codigo_numero?: number | null;
  /** Cartão de crédito usado (só quando tipo_pagamento === 'Crédito'). */
  card_id?: string | null;
  /** Primeiro dia do mês/ano da fatura à qual esta movimentação pertence (ex: 2026-08-01). */
  fatura_periodo?: string | null;
  /** TRUE para a linha-resumo mensal de uma fatura de cartão na tabela comum. */
  is_fatura_consolidada?: boolean;
  /** Valor real da fatura, digitado manualmente pelo usuário a partir do app do banco. */
  valor_real?: number | null;
  /** Quando TRUE, o campo "Valor" da fatura exibe valor_real em vez do total consolidado. */
  usar_valor_real?: boolean;
}

export interface BankAccount {
  id: string;
  nome: string;
  banco: string;
  agencia: string;
  numero_conta: string;
  imagem_url: string;
  saldo_inicial: number;
}

export interface FinanceCard {
  id: string;
  account_id: string;
  nome: string;
  dia_fechamento: number;
  dia_vencimento: number;
  limite: number | null;
  codigo: string;
  created_at?: string;
}

export interface Favorecido {
  id: string;
  nome_fiscal: string;
  nome_banco: string;
  supplier_id: string | null;
}

export interface Supplier {
  id: string;
  name: string;
}
