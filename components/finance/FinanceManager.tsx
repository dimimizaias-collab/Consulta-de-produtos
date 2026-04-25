'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, Check, Edit2, Trash2, TrendingUp, TrendingDown, Wallet, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type PaymentType = 'Boleto' | 'Crédito' | 'Débito' | 'PIX' | 'Dinheiro' | 'Transferência' | 'Cheque' | 'Outro';
type TransactionType = 'Receita' | 'Despesa';

interface Transaction {
  id: string;
  data: string;
  tipo: TransactionType;
  tipoPagamento: PaymentType;
  favorecido: string;
  estabelecimento: string;
  vencimento: string;
  valorFinal: number;
  totalPago: number;
  pago: boolean;
}

const STORAGE_KEY = 'finance_transactions';
const PAYMENT_TYPES: PaymentType[] = ['Boleto', 'Crédito', 'Débito', 'PIX', 'Dinheiro', 'Transferência', 'Cheque', 'Outro'];
const ESTABLISHMENTS = ['Castelo Real', 'Universo do R$1,99'];

const emptyForm = (): Omit<Transaction, 'id'> => ({
  data: new Date().toISOString().split('T')[0],
  tipo: 'Despesa',
  tipoPagamento: 'PIX',
  favorecido: '',
  estabelecimento: 'Castelo Real',
  vencimento: '',
  valorFinal: 0,
  totalPago: 0,
  pago: false,
});

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (iso: string) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

const inputCls =
  'px-3 py-2.5 bg-surface-container rounded-xl text-sm text-on-surface border border-on-surface/5 focus:outline-none focus:border-primary/50 placeholder:text-on-surface/30 w-full';

