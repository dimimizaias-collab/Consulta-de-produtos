'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Check, Trash2, Lock, Search, Calendar, Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { type Employee } from '@/lib/hrEmployees';
import { recomputeParcelasForCaderninhoEntry } from '@/lib/hrSalarioFinance';

type Modalidade = 'Mercadoria' | 'Vale' | 'Bônus' | 'Outros';
type TipoLancamento = 'Despesa' | 'Receita';

interface CaderninhoEntry {
  id: string;
  colaborador_id: string | null;
  colaborador_nome: string | null;
  modalidade: Modalidade;
  tipo: TipoLancamento;
  valor: number;
  observacao: string | null;
  data: string;
  created_at: string;
}

interface PendingRow {
  localId: string;
  colaborador_id: string;
  modalidade: Modalidade;
  tipo: TipoLancamento;
  valor: string;
  observacao: string;
  data: string;
  saving: boolean;
  error: string | null;
}

interface CaderninhoTableProps {
  employees: Employee[];
  compact?: boolean;
}

const MODALIDADES: Modalidade[] = ['Mercadoria', 'Vale', 'Bônus', 'Outros'];

// Modalidade que trava o Tipo automaticamente. "Outros" fica livre para o usuário escolher.
const TIPO_AUTOMATICO: Partial<Record<Modalidade, TipoLancamento>> = {
  Mercadoria: 'Despesa',
  Vale: 'Despesa',
  Bônus: 'Receita',
};

