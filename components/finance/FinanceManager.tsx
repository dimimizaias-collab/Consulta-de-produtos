'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, X, Check, Edit2, Trash2, TrendingUp, TrendingDown,
  Wallet, Search, ChevronDown, Building2, CreditCard, Upload,
  ImageIcon, Loader2, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

type PaymentType = 'Boleto' | 'Crédito' | 'Débito' | 'PIX' | 'Dinheiro' | 'Transferência' | 'Cheque' | 'Outro';
type TransactionType = 'Receita' | 'Despesa';

interface Transaction {
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
}

interface BankAccount {
  id: string;
  nome: string;
  banco: string;
  agencia: string;
  numero_conta: string;
  imagem_url: string;
}

interface Favorecido {
  id: string;
  nome_fiscal: string;
}

type TxForm = Omit<Transaction, 'id'> & { vencimento: string };

interface AccountForm {
  nome: string;
  banco: string;
  agencia: string;
  numero_conta: string;
  imagemPreview: string;
  imagemFile: File | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const PAYMENT_TYPES: PaymentType[] = ['Boleto', 'Crédito', 'Débito', 'PIX', 'Dinheiro', 'Transferência', 'Cheque', 'Outro'];
const ESTABLISHMENTS = ['Castelo Real', 'Universo do R$1,99'];
const BUCKET = 'finance-images';

const emptyTxForm = (): TxForm => ({
  data: new Date().toISOString().split('T')[0],
  tipo: 'Despesa',
  tipo_pagamento: 'PIX',
  favorecido: '',
  estabelecimento: 'Castelo Real',
  vencimento: '',
  valor_final: 0,
  total_pago: 0,
  pago: false,
});

const emptyAccountForm = (): AccountForm => ({
  nome: '', banco: '', agencia: '', numero_conta: '',
  imagemPreview: '', imagemFile: null,
});

// ── Helpers ────────────────────────────────────────────────────────────────

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (iso: string | null) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

const inputCls =
  'px-3 py-2.5 bg-surface-container rounded-xl text-sm text-on-surface border border-on-surface/5 focus:outline-none focus:border-primary/50 placeholder:text-on-surface/30 w-full';
const labelCls = 'text-[10px] font-bold uppercase tracking-widest text-on-surface/40';

// ── Component ──────────────────────────────────────────────────────────────

export function FinanceManager() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // transaction modal
  const [showTxModal, setShowTxModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [txForm, setTxForm] = useState<TxForm>(emptyTxForm());

  // bank account modal
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [accountForm, setAccountForm] = useState<AccountForm>(emptyAccountForm());

  // favorecidos dictionary
  const [showFavorecidoModal, setShowFavorecidoModal] = useState(false);
  const [favorecidos, setFavorecidos] = useState<Favorecido[]>([]);
  const [novoFavorecido, setNovoFavorecido] = useState('');
  const [savingFavorecido, setSavingFavorecido] = useState(false);
  const [loadingFavorecidos, setLoadingFavorecidos] = useState(false);

  // dropdown
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // filters
  const [filterTipo, setFilterTipo] = useState<TransactionType | 'Todos'>('Todos');
  const [filterEstab, setFilterEstab] = useState('Todos');
  const [search, setSearch] = useState('');

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchAll = async () => {
    setLoadingData(true);
    const [txRes, accRes] = await Promise.all([
      supabase.from('finance_transactions').select('*').order('data', { ascending: false }),
      supabase.from('finance_accounts').select('*').order('created_at', { ascending: false }),
    ]);
    if (txRes.data)  setTransactions(txRes.data as Transaction[]);
    if (accRes.data) setAccounts(accRes.data as BankAccount[]);
    setLoadingData(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const fetchFavorecidos = async () => {
    setLoadingFavorecidos(true);
    const { data } = await supabase
      .from('finance_favorecidos')
      .select('*')
      .order('nome_fiscal');
    if (data) setFavorecidos(data as Favorecido[]);
    setLoadingFavorecidos(false);
  };

  const handleAddFavorecido = async () => {
    if (!novoFavorecido.trim()) return;
    setSavingFavorecido(true);
    const { data } = await supabase
      .from('finance_favorecidos')
      .insert([{ nome_fiscal: novoFavorecido.trim() }])
      .select()
      .single();
    if (data) setFavorecidos(prev => [...prev, data as Favorecido].sort((a, b) => a.nome_fiscal.localeCompare(b.nome_fiscal)));
    setNovoFavorecido('');
    setSavingFavorecido(false);
  };

  const handleDeleteFavorecido = async (id: string) => {
    await supabase.from('finance_favorecidos').delete().eq('id', id);
    setFavorecidos(prev => prev.filter(f => f.id !== id));
  };

  const openFavorecidoModal = () => {
    setShowDropdown(false);
    fetchFavorecidos();
    setShowFavorecidoModal(true);
  };

  // close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Transactions CRUD ────────────────────────────────────────────────────

  const openAddTx = () => {
    setEditingId(null);
    setTxForm(emptyTxForm());
    setShowTxModal(true);
  };

  const openEditTx = (t: Transaction) => {
    setEditingId(t.id);
    setTxForm({ ...t, vencimento: t.vencimento ?? '' });
    setShowTxModal(true);
  };

  const handleTxSubmit = async () => {
    if (!txForm.favorecido.trim() || txForm.valor_final <= 0) return;
    setSubmitting(true);
    const payload = { ...txForm, vencimento: txForm.vencimento || null };
    try {
      if (editingId) {
        await supabase.from('finance_transactions').update(payload).eq('id', editingId);
      } else {
        await supabase.from('finance_transactions').insert(payload);
      }
      await fetchAll();
      setShowTxModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTx = async (id: string) => {
    await supabase.from('finance_transactions').delete().eq('id', id);
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  const togglePago = async (id: string) => {
    const t = transactions.find(t => t.id === id);
    if (!t) return;
    const next = !t.pago;
    await supabase.from('finance_transactions').update({ pago: next }).eq('id', id);
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, pago: next } : t));
  };

  // ── Bank Accounts ────────────────────────────────────────────────────────

  const openAddAccount = () => {
    setAccountForm(emptyAccountForm());
    setShowDropdown(false);
    setShowAccountModal(true);
  };

  const handleAccountImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAccountForm(f => ({ ...f, imagemFile: file, imagemPreview: URL.createObjectURL(file) }));
  };

  const uploadImage = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `accounts/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file);
    if (error) throw error;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  };

  const handleAccountSubmit = async () => {
    if (!accountForm.nome.trim()) return;
    setSubmitting(true);
    try {
      let imagem_url = '';
      if (accountForm.imagemFile) imagem_url = await uploadImage(accountForm.imagemFile);
      await supabase.from('finance_accounts').insert({
        nome: accountForm.nome,
        banco: accountForm.banco,
        agencia: accountForm.agencia,
        numero_conta: accountForm.numero_conta,
        imagem_url,
      });
      await fetchAll();
      setShowAccountModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived data ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (filterTipo !== 'Todos' && t.tipo !== filterTipo) return false;
      if (filterEstab !== 'Todos' && t.estabelecimento !== filterEstab) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!t.favorecido.toLowerCase().includes(q) && !t.estabelecimento.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [transactions, filterTipo, filterEstab, search]);

  const totals = useMemo(() => {
    const receitas = transactions.filter(t => t.tipo === 'Receita').reduce((s, t) => s + t.valor_final, 0);
    const despesas = transactions.filter(t => t.tipo === 'Despesa').reduce((s, t) => s + t.valor_final, 0);
    return { receitas, despesas, saldo: receitas - despesas };
  }, [transactions]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-manrope font-extrabold text-on-surface">Controle Financeiro</h1>
          <p className="text-sm text-on-surface/50 mt-0.5">Receitas, despesas e fluxo de caixa</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Dropdown Adicionar */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(v => !v)}
              className="flex items-center gap-2 bg-surface-container-low border border-on-surface/10 text-on-surface px-4 py-2.5 rounded-xl text-sm font-bold uppercase tracking-wide hover:bg-on-surface/5 transition-colors"
            >
              <Plus size={16} />
              Adicionar
              <ChevronDown size={14} className={cn('transition-transform duration-200', showDropdown && 'rotate-180')} />
            </button>

            <AnimatePresence>
              {showDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-52 bg-surface-container-low border border-on-surface/10 rounded-2xl shadow-xl z-30 overflow-hidden"
                >
                  <button
                    onClick={openAddAccount}
                    className="flex items-center gap-3 w-full px-4 py-3 text-sm font-semibold text-on-surface hover:bg-on-surface/5 transition-colors text-left"
                  >
                    <Building2 size={16} className="text-primary shrink-0" />
                    Adicionar Contas
                  </button>
                  <div className="h-px bg-on-surface/5 mx-3" />
                  <button
                    onClick={openFavorecidoModal}
                    className="flex items-center gap-3 w-full px-4 py-3 text-sm font-semibold text-on-surface hover:bg-on-surface/5 transition-colors text-left"
                  >
                    <Users size={16} className="text-primary shrink-0" />
                    Adicionar Favorecido
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Nova Movimentação */}
          <button
            onClick={openAddTx}
            className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2.5 rounded-xl text-sm font-bold uppercase tracking-wide shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity"
          >
            <Plus size={16} />
            Nova Movimentação
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Receitas', value: totals.receitas, color: 'emerald', icon: TrendingUp },
          { label: 'Despesas', value: totals.despesas, color: 'rose',    icon: TrendingDown },
          { label: 'Saldo',    value: totals.saldo,    color: totals.saldo >= 0 ? 'emerald' : 'rose', icon: Wallet },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="bg-surface-container-low/80 rounded-2xl p-5 border border-on-surface/5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-xl bg-${color}-500/10 flex items-center justify-center`}>
                <Icon size={18} className={`text-${color}-500`} />
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-on-surface/40">{label}</p>
            </div>
            <p className={`text-2xl font-extrabold font-manrope text-${color}-500`}>{fmt(value)}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar favorecido..."
            className="pl-8 pr-4 py-2 bg-surface-container-low rounded-xl text-sm text-on-surface placeholder:text-on-surface/30 border border-on-surface/5 focus:outline-none focus:border-primary/50 w-48"
          />
        </div>
        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value as TransactionType | 'Todos')}
          className="px-3 py-2 bg-surface-container-low rounded-xl text-sm text-on-surface border border-on-surface/5 focus:outline-none focus:border-primary/50">
          <option value="Todos">Todos os tipos</option>
          <option value="Receita">Receitas</option>
          <option value="Despesa">Despesas</option>
        </select>
        <select value={filterEstab} onChange={e => setFilterEstab(e.target.value)}
          className="px-3 py-2 bg-surface-container-low rounded-xl text-sm text-on-surface border border-on-surface/5 focus:outline-none focus:border-primary/50">
          <option value="Todos">Todos os estabelecimentos</option>
          {ESTABLISHMENTS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-surface-container-low/80 rounded-2xl border border-on-surface/5 overflow-hidden">
        {loadingData ? (
          <div className="flex items-center justify-center py-20 gap-3 text-on-surface/30">
            <Loader2 size={24} className="animate-spin" />
            <span className="text-sm font-semibold">Carregando...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-on-surface/5">
                  {['Data', 'Tipo', 'Pagamento', 'Favorecido', 'Estabelecimento', 'Vencimento', 'Valor Final', 'Total Pago', 'Restante', 'Pago', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-extrabold uppercase tracking-widest text-on-surface/40 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-16 text-center">
                      <Wallet size={40} className="mx-auto mb-3 text-on-surface/20" />
                      <p className="font-bold text-on-surface/30">Nenhuma movimentação encontrada</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(t => {
                    const restante = t.valor_final - t.total_pago;
                    return (
                      <tr key={t.id} className={cn('border-b border-on-surface/5 hover:bg-on-surface/[0.02] transition-colors', t.pago && 'opacity-60')}>
                        <td className="px-4 py-3 whitespace-nowrap text-on-surface/70">{fmtDate(t.data)}</td>
                        <td className="px-4 py-3">
                          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide',
                            t.tipo === 'Receita'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          )}>
                            {t.tipo}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-on-surface/70">{t.tipo_pagamento}</td>
                        <td className="px-4 py-3 font-semibold text-on-surface">{t.favorecido}</td>
                        <td className="px-4 py-3 text-on-surface/70">{t.estabelecimento}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-on-surface/70">{fmtDate(t.vencimento)}</td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold text-on-surface">{fmt(t.valor_final)}</td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold text-emerald-500">{fmt(t.total_pago)}</td>
                        <td className={cn('px-4 py-3 whitespace-nowrap font-semibold', restante > 0 ? 'text-rose-500' : 'text-emerald-500')}>
                          {fmt(restante)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => togglePago(t.id)}
                            className={cn('w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all',
                              t.pago ? 'bg-primary border-primary' : 'border-on-surface/20 hover:border-primary/50'
                            )}
                          >
                            {t.pago && <Check size={12} className="text-on-primary" />}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEditTx(t)} className="w-7 h-7 rounded-lg hover:bg-on-surface/5 flex items-center justify-center text-on-surface/40 hover:text-primary transition-colors">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => handleDeleteTx(t.id)} className="w-7 h-7 rounded-lg hover:bg-rose-500/10 flex items-center justify-center text-on-surface/40 hover:text-rose-500 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Transaction Modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showTxModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowTxModal(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container-low rounded-3xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-manrope font-extrabold text-on-surface">
                  {editingId ? 'Editar Movimentação' : 'Nova Movimentação'}
                </h2>
                <button onClick={() => setShowTxModal(false)} className="w-8 h-8 rounded-xl hover:bg-on-surface/5 flex items-center justify-center text-on-surface/40">
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Data</label>
                  <input type="date" value={txForm.data} onChange={e => setTxForm(f => ({ ...f, data: e.target.value }))} className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Vencimento</label>
                  <input type="date" value={txForm.vencimento ?? ''} onChange={e => setTxForm(f => ({ ...f, vencimento: e.target.value }))} className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Tipo</label>
                  <select value={txForm.tipo} onChange={e => setTxForm(f => ({ ...f, tipo: e.target.value as TransactionType }))} className={inputCls}>
                    <option value="Despesa">Despesa</option>
                    <option value="Receita">Receita</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Tipo de Pagamento</label>
                  <select value={txForm.tipo_pagamento} onChange={e => setTxForm(f => ({ ...f, tipo_pagamento: e.target.value as PaymentType }))} className={inputCls}>
                    {PAYMENT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="col-span-2 flex flex-col gap-1.5">
                  <label className={labelCls}>Favorecido</label>
                  <input type="text" value={txForm.favorecido} onChange={e => setTxForm(f => ({ ...f, favorecido: e.target.value }))} placeholder="Nome do favorecido" className={inputCls} />
                </div>
                <div className="col-span-2 flex flex-col gap-1.5">
                  <label className={labelCls}>Estabelecimento</label>
                  <select value={txForm.estabelecimento} onChange={e => setTxForm(f => ({ ...f, estabelecimento: e.target.value }))} className={inputCls}>
                    {ESTABLISHMENTS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Valor Final (R$)</label>
                  <input type="number" step="0.01" min="0" value={txForm.valor_final || ''} onChange={e => setTxForm(f => ({ ...f, valor_final: parseFloat(e.target.value) || 0 }))} placeholder="0,00" className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Total Pago (R$)</label>
                  <input type="number" step="0.01" min="0" value={txForm.total_pago || ''} onChange={e => setTxForm(f => ({ ...f, total_pago: parseFloat(e.target.value) || 0 }))} placeholder="0,00" className={inputCls} />
                </div>
                <div className="col-span-2 flex items-center gap-3">
                  <button
                    onClick={() => setTxForm(f => ({ ...f, pago: !f.pago }))}
                    className={cn('w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0',
                      txForm.pago ? 'bg-primary border-primary' : 'border-on-surface/20'
                    )}
                  >
                    {txForm.pago && <Check size={12} className="text-on-primary" />}
                  </button>
                  <span className="text-sm text-on-surface/70 font-medium">Marcar como pago</span>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowTxModal(false)} className="flex-1 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface/60 hover:bg-on-surface/5 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleTxSubmit} disabled={submitting} className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  {editingId ? 'Salvar Alterações' : 'Adicionar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Bank Account Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAccountModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAccountModal(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container-low rounded-3xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Building2 size={18} className="text-primary" />
                  </div>
                  <h2 className="text-lg font-manrope font-extrabold text-on-surface">Cadastrar Conta</h2>
                </div>
                <button onClick={() => setShowAccountModal(false)} className="w-8 h-8 rounded-xl hover:bg-on-surface/5 flex items-center justify-center text-on-surface/40">
                  <X size={16} />
                </button>
              </div>

              <div className="flex flex-col gap-4">
                {/* Image upload */}
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Imagem da Conta</label>
                  <label className="cursor-pointer group">
                    <input type="file" accept="image/*" className="hidden" onChange={handleAccountImageChange} />
                    {accountForm.imagemPreview ? (
                      <div className="relative w-full h-32 rounded-2xl overflow-hidden border border-on-surface/10">
                        <img src={accountForm.imagemPreview} alt="Preview" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Upload size={20} className="text-white" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-32 rounded-2xl border-2 border-dashed border-on-surface/10 flex flex-col items-center justify-center gap-2 text-on-surface/30 hover:border-primary/40 hover:text-primary/50 transition-colors">
                        <ImageIcon size={28} />
                        <span className="text-xs font-semibold">Clique para adicionar imagem</span>
                      </div>
                    )}
                  </label>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Nome da Conta</label>
                  <input type="text" value={accountForm.nome} onChange={e => setAccountForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Conta Corrente PF" className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Banco</label>
                  <input type="text" value={accountForm.banco} onChange={e => setAccountForm(f => ({ ...f, banco: e.target.value }))} placeholder="Ex: Banco do Brasil" className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Agência</label>
                    <input type="text" value={accountForm.agencia} onChange={e => setAccountForm(f => ({ ...f, agencia: e.target.value }))} placeholder="0000-0" className={inputCls} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls}>Número da Conta</label>
                    <input type="text" value={accountForm.numero_conta} onChange={e => setAccountForm(f => ({ ...f, numero_conta: e.target.value }))} placeholder="00000-0" className={inputCls} />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowAccountModal(false)} className="flex-1 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface/60 hover:bg-on-surface/5 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleAccountSubmit} disabled={submitting} className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  Cadastrar Conta
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Favorecidos Dictionary Modal ───────────────────────────────────── */}
      <AnimatePresence>
        {showFavorecidoModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowFavorecidoModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface-container-low rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Users size={18} className="text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-manrope font-extrabold text-on-surface leading-tight">Dicionário de Favorecidos</h2>
                    <p className="text-[11px] text-on-surface/40 font-medium">Nomes fiscais para controle de movimentações</p>
                  </div>
                </div>
                <button onClick={() => setShowFavorecidoModal(false)} className="w-8 h-8 rounded-xl hover:bg-on-surface/5 flex items-center justify-center text-on-surface/40">
                  <X size={16} />
                </button>
              </div>

              {/* Add new */}
              <div className="flex gap-2 mb-5 shrink-0">
                <input
                  type="text"
                  value={novoFavorecido}
                  onChange={e => setNovoFavorecido(e.target.value)}
                  onKeyUp={e => e.key === 'Enter' && handleAddFavorecido()}
                  placeholder="Nome fiscal do favorecido..."
                  className={inputCls}
                />
                <button
                  onClick={handleAddFavorecido}
                  disabled={savingFavorecido || !novoFavorecido.trim()}
                  className="shrink-0 w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {savingFavorecido
                    ? <Loader2 size={16} className="animate-spin" />
                    : <Plus size={16} />
                  }
                </button>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                {loadingFavorecidos ? (
                  <div className="flex items-center justify-center py-10 gap-2 text-on-surface/30">
                    <Loader2 size={20} className="animate-spin" />
                    <span className="text-sm font-semibold">Carregando...</span>
                  </div>
                ) : favorecidos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-on-surface/25">
                    <Users size={36} className="mb-2" />
                    <p className="text-sm font-bold">Nenhum favorecido cadastrado</p>
                  </div>
                ) : (
                  favorecidos.map(f => (
                    <div key={f.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-on-surface/[0.03] group transition-colors">
                      <span className="text-sm font-semibold text-on-surface">{f.nome_fiscal}</span>
                      <button
                        onClick={() => handleDeleteFavorecido(f.id)}
                        className="w-7 h-7 rounded-lg hover:bg-rose-500/10 flex items-center justify-center text-on-surface/20 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <p className="text-[10px] text-on-surface/25 font-medium mt-4 shrink-0">
                {favorecidos.length} {favorecidos.length === 1 ? 'favorecido cadastrado' : 'favorecidos cadastrados'}
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