export function FinanceManager() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [filterTipo, setFilterTipo] = useState<TransactionType | 'Todos'>('Todos');
  const [filterEstab, setFilterEstab] = useState('Todos');
  const [search, setSearch] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setTransactions(JSON.parse(stored));
    } catch {}
  }, []);

  const persist = (data: Transaction[]) => {
    setTransactions(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowModal(true);
  };

  const openEdit = (t: Transaction) => {
    setEditingId(t.id);
    setForm({ data: t.data, tipo: t.tipo, tipoPagamento: t.tipoPagamento, favorecido: t.favorecido, estabelecimento: t.estabelecimento, vencimento: t.vencimento, valorFinal: t.valorFinal, totalPago: t.totalPago, pago: t.pago });
    setShowModal(true);
  };

  const handleSubmit = () => {
    if (!form.favorecido.trim() || form.valorFinal <= 0) return;
    if (editingId) {
      persist(transactions.map(t => t.id === editingId ? { ...form, id: editingId } : t));
    } else {
      persist([...transactions, { ...form, id: crypto.randomUUID() }]);
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => persist(transactions.filter(t => t.id !== id));

  const togglePago = (id: string) =>
    persist(transactions.map(t => t.id === id ? { ...t, pago: !t.pago } : t));

  const filtered = useMemo(() => {
    return transactions
      .filter(t => {
        if (filterTipo !== 'Todos' && t.tipo !== filterTipo) return false;
        if (filterEstab !== 'Todos' && t.estabelecimento !== filterEstab) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!t.favorecido.toLowerCase().includes(q) && !t.estabelecimento.toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [transactions, filterTipo, filterEstab, search]);

  const totals = useMemo(() => {
    const receitas = transactions.filter(t => t.tipo === 'Receita').reduce((s, t) => s + t.valorFinal, 0);
    const despesas = transactions.filter(t => t.tipo === 'Despesa').reduce((s, t) => s + t.valorFinal, 0);
    return { receitas, despesas, saldo: receitas - despesas };
  }, [transactions]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-manrope font-extrabold text-on-surface">Controle Financeiro</h1>
          <p className="text-sm text-on-surface/50 mt-0.5">Receitas, despesas e fluxo de caixa</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2.5 rounded-xl text-sm font-bold uppercase tracking-wide shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity"
        >
          <Plus size={16} />
          Nova Movimentação
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface-container-low/80 rounded-2xl p-5 border border-on-surface/5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp size={18} className="text-emerald-500" />
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface/40">Receitas</p>
          </div>
          <p className="text-2xl font-extrabold font-manrope text-emerald-500">{fmt(totals.receitas)}</p>
        </div>
        <div className="bg-surface-container-low/80 rounded-2xl p-5 border border-on-surface/5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center">
              <TrendingDown size={18} className="text-rose-500" />
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface/40">Despesas</p>
          </div>
          <p className="text-2xl font-extrabold font-manrope text-rose-500">{fmt(totals.despesas)}</p>
        </div>
        <div className="bg-surface-container-low/80 rounded-2xl p-5 border border-on-surface/5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Wallet size={18} className="text-primary" />
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface/40">Saldo</p>
          </div>
          <p className={cn('text-2xl font-extrabold font-manrope', totals.saldo >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
            {fmt(totals.saldo)}
          </p>
        </div>
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
        <select
          value={filterTipo}
          onChange={e => setFilterTipo(e.target.value as TransactionType | 'Todos')}
          className="px-3 py-2 bg-surface-container-low rounded-xl text-sm text-on-surface border border-on-surface/5 focus:outline-none focus:border-primary/50"
        >
          <option value="Todos">Todos os tipos</option>
          <option value="Receita">Receitas</option>
          <option value="Despesa">Despesas</option>
        </select>
        <select
          value={filterEstab}
          onChange={e => setFilterEstab(e.target.value)}
          className="px-3 py-2 bg-surface-container-low rounded-xl text-sm text-on-surface border border-on-surface/5 focus:outline-none focus:border-primary/50"
        >
          <option value="Todos">Todos os estabelecimentos</option>
          {ESTABLISHMENTS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-surface-container-low/80 rounded-2xl border border-on-surface/5 overflow-hidden">
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
                  const restante = t.valorFinal - t.totalPago;
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
                      <td className="px-4 py-3 text-on-surface/70">{t.tipoPagamento}</td>
                      <td className="px-4 py-3 font-semibold text-on-surface">{t.favorecido}</td>
                      <td className="px-4 py-3 text-on-surface/70">{t.estabelecimento}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-on-surface/70">{fmtDate(t.vencimento)}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-semibold text-on-surface">{fmt(t.valorFinal)}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-semibold text-emerald-500">{fmt(t.totalPago)}</td>
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
                          <button onClick={() => openEdit(t)} className="w-7 h-7 rounded-lg hover:bg-on-surface/5 flex items-center justify-center text-on-surface/40 hover:text-primary transition-colors">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDelete(t.id)} className="w-7 h-7 rounded-lg hover:bg-rose-500/10 flex items-center justify-center text-on-surface/40 hover:text-rose-500 transition-colors">
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
      </div>

      {/* Add / Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowModal(false)}
            />
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
                <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-xl hover:bg-on-surface/5 flex items-center justify-center text-on-surface/40">
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface/40">Data</label>
                  <input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface/40">Vencimento</label>
                  <input type="date" value={form.vencimento} onChange={e => setForm(f => ({ ...f, vencimento: e.target.value }))} className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface/40">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TransactionType }))} className={inputCls}>
                    <option value="Despesa">Despesa</option>
                    <option value="Receita">Receita</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface/40">Tipo de Pagamento</label>
                  <select value={form.tipoPagamento} onChange={e => setForm(f => ({ ...f, tipoPagamento: e.target.value as PaymentType }))} className={inputCls}>
                    {PAYMENT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="col-span-2 flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface/40">Favorecido</label>
                  <input type="text" value={form.favorecido} onChange={e => setForm(f => ({ ...f, favorecido: e.target.value }))} placeholder="Nome do favorecido" className={inputCls} />
                </div>
                <div className="col-span-2 flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface/40">Estabelecimento</label>
                  <select value={form.estabelecimento} onChange={e => setForm(f => ({ ...f, estabelecimento: e.target.value }))} className={inputCls}>
                    {ESTABLISHMENTS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface/40">Valor Final (R$)</label>
                  <input type="number" step="0.01" min="0" value={form.valorFinal || ''} onChange={e => setForm(f => ({ ...f, valorFinal: parseFloat(e.target.value) || 0 }))} placeholder="0,00" className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface/40">Total Pago (R$)</label>
                  <input type="number" step="0.01" min="0" value={form.totalPago || ''} onChange={e => setForm(f => ({ ...f, totalPago: parseFloat(e.target.value) || 0 }))} placeholder="0,00" className={inputCls} />
                </div>
                <div className="col-span-2 flex items-center gap-3">
                  <button
                    onClick={() => setForm(f => ({ ...f, pago: !f.pago }))}
                    className={cn('w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0',
                      form.pago ? 'bg-primary border-primary' : 'border-on-surface/20'
                    )}
                  >
                    {form.pago && <Check size={12} className="text-on-primary" />}
                  </button>
                  <span className="text-sm text-on-surface/70 font-medium">Marcar como pago</span>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl border border-on-surface/10 text-sm font-bold text-on-surface/60 hover:bg-on-surface/5 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleSubmit} className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity">
                  {editingId ? 'Salvar Alterações' : 'Adicionar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