const fmtMoney = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d: string) => {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

const todayStr = () => new Date().toISOString().split('T')[0];

function makePending(): PendingRow {
  return {
    localId: crypto.randomUUID(),
    colaborador_id: '',
    modalidade: 'Mercadoria',
    tipo: 'Despesa',
    valor: '',
    observacao: '',
    data: todayStr(),
    saving: false,
    error: null,
  };
}

const modalidadeColor = (m: string) => {
  if (m === 'Vale') return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
  if (m === 'Mercadoria') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
  if (m === 'Bônus') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
  return 'bg-gray-500/15 text-gray-600 dark:text-gray-400';
};

const tipoColor = (t: TipoLancamento) =>
  t === 'Receita' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/15 text-red-600 dark:text-red-400';

export function CaderninhoTable({ employees, compact = false }: CaderninhoTableProps) {
  const [entries, setEntries] = useState<CaderninhoEntry[]>([]);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Mobile (compact): busca/filtro/adicionar via sheet ────────────────────
  const [search, setSearch] = useState('');
  const [filterModalidade, setFilterModalidade] = useState<Modalidade | null>(null);
  const [filterTipo, setFilterTipo] = useState<TipoLancamento | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showCalSheet, setShowCalSheet] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [draft, setDraft] = useState<PendingRow>(() => makePending());

  const hasDatePeriod = !!(dateFrom || dateTo);
  const hasFilter = filterModalidade !== null || filterTipo !== null;

  const openAddSheet = () => {
    setDraft(makePending());
    setShowAddSheet(true);
  };

  const changeDraftModalidade = (modalidade: Modalidade) => {
    const auto = TIPO_AUTOMATICO[modalidade];
    setDraft(prev => ({ ...prev, modalidade, ...(auto ? { tipo: auto } : {}) }));
  };

  const confirmDraft = async () => {
    const val = parseFloat(draft.valor.replace(',', '.'));
    if (!draft.colaborador_id) {
      setDraft(prev => ({ ...prev, error: 'Selecione um colaborador.' }));
      return;
    }
    if (!draft.valor || isNaN(val) || val <= 0) {
      setDraft(prev => ({ ...prev, error: 'Informe um valor válido.' }));
      return;
    }
    if (!draft.data) {
      setDraft(prev => ({ ...prev, error: 'Informe a data.' }));
      return;
    }

    setDraft(prev => ({ ...prev, saving: true, error: null }));

    const emp = employees.find(e => e.id === draft.colaborador_id);
    const { error } = await supabase.from('hr_caderninho').insert([{
      colaborador_id: draft.colaborador_id,
      colaborador_nome: emp?.nome || null,
      modalidade: draft.modalidade,
      tipo: draft.tipo,
      valor: val,
      observacao: draft.observacao.trim() || null,
      data: draft.data,
    }]);

    if (error) {
      setDraft(prev => ({ ...prev, saving: false, error: 'Erro ao salvar. Tente novamente.' }));
      return;
    }

    setShowAddSheet(false);
    fetchEntries();
    recomputeParcelasForCaderninhoEntry(draft.colaborador_id, draft.data);
  };

  const fetchEntries = async () => {
    const { data } = await supabase
      .from('hr_caderninho')
      .select('*')
      .order('data', { ascending: false });
    setEntries((data as CaderninhoEntry[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchEntries(); }, []);

  const addPending = () => setPending(prev => [...prev, makePending()]);

  const updatePending = (localId: string, patch: Partial<PendingRow>) =>
    setPending(prev => prev.map(r => r.localId === localId ? { ...r, ...patch } : r));

  const changeModalidade = (localId: string, modalidade: Modalidade) => {
    const auto = TIPO_AUTOMATICO[modalidade];
    updatePending(localId, auto ? { modalidade, tipo: auto } : { modalidade });
  };

  const removePending = (localId: string) =>
    setPending(prev => prev.filter(r => r.localId !== localId));

  const confirmRow = async (row: PendingRow) => {
    const val = parseFloat(row.valor.replace(',', '.'));
    if (!row.colaborador_id) {
      updatePending(row.localId, { error: 'Selecione um colaborador.' });
      return;
    }
    if (!row.valor || isNaN(val) || val <= 0) {
      updatePending(row.localId, { error: 'Informe um valor válido.' });
      return;
    }
    if (!row.data) {
      updatePending(row.localId, { error: 'Informe a data.' });
      return;
    }

    updatePending(row.localId, { saving: true, error: null });

    const emp = employees.find(e => e.id === row.colaborador_id);
    const { error } = await supabase.from('hr_caderninho').insert([{
      colaborador_id: row.colaborador_id,
      colaborador_nome: emp?.nome || null,
      modalidade: row.modalidade,
      tipo: row.tipo,
      valor: val,
      observacao: row.observacao.trim() || null,
      data: row.data,
    }]);

    if (error) {
      updatePending(row.localId, { saving: false, error: 'Erro ao salvar. Tente novamente.' });
      return;
    }

    removePending(row.localId);
    fetchEntries();
    recomputeParcelasForCaderninhoEntry(row.colaborador_id, row.data);
  };

  const deleteEntry = async (entry: CaderninhoEntry) => {
    await supabase.from('hr_caderninho').delete().eq('id', entry.id);
    setEntries(prev => prev.filter(e => e.id !== entry.id));
    if (entry.colaborador_id) recomputeParcelasForCaderninhoEntry(entry.colaborador_id, entry.data);
  };

  // ── Mobile (compact) layout ──────────────────────────────────────────────
  if (compact) {
    const fieldCls = 'w-full bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]';
    const labelCls = 'text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block';
    const iconBtnCls = 'w-9 h-9 rounded-xl border-[1.5px] flex items-center justify-center active:scale-90 transition-all shrink-0';
    const iconBtnOffCls = 'bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.07] border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] text-[rgba(26,26,10,0.45)] dark:text-white/40';
    const iconBtnOnCls = 'bg-[rgba(216,30,30,0.10)] border-[rgba(216,30,30,0.20)] text-[#D81E1E]';

    const filteredEntries = entries.filter(entry => {
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matches = (entry.colaborador_nome || '').toLowerCase().includes(q)
          || (entry.observacao || '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (filterModalidade && entry.modalidade !== filterModalidade) return false;
      if (filterTipo && entry.tipo !== filterTipo) return false;
      if (dateFrom && entry.data < dateFrom) return false;
      if (dateTo && entry.data > dateTo) return false;
      return true;
    });

    return (
      <div className="flex flex-col h-full">
        {/* Action row — busca, calendário, filtro, adicionar */}
        <div className="shrink-0 flex gap-2 px-3 pt-3 pb-2.5 items-center">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgba(26,26,10,0.30)] dark:text-white/25 pointer-events-none" />
            <input
              className="w-full bg-white dark:bg-[#252520] border-[1.5px] border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] rounded-2xl pl-8 pr-3 py-2 text-[13px] text-[rgba(26,26,10,0.55)] dark:text-white/40 font-medium focus:outline-none placeholder:text-[rgba(26,26,10,0.28)] dark:placeholder:text-white/20"
              placeholder="Buscar colaborador..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button onClick={() => setShowCalSheet(true)} className={cn(iconBtnCls, hasDatePeriod ? iconBtnOnCls : iconBtnOffCls)} title="Calendário">
            <Calendar size={14} />
          </button>
          <button onClick={() => setShowFilterSheet(true)} className={cn(iconBtnCls, hasFilter ? iconBtnOnCls : iconBtnOffCls)} title="Filtrar">
            <Filter size={14} />
          </button>
          <button
            onClick={openAddSheet}
            className="w-9 h-9 rounded-xl bg-[#D81E1E] flex items-center justify-center shadow-[0_4px_14px_rgba(216,30,30,0.32)] active:scale-90 transition-transform shrink-0"
            title="Adicionar"
          >
            <Plus size={16} color="white" strokeWidth={2.8} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-6 flex flex-col gap-3">
          {loading ? (
            <div className="py-8 flex justify-center">
              <div className="w-5 h-5 border-2 border-[#D81E1E] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredEntries.length === 0 ? (
            <p className="text-sm text-center py-6 text-[rgba(26,26,10,0.35)] dark:text-white/30">
              {entries.length === 0 ? 'Nenhum registro ainda.' : 'Nenhum registro encontrado.'}
            </p>
          ) : (
            filteredEntries.map(entry => (
              <div
                key={entry.id}
                className="bg-white dark:bg-[#252520] border border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] rounded-[18px] px-4 py-3.5 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3]">
                    {entry.colaborador_nome || '—'}
                  </span>
                  <button
                    onClick={() => deleteEntry(entry)}
                    className="w-7 h-7 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('text-[9.5px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-lg', tipoColor(entry.tipo))}>
                    {entry.tipo}
                  </span>
                  <span className={cn('text-[9.5px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-lg', modalidadeColor(entry.modalidade))}>
                    {entry.modalidade}
                  </span>
                  <span className="text-[13px] font-bold text-[#1A1A0E] dark:text-[#F2F0E3]">
                    {fmtMoney(entry.valor)}
                  </span>
                  <span className="text-[11px] text-[rgba(26,26,10,0.40)] dark:text-white/30 ml-auto">
                    {fmtDate(entry.data)}
                  </span>
                </div>
                {entry.observacao && (
                  <p className="text-[11px] text-[rgba(26,26,10,0.50)] dark:text-white/40">
                    {entry.observacao}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        {/*
          Sheets renderizados via portal para document.body: CaderninhoTable fica
          aninhado dentro do container fixed z-40 de MobileHRPage, então qualquer
          z-index local ficaria preso abaixo do BottomNav (z-50). O portal escapa
          totalmente da árvore DOM/stacking context do pai.
        */}
        {typeof window !== 'undefined' && createPortal(
          <>
            {/* Sheet: Novo Lançamento */}
            {showAddSheet && (
              <>
                <div className="fixed inset-0 bg-black/55 z-[100]" onClick={() => setShowAddSheet(false)} />
                <div
                  className="fixed inset-x-0 bottom-0 z-[110] bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-t-[28px] shadow-2xl overflow-y-auto overflow-x-hidden p-5"
                  style={{ maxHeight: '92svh' }}
                >
                  <div className="flex justify-center pb-2 -mt-1">
                    <div className="w-10 h-1 rounded-full bg-[rgba(26,26,10,0.15)] dark:bg-white/20" />
                  </div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[16px] font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3]">Novo Lançamento</span>
                    <button onClick={() => setShowAddSheet(false)} className="w-[30px] h-[30px] rounded-[10px] bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.06] flex items-center justify-center text-[rgba(26,26,10,0.45)] dark:text-white/40">
                      <X size={14} strokeWidth={2.5} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <span className={labelCls}>Colaborador</span>
                      <select
                        className={fieldCls}
                        value={draft.colaborador_id}
                        onChange={e => setDraft(prev => ({ ...prev, colaborador_id: e.target.value }))}
                      >
                        <option value="">Selecionar...</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.nome}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className={labelCls}>Modalidade</span>
                      <select
                        className={fieldCls}
                        value={draft.modalidade}
                        onChange={e => changeDraftModalidade(e.target.value as Modalidade)}
                      >
                        {MODALIDADES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="mb-3">
                    <span className={labelCls}>Tipo</span>
                    {TIPO_AUTOMATICO[draft.modalidade] ? (
                      <div className={cn('flex items-center gap-1.5 w-fit text-[10.5px] font-extrabold uppercase tracking-wide px-2.5 py-1.5 rounded-lg', tipoColor(draft.tipo))}>
                        <Lock size={9} strokeWidth={3} /> {draft.tipo}
                      </div>
                    ) : (
                      <div className="flex gap-1.5">
                        {(['Despesa', 'Receita'] as TipoLancamento[]).map(t => (
                          <button
                            key={t} onClick={() => setDraft(prev => ({ ...prev, tipo: t }))}
                            className={cn(
                              'flex-1 py-2 rounded-lg text-[10.5px] font-extrabold uppercase tracking-wide border-[1.5px] transition-colors',
                              draft.tipo === t ? tipoColor(t) : 'border-[rgba(26,26,10,0.12)] dark:border-white/10 text-[rgba(26,26,10,0.40)] dark:text-white/35',
                            )}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mb-3">
                    <span className={labelCls}>Valor (R$)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className={cn(fieldCls, 'no-spinner')}
                      placeholder="0,00"
                      value={draft.valor}
                      onChange={e => setDraft(prev => ({ ...prev, valor: e.target.value }))}
                    />
                  </div>
                  <div className="mb-3">
                    <span className={labelCls}>Data</span>
                    <input
                      type="date"
                      className={fieldCls}
                      value={draft.data}
                      onChange={e => setDraft(prev => ({ ...prev, data: e.target.value }))}
                    />
                  </div>

                  <div className="mb-4">
                    <span className={labelCls}>Observação</span>
                    <input
                      type="text"
                      className={fieldCls}
                      placeholder="Opcional"
                      value={draft.observacao}
                      onChange={e => setDraft(prev => ({ ...prev, observacao: e.target.value }))}
                    />
                  </div>

                  {draft.error && (
                    <p className="text-[11px] text-red-500 font-semibold mb-3">{draft.error}</p>
                  )}

                  <button
                    onClick={confirmDraft}
                    disabled={draft.saving}
                    className="w-full py-3.5 rounded-[13px] text-[12.5px] font-extrabold uppercase tracking-wide bg-[#D81E1E] text-white shadow-[0_10px_22px_rgba(216,30,30,0.28)] flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {draft.saving
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><Check size={14} strokeWidth={2.8} /> Salvar Lançamento</>
                    }
                  </button>
                </div>
              </>
            )}

            {/* Sheet: Calendário (período) */}
            {showCalSheet && (
              <>
                <div className="fixed inset-0 bg-black/55 z-[100]" onClick={() => setShowCalSheet(false)} />
                <div className="fixed inset-x-0 bottom-0 z-[110] bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-t-[28px] shadow-2xl overflow-x-hidden p-5">
                  <div className="flex justify-center pb-2 -mt-1">
                    <div className="w-10 h-1 rounded-full bg-[rgba(26,26,10,0.15)] dark:bg-white/20" />
                  </div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[16px] font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3]">Filtrar por Data</span>
                    <button onClick={() => setShowCalSheet(false)} className="w-[30px] h-[30px] rounded-[10px] bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.06] flex items-center justify-center text-[rgba(26,26,10,0.45)] dark:text-white/40">
                      <X size={14} strokeWidth={2.5} />
                    </button>
                  </div>
                  <div className="flex flex-col gap-3 mb-4">
                    <div className="w-full">
                      <span className={labelCls}>De</span>
                      <input type="date" className={fieldCls} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                    </div>
                    <div className="w-full">
                      <span className={labelCls}>Até</span>
                      <input type="date" className={fieldCls} value={dateTo} onChange={e => setDateTo(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setDateFrom(''); setDateTo(''); }}
                      className="flex-1 py-3 rounded-[13px] text-[11.5px] font-extrabold uppercase tracking-wide bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.06] text-[rgba(26,26,10,0.50)] dark:text-white/40"
                    >
                      Limpar
                    </button>
                    <button
                      onClick={() => setShowCalSheet(false)}
                      className="flex-[2] py-3 rounded-[13px] text-[11.5px] font-extrabold uppercase tracking-wide bg-[#D81E1E] text-white shadow-[0_8px_18px_rgba(216,30,30,0.30)]"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Sheet: Filtro (modalidade/tipo) */}
            {showFilterSheet && (
              <>
                <div className="fixed inset-0 bg-black/55 z-[100]" onClick={() => setShowFilterSheet(false)} />
                <div className="fixed inset-x-0 bottom-0 z-[110] bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-t-[28px] shadow-2xl overflow-x-hidden p-5">
                  <div className="flex justify-center pb-2 -mt-1">
                    <div className="w-10 h-1 rounded-full bg-[rgba(26,26,10,0.15)] dark:bg-white/20" />
                  </div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[16px] font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3]">Filtrar</span>
                    <button onClick={() => setShowFilterSheet(false)} className="w-[30px] h-[30px] rounded-[10px] bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.06] flex items-center justify-center text-[rgba(26,26,10,0.45)] dark:text-white/40">
                      <X size={14} strokeWidth={2.5} />
                    </button>
                  </div>

                  <span className={labelCls}>Modalidade</span>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {MODALIDADES.map(m => (
                      <button
                        key={m} onClick={() => setFilterModalidade(prev => prev === m ? null : m)}
                        className={cn(
                          'px-3 py-2 rounded-[10px] text-[10.5px] font-bold border-[1.5px] transition-colors',
                          filterModalidade === m
                            ? 'bg-[rgba(216,30,30,0.10)] border-[rgba(216,30,30,0.30)] text-[#D81E1E]'
                            : 'border-[rgba(26,26,10,0.10)] dark:border-white/[0.08] text-[rgba(26,26,10,0.45)] dark:text-white/35',
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>

                  <span className={labelCls}>Tipo</span>
                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {(['Despesa', 'Receita'] as TipoLancamento[]).map(t => (
                      <button
                        key={t} onClick={() => setFilterTipo(prev => prev === t ? null : t)}
                        className={cn(
                          'px-3 py-2 rounded-[10px] text-[10.5px] font-bold border-[1.5px] transition-colors',
                          filterTipo === t
                            ? 'bg-[rgba(216,30,30,0.10)] border-[rgba(216,30,30,0.30)] text-[#D81E1E]'
                            : 'border-[rgba(26,26,10,0.10)] dark:border-white/[0.08] text-[rgba(26,26,10,0.45)] dark:text-white/35',
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => { setFilterModalidade(null); setFilterTipo(null); }}
                      className="flex-1 py-3 rounded-[13px] text-[11.5px] font-extrabold uppercase tracking-wide bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.06] text-[rgba(26,26,10,0.50)] dark:text-white/40"
                    >
                      Limpar
                    </button>
                    <button
                      onClick={() => setShowFilterSheet(false)}
                      className="flex-[2] py-3 rounded-[13px] text-[11.5px] font-extrabold uppercase tracking-wide bg-[#D81E1E] text-white shadow-[0_8px_18px_rgba(216,30,30,0.30)]"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              </>
            )}
          </>,
          document.body,
        )}
      </div>
    );
  }

  // ── Desktop table layout ─────────────────────────────────────────────────
  const thCls = 'text-[10px] font-extrabold uppercase tracking-wide text-on-surface/40 px-3.5 py-3 text-left whitespace-nowrap';
  const tdCls = 'px-3.5 py-2.5';
  const inputCls = 'w-full bg-surface border border-on-surface/10 rounded-xl px-3 py-2 text-[13px] text-on-surface focus:outline-none focus:border-primary/50 transition-colors';

  return (
    <div className="bg-surface-container border border-on-surface/[0.07] rounded-[28px] overflow-hidden">
      {loading ? (
        <div className="py-12 flex justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px]">
              <thead>
                <tr className="border-b border-on-surface/[0.07]">
                  <th className={thCls}>Colaborador</th>
                  <th className={thCls}>Tipo</th>
                  <th className={thCls}>Modalidade</th>
                  <th className={thCls}>Valor</th>
                  <th className={thCls}>Observação</th>
                  <th className={thCls}>Data</th>
                  <th className={cn(thCls, 'w-12')} />
                </tr>
              </thead>
              <tbody className="divide-y divide-on-surface/[0.05]">
                {entries.length === 0 && pending.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-sm text-on-surface/35">
                      Nenhum registro ainda. Clique em "Adicionar Linha" para começar.
                    </td>
                  </tr>
                )}

                {/* Confirmed rows */}
                {entries.map(entry => (
                  <tr key={entry.id} className="group hover:bg-on-surface/[0.015] transition-colors">
                    <td className={cn(tdCls, 'text-[13px] font-semibold text-on-surface')}>
                      {entry.colaborador_nome || '—'}
                    </td>
                    <td className={tdCls}>
                      <span className={cn('text-[9.5px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-lg', tipoColor(entry.tipo))}>
                        {entry.tipo}
                      </span>
                    </td>
                    <td className={tdCls}>
                      <span className={cn('text-[9.5px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-lg', modalidadeColor(entry.modalidade))}>
                        {entry.modalidade}
                      </span>
                    </td>
                    <td className={cn(tdCls, 'text-[13px] font-bold text-on-surface')}>
                      {fmtMoney(entry.valor)}
                    </td>
                    <td className={cn(tdCls, 'text-[12.5px] text-on-surface/60 max-w-[200px] truncate')}>
                      {entry.observacao || '—'}
                    </td>
                    <td className={cn(tdCls, 'text-[12.5px] text-on-surface/60 whitespace-nowrap')}>
                      {fmtDate(entry.data)}
                    </td>
                    <td className={tdCls}>
                      <button
                        onClick={() => deleteEntry(entry)}
                        className="w-7 h-7 rounded-lg hover:bg-red-500/10 text-on-surface/20 hover:text-red-500 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}

                {/* Pending rows */}
                {pending.map(row => (
                  <>
                    <tr key={row.localId} className="bg-primary/[0.015]">
                      <td className={tdCls}>
                        <select
                          className={cn(inputCls, 'min-w-[140px]')}
                          value={row.colaborador_id}
                          onChange={e => updatePending(row.localId, { colaborador_id: e.target.value })}
                        >
                          <option value="">Selecionar...</option>
                          {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.nome}</option>
                          ))}
                        </select>
                      </td>
                      <td className={tdCls}>
                        {TIPO_AUTOMATICO[row.modalidade] ? (
                          <div className={cn('flex items-center gap-1.5 w-fit text-[9.5px] font-extrabold uppercase tracking-wide px-2.5 py-1.5 rounded-lg', tipoColor(row.tipo))}>
                            <Lock size={9} strokeWidth={3} /> {row.tipo}
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            {(['Despesa', 'Receita'] as TipoLancamento[]).map(t => (
                              <button
                                key={t} onClick={() => updatePending(row.localId, { tipo: t })}
                                className={cn(
                                  'px-2.5 py-1.5 rounded-lg text-[9.5px] font-extrabold uppercase tracking-wide border-[1.5px] transition-colors',
                                  row.tipo === t ? tipoColor(t) : 'border-on-surface/[0.12] text-on-surface/40',
                                )}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className={tdCls}>
                        <select
                          className={cn(inputCls, 'min-w-[110px]')}
                          value={row.modalidade}
                          onChange={e => changeModalidade(row.localId, e.target.value as Modalidade)}
                        >
                          {MODALIDADES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className={tdCls}>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          className={cn(inputCls, 'no-spinner min-w-[100px]')}
                          placeholder="0,00"
                          value={row.valor}
                          onChange={e => updatePending(row.localId, { valor: e.target.value })}
                        />
                      </td>
                      <td className={tdCls}>
                        <input
                          type="text"
                          className={cn(inputCls, 'min-w-[150px]')}
                          placeholder="Opcional"
                          value={row.observacao}
                          onChange={e => updatePending(row.localId, { observacao: e.target.value })}
                        />
                      </td>
                      <td className={tdCls}>
                        <input
                          type="date"
                          className={cn(inputCls, 'min-w-[130px]')}
                          value={row.data}
                          onChange={e => updatePending(row.localId, { data: e.target.value })}
                        />
                      </td>
                      <td className={tdCls}>
                        <button
                          onClick={() => confirmRow(row)}
                          disabled={row.saving}
                          className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/25 active:scale-95 transition-transform disabled:opacity-50"
                          title="Confirmar"
                        >
                          {row.saving
                            ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <Check size={14} strokeWidth={2.8} />
                          }
                        </button>
                      </td>
                    </tr>
                    {row.error && (
                      <tr key={`${row.localId}-err`} className="bg-red-500/[0.03]">
                        <td colSpan={7} className="px-3.5 py-1.5 text-[11px] text-red-500 font-semibold">
                          {row.error}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add row button */}
          <div className="px-5 py-3.5 border-t border-on-surface/[0.07]">
            <button
              onClick={addPending}
              className="flex items-center gap-2 px-4 py-2 rounded-[13px] border-[1.5px] border-dashed border-on-surface/15 text-[11.5px] font-extrabold uppercase tracking-wide text-on-surface/40 hover:border-primary/30 hover:text-primary transition-colors active:scale-[0.98]"
            >
              <Plus size={13} strokeWidth={2.8} />
              Adicionar Linha
            </button>
          </div>
        </>
      )}
    </div>
  );
}
