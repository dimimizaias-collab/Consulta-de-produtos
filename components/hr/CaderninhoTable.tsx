'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Check, Trash2, Lock, Search, Calendar, Filter, X,
  ChevronLeft, ChevronRight, ChevronDown, Edit2, Users, Package, Ticket, Award, MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { type Employee } from '@/lib/hrEmployees';
import { recomputeParcelasForCaderninhoEntry } from '@/lib/hrSalarioFinance';

const blockWheelChange = (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur();

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

const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WEEKDAYS_PT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const pad2 = (n: number) => String(n).padStart(2, '0');
const dateToISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function buildCalCells(viewDate: Date): { date: Date; current: boolean }[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells: { date: Date; current: boolean }[] = [];
  for (let i = 0; i < firstDay; i++) cells.push({ date: new Date(year, month - 1, daysInPrev - firstDay + 1 + i), current: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(year, month, d), current: true });
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) cells.push({ date: new Date(year, month + 1, d), current: false });
  return cells;
}

const modalidadeIcon = (m: Modalidade) => {
  if (m === 'Mercadoria') return <Package size={12} />;
  if (m === 'Vale') return <Ticket size={12} />;
  if (m === 'Bônus') return <Award size={12} />;
  return <MoreHorizontal size={12} />;
};

function validateDraft(d: PendingRow): string | null {
  const val = parseFloat(d.valor.replace(',', '.'));
  if (!d.colaborador_id) return 'Selecione um colaborador.';
  if (!d.valor || isNaN(val) || val <= 0) return 'Informe um valor válido.';
  if (!d.data) return 'Informe a data.';
  return null;
}

function withAutoTipo(modalidade: Modalidade, prev: PendingRow): PendingRow {
  const auto = TIPO_AUTOMATICO[modalidade];
  return { ...prev, modalidade, ...(auto ? { tipo: auto } : {}) };
}

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
  const [loading, setLoading] = useState(true);

  // ── Busca/filtro/data — compartilhado entre mobile (sheets) e desktop (calendário/painel) ──
  const [search, setSearch] = useState('');
  const [filterModalidade, setFilterModalidade] = useState<Modalidade | null>(null);
  const [filterTipo, setFilterTipo] = useState<TipoLancamento | null>(null);
  // Mostra só os registros do dia por padrão, evitando poluir a tela com o histórico inteiro.
  const [dateFrom, setDateFrom] = useState(() => todayStr());
  const [dateTo, setDateTo] = useState(() => todayStr());
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showCalSheet, setShowCalSheet] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [draft, setDraft] = useState<PendingRow>(() => makePending());

  // ── Desktop: calendário, painel de resumo e modal dedicado de criação/edição ──
  const [calViewDate, setCalViewDate] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [panelTab, setPanelTab] = useState<'modalidades' | 'colaboradores'>('modalidades');
  // ── Mobile: painel suspenso (accordion) de Modalidades/Colaboradores ─────
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState<'modalidades' | 'colaboradores' | null>(null);
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [showDeskModal, setShowDeskModal] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [deskDraft, setDeskDraft] = useState<PendingRow>(() => makePending());

  const hasDatePeriod = !!(dateFrom || dateTo);
  const hasFilter = filterModalidade !== null || filterTipo !== null;

  const openAddSheet = () => {
    setDraft(makePending());
    setShowAddSheet(true);
  };

  const changeDraftModalidade = (modalidade: Modalidade) => setDraft(prev => withAutoTipo(modalidade, prev));
  const changeDeskDraftModalidade = (modalidade: Modalidade) => setDeskDraft(prev => withAutoTipo(modalidade, prev));

  const confirmDraft = async () => {
    const err = validateDraft(draft);
    if (err) {
      setDraft(prev => ({ ...prev, error: err }));
      return;
    }

    setDraft(prev => ({ ...prev, saving: true, error: null }));

    const val = parseFloat(draft.valor.replace(',', '.'));
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

  const deleteEntry = async (entry: CaderninhoEntry) => {
    await supabase.from('hr_caderninho').delete().eq('id', entry.id);
    setEntries(prev => prev.filter(e => e.id !== entry.id));
    if (entry.colaborador_id) recomputeParcelasForCaderninhoEntry(entry.colaborador_id, entry.data);
  };

  // ── Desktop: abrir modal de criação/edição ────────────────────────────────
  const openDeskCreate = () => {
    setDeskDraft(makePending());
    setEditingEntryId(null);
    setShowDeskModal(true);
  };

  const openDeskEdit = (entry: CaderninhoEntry) => {
    setDeskDraft({
      localId: entry.id,
      colaborador_id: entry.colaborador_id || '',
      modalidade: entry.modalidade,
      tipo: entry.tipo,
      valor: String(entry.valor).replace('.', ','),
      observacao: entry.observacao || '',
      data: entry.data,
      saving: false,
      error: null,
    });
    setEditingEntryId(entry.id);
    setShowDeskModal(true);
  };

  const saveDeskDraft = async () => {
    const err = validateDraft(deskDraft);
    if (err) {
      setDeskDraft(prev => ({ ...prev, error: err }));
      return;
    }

    setDeskDraft(prev => ({ ...prev, saving: true, error: null }));

    const val = parseFloat(deskDraft.valor.replace(',', '.'));
    const emp = employees.find(e => e.id === deskDraft.colaborador_id);
    const payload = {
      colaborador_id: deskDraft.colaborador_id,
      colaborador_nome: emp?.nome || null,
      modalidade: deskDraft.modalidade,
      tipo: deskDraft.tipo,
      valor: val,
      observacao: deskDraft.observacao.trim() || null,
      data: deskDraft.data,
    };

    const { error } = editingEntryId
      ? await supabase.from('hr_caderninho').update(payload).eq('id', editingEntryId)
      : await supabase.from('hr_caderninho').insert([payload]);

    if (error) {
      setDeskDraft(prev => ({ ...prev, saving: false, error: 'Erro ao salvar. Tente novamente.' }));
      return;
    }

    setShowDeskModal(false);
    fetchEntries();
    recomputeParcelasForCaderninhoEntry(deskDraft.colaborador_id, deskDraft.data);
  };

  // ── Filtro compartilhado (busca + modalidade/tipo + período) ─────────────
  const filteredEntries = useMemo(() => entries.filter(entry => {
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
  }), [entries, search, filterModalidade, filterTipo, dateFrom, dateTo]);

  // ── Painel de resumo desktop: entradas do período selecionado no calendário ──
  const periodEntries = useMemo(() => entries.filter(entry => {
    if (dateFrom && entry.data < dateFrom) return false;
    if (dateTo && entry.data > dateTo) return false;
    return true;
  }), [entries, dateFrom, dateTo]);

  const modalidadeStats = useMemo(() => {
    const map = new Map<Modalidade, { valor: number; count: number }>();
    MODALIDADES.forEach(m => map.set(m, { valor: 0, count: 0 }));
    periodEntries.forEach(entry => {
      const stat = map.get(entry.modalidade)!;
      stat.valor += entry.valor;
      stat.count += 1;
    });
    return map;
  }, [periodEntries]);

  const colaboradorStats = useMemo(() => {
    const map = new Map<string, { nome: string; despesas: number; receitas: number; count: number }>();
    periodEntries.forEach(entry => {
      const key = entry.colaborador_id || entry.colaborador_nome || 'sem-colaborador';
      const nome = entry.colaborador_nome || 'Sem colaborador';
      if (!map.has(key)) map.set(key, { nome, despesas: 0, receitas: 0, count: 0 });
      const stat = map.get(key)!;
      if (entry.tipo === 'Despesa') stat.despesas += entry.valor;
      else stat.receitas += entry.valor;
      stat.count += 1;
    });
    return Array.from(map.values()).sort((a, b) => (b.despesas + b.receitas) - (a.despesas + a.receitas));
  }, [periodEntries]);

  const entryDatesSet = useMemo(() => new Set(entries.map(e => e.data)), [entries]);

  const handleCalDayClick = (iso: string) => {
    if (!dateFrom || (dateFrom && dateTo)) {
      setDateFrom(iso);
      setDateTo('');
    } else if (iso < dateFrom) {
      setDateTo(dateFrom);
      setDateFrom(iso);
    } else {
      setDateTo(iso);
    }
  };

  // ── Mobile (compact) layout ──────────────────────────────────────────────
  if (compact) {
    const fieldCls = 'w-full bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]';
    const labelCls = 'text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block';
    const iconBtnCls = 'w-9 h-9 rounded-xl border-[1.5px] flex items-center justify-center active:scale-90 transition-all shrink-0';
    const iconBtnOffCls = 'bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.07] border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] text-[rgba(26,26,10,0.45)] dark:text-white/40';
    const iconBtnOnCls = 'bg-[rgba(216,30,30,0.10)] border-[rgba(216,30,30,0.20)] text-[#D81E1E]';

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

        {/* Toggle: Modalidades / Colaboradores — abre painel suspenso */}
        <div className="shrink-0 flex gap-[7px] px-3 pb-2">
          <button
            onClick={() => setMobileSummaryOpen(prev => prev === 'modalidades' ? null : 'modalidades')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wide border-[1.5px] transition-colors',
              mobileSummaryOpen === 'modalidades' ? iconBtnOnCls : 'bg-white dark:bg-[#252520] border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] text-[rgba(26,26,10,0.45)] dark:text-white/40',
            )}
          >
            <Package size={12} />
            Modalidades
            <ChevronDown size={10} strokeWidth={3} className={cn('transition-transform', mobileSummaryOpen === 'modalidades' && 'rotate-180')} />
          </button>
          <button
            onClick={() => setMobileSummaryOpen(prev => prev === 'colaboradores' ? null : 'colaboradores')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wide border-[1.5px] transition-colors',
              mobileSummaryOpen === 'colaboradores' ? iconBtnOnCls : 'bg-white dark:bg-[#252520] border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] text-[rgba(26,26,10,0.45)] dark:text-white/40',
            )}
          >
            <Users size={12} />
            Colaboradores
            <ChevronDown size={10} strokeWidth={3} className={cn('transition-transform', mobileSummaryOpen === 'colaboradores' && 'rotate-180')} />
          </button>
        </div>

        {/* Painel suspenso de resumo — mesmo shell/scroll do painel desktop */}
        {mobileSummaryOpen && (
          <div className="shrink-0 mx-3 mb-2.5 bg-white dark:bg-[#252520] border-[1.5px] border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] rounded-[18px] overflow-hidden shadow-[0_10px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.40)]">
            <div className="max-h-[220px] overflow-y-auto p-2.5">
              {mobileSummaryOpen === 'modalidades' ? (
                <div className="grid grid-cols-2 gap-2">
                  {MODALIDADES.map(m => {
                    const stat = modalidadeStats.get(m)!;
                    return (
                      <div key={m} className="bg-[#FDFAF0] dark:bg-[#1E1E18] border border-[rgba(26,26,10,0.07)] dark:border-white/[0.07] rounded-[14px] px-2.5 py-2.5 flex items-center gap-2">
                        <div className={cn('w-7 h-7 rounded-[9px] flex items-center justify-center flex-shrink-0', modalidadeColor(m))}>
                          {modalidadeIcon(m)}
                        </div>
                        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                          <span className="text-[8px] font-black uppercase tracking-wide text-[rgba(26,26,10,0.40)] dark:text-white/32 whitespace-nowrap">{m}</span>
                          <span className="text-[12.5px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight">{fmtMoney(stat.valor)}</span>
                          <span className="text-[8px] font-bold text-[rgba(26,26,10,0.35)] dark:text-white/30">{stat.count} registro{stat.count === 1 ? '' : 's'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : colaboradorStats.length === 0 ? (
                <p className="text-[11px] text-center py-4 text-[rgba(26,26,10,0.35)] dark:text-white/30">Nenhum colaborador no período.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {colaboradorStats.map(c => (
                    <div key={c.nome} className="bg-[#FDFAF0] dark:bg-[#1E1E18] border border-[rgba(26,26,10,0.07)] dark:border-white/[0.07] rounded-[14px] px-3 py-2.5 flex items-center gap-2.5">
                      <div className="w-[30px] h-[30px] rounded-[10px] bg-[rgba(26,26,10,0.08)] dark:bg-white/[0.08] text-[rgba(26,26,10,0.55)] dark:text-white/55 flex items-center justify-center flex-shrink-0">
                        <Users size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3] truncate">{c.nome}</div>
                        <div className="text-[9px] font-bold text-[rgba(26,26,10,0.35)] dark:text-white/30 mt-0.5">{c.count} registro{c.count === 1 ? '' : 's'}</div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        <span className="text-[12px] font-black text-red-600 dark:text-red-400">-{fmtMoney(c.despesas)}</span>
                        <span className="text-[12px] font-black text-emerald-600 dark:text-emerald-400">+{fmtMoney(c.receitas)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

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
                      onWheel={blockWheelChange}
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

  // ── Desktop layout: calendário + painel Modalidades/Colaboradores + tabela ──
  const thCls = 'text-[10px] font-extrabold uppercase tracking-wide text-on-surface/40 px-3.5 py-3 text-left whitespace-nowrap';
  const tdCls = 'px-3.5 py-2.5';
  const modalFieldCls = 'w-full bg-surface border border-on-surface/10 rounded-xl px-3.5 py-2.5 text-[13px] font-medium text-on-surface focus:outline-none focus:border-primary/50 transition-colors';
  const modalLabelCls = 'text-[10px] font-extrabold uppercase tracking-wide text-on-surface/45 mb-1.5 block';

  return (
    <div className="flex flex-col gap-3.5">
      {/* Calendário + painel de resumo */}
      <div className="grid grid-cols-2 gap-3.5 items-start">
        {/* Calendário */}
        <div className="bg-surface border border-on-surface/[0.08] rounded-[18px] overflow-hidden flex flex-col">
          <div className="bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] px-4 py-2.5 flex items-center gap-2.5">
            <span className="text-[13px] font-black text-[#1A1A0E] flex-1 whitespace-nowrap">
              {MONTHS_PT[calViewDate.getMonth()]} {calViewDate.getFullYear()}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setCalViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                className="w-[26px] h-[26px] rounded-lg bg-black/[0.08] hover:bg-black/[0.14] text-black/55 hover:text-[#1A1A0E] flex items-center justify-center transition-colors"
              >
                <ChevronLeft size={13} />
              </button>
              <button
                onClick={() => setCalViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                className="w-[26px] h-[26px] rounded-lg bg-black/[0.08] hover:bg-black/[0.14] text-black/55 hover:text-[#1A1A0E] flex items-center justify-center transition-colors"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
          <div className="p-3">
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS_PT.map((d, i) => (
                <span key={i} className="text-center text-[8.5px] font-black uppercase tracking-wide text-on-surface/25 py-1">{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-[2px]">
              {buildCalCells(calViewDate).map((cell, i) => {
                const iso = dateToISO(cell.date);
                const isToday = iso === todayStr();
                const selectedSolo = dateFrom === iso && !dateTo;
                const rangeStart = dateFrom === iso && !!dateTo;
                const rangeEnd = dateTo === iso;
                const inRange = !!dateFrom && !!dateTo && iso > dateFrom && iso < dateTo;
                const highlighted = selectedSolo || rangeStart || rangeEnd;
                const hasDot = entryDatesSet.has(iso);
                return (
                  <button
                    key={i}
                    onClick={() => handleCalDayClick(iso)}
                    className={cn(
                      'h-[26px] rounded-lg flex items-center justify-center text-[10.5px] font-bold relative transition-colors',
                      !cell.current && 'text-on-surface/20',
                      cell.current && !highlighted && !inRange && !isToday && 'text-on-surface/55 hover:bg-on-surface/5',
                      isToday && !highlighted && 'bg-primary/10 text-primary',
                      inRange && 'bg-primary/[0.13] text-primary font-extrabold',
                      highlighted && 'bg-primary text-white font-extrabold shadow-[0_2px_6px_rgba(216,30,30,0.30)]',
                    )}
                  >
                    {cell.date.getDate()}
                    {hasDot && (
                      <span className={cn('absolute bottom-[2px] left-1/2 -translate-x-1/2 w-[4px] h-[4px] rounded-full', highlighted ? 'bg-white/70' : 'bg-primary')} />
                    )}
                  </button>
                );
              })}
            </div>
            {(dateFrom || dateTo) && (
              <div className="mt-2.5 flex items-center justify-between gap-1 bg-primary/[0.07] border border-primary/20 rounded-[10px] px-2.5 py-1.5">
                <span className="text-[9.5px] font-bold text-primary">
                  {dateTo ? `Período: ${fmtDate(dateFrom)} – ${fmtDate(dateTo)}` : `Data: ${fmtDate(dateFrom)}`}
                </span>
                <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-primary/60 hover:text-primary">
                  <X size={11} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Painel Modalidades / Colaboradores */}
        <div className="bg-surface border border-on-surface/[0.08] rounded-[18px] overflow-hidden flex flex-col">
          <div className="bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] px-2.5 py-2">
            <div className="flex bg-black/10 rounded-full p-[2px] gap-[2px]">
              <button
                onClick={() => setPanelTab('modalidades')}
                className={cn('flex-1 py-1.5 rounded-full text-[9.5px] font-black uppercase tracking-wide transition-colors', panelTab === 'modalidades' ? 'bg-primary text-white shadow-sm' : 'text-black/45 hover:text-black/70')}
              >
                Modalidades
              </button>
              <button
                onClick={() => setPanelTab('colaboradores')}
                className={cn('flex-1 py-1.5 rounded-full text-[9.5px] font-black uppercase tracking-wide transition-colors', panelTab === 'colaboradores' ? 'bg-primary text-white shadow-sm' : 'text-black/45 hover:text-black/70')}
              >
                Colaboradores
              </button>
            </div>
          </div>
          <div className="p-2.5">
            {panelTab === 'modalidades' ? (
              <div className="grid grid-cols-2 gap-1.5">
                {MODALIDADES.map(m => {
                  const stat = modalidadeStats.get(m)!;
                  return (
                    <div key={m} className="bg-surface-container-low border border-on-surface/[0.07] rounded-xl px-2.5 py-2 flex items-center gap-2">
                      <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0', modalidadeColor(m))}>
                        {modalidadeIcon(m)}
                      </div>
                      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                        <span className="text-[8px] font-black uppercase tracking-wide text-on-surface/40 whitespace-nowrap">{m}</span>
                        <span className="text-[13px] font-black text-on-surface leading-tight truncate">{fmtMoney(stat.valor)}</span>
                        <span className="text-[8.5px] font-bold text-on-surface/35">{stat.count} registro{stat.count === 1 ? '' : 's'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1 -mr-1">
                {colaboradorStats.length === 0 ? (
                  <p className="text-[11px] text-on-surface/35 text-center py-6">Nenhum colaborador no período.</p>
                ) : colaboradorStats.map(c => (
                  <div key={c.nome} className="bg-surface-container-low border border-on-surface/[0.07] rounded-xl px-3 py-2.5 flex items-center gap-2.5">
                    <div className="w-[30px] h-[30px] rounded-[9px] bg-on-surface/[0.08] text-on-surface/55 flex items-center justify-center flex-shrink-0">
                      <Users size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11.5px] font-extrabold text-on-surface truncate">{c.nome}</div>
                      <div className="text-[9px] font-bold text-on-surface/35 mt-0.5">{c.count} registro{c.count === 1 ? '' : 's'}</div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                      <span className="text-[11.5px] font-black text-red-600 dark:text-red-400">-{fmtMoney(c.despesas)}</span>
                      <span className="text-[11.5px] font-black text-emerald-600 dark:text-emerald-400">+{fmtMoney(c.receitas)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Busca + filtro + novo registro */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/35 pointer-events-none" />
          <input
            className="pl-8 pr-4 py-2.5 bg-surface-container-low rounded-xl text-[13px] text-on-surface border border-on-surface/[0.06] focus:outline-none focus:border-primary/50 w-[220px] placeholder:text-on-surface/35"
            placeholder="Buscar colaborador..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="relative">
          <button
            onClick={() => setShowFilterPopover(v => !v)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-extrabold uppercase tracking-wide border transition-colors',
              hasFilter ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-surface-container-low border-on-surface/[0.08] text-on-surface/60 hover:text-on-surface',
            )}
          >
            <Filter size={14} /> Filtrar colunas
          </button>
          {showFilterPopover && (
            <div className="absolute z-20 top-[calc(100%+6px)] left-0 w-[240px] bg-surface border border-on-surface/10 rounded-2xl shadow-xl p-3.5">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] font-black uppercase tracking-wide text-on-surface/40">Filtrar</span>
                <button onClick={() => setShowFilterPopover(false)} className="text-on-surface/40 hover:text-on-surface">
                  <X size={13} />
                </button>
              </div>
              <span className="text-[9px] font-extrabold uppercase tracking-wide text-on-surface/35 mb-1.5 block">Modalidade</span>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {MODALIDADES.map(m => (
                  <button
                    key={m} onClick={() => setFilterModalidade(prev => prev === m ? null : m)}
                    className={cn('px-2.5 py-1.5 rounded-lg text-[10px] font-bold border-[1.5px] transition-colors', filterModalidade === m ? 'bg-primary/10 border-primary/30 text-primary' : 'border-on-surface/10 text-on-surface/45')}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <span className="text-[9px] font-extrabold uppercase tracking-wide text-on-surface/35 mb-1.5 block">Tipo</span>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {(['Despesa', 'Receita'] as TipoLancamento[]).map(t => (
                  <button
                    key={t} onClick={() => setFilterTipo(prev => prev === t ? null : t)}
                    className={cn('px-2.5 py-1.5 rounded-lg text-[10px] font-bold border-[1.5px] transition-colors', filterTipo === t ? 'bg-primary/10 border-primary/30 text-primary' : 'border-on-surface/10 text-on-surface/45')}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {hasFilter && (
                <button
                  onClick={() => { setFilterModalidade(null); setFilterTipo(null); }}
                  className="w-full py-2 rounded-lg text-[10.5px] font-extrabold uppercase tracking-wide bg-on-surface/[0.06] text-on-surface/50 hover:text-on-surface transition-colors"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          )}
        </div>
        <button
          onClick={openDeskCreate}
          className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-extrabold uppercase tracking-wide bg-primary text-white shadow-lg shadow-primary/25 active:scale-[0.97] transition-transform"
        >
          <Plus size={15} strokeWidth={2.8} /> Novo Registro
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-surface-container border border-on-surface/[0.07] rounded-[20px] overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
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
                  <th className={cn(thCls, 'w-20')} />
                </tr>
              </thead>
              <tbody className="divide-y divide-on-surface/[0.05]">
                {filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-sm text-on-surface/35">
                      {entries.length === 0 ? 'Nenhum registro ainda. Clique em "Novo Registro" para começar.' : 'Nenhum registro encontrado.'}
                    </td>
                  </tr>
                )}

                {filteredEntries.map(entry => (
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
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openDeskEdit(entry)}
                          className="w-7 h-7 rounded-lg hover:bg-primary/10 text-on-surface/25 hover:text-primary flex items-center justify-center transition-colors"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => deleteEntry(entry)}
                          className="w-7 h-7 rounded-lg hover:bg-red-500/10 text-on-surface/25 hover:text-red-500 flex items-center justify-center transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal dedicado — Novo/Editar Registro */}
      {typeof window !== 'undefined' && showDeskModal && createPortal(
        <>
          <div className="fixed inset-0 bg-black/45 backdrop-blur-[2px] z-[100]" onClick={() => setShowDeskModal(false)} />
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 pointer-events-none">
            <div className="w-full max-w-[520px] bg-surface rounded-3xl shadow-2xl overflow-hidden pointer-events-auto max-h-[90vh] flex flex-col">
              <div className="bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] px-5 py-4 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-black/[0.09] flex items-center justify-center text-[#1A1A0E]">
                    <Users size={18} />
                  </div>
                  <div>
                    <div className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-black/40">Caderninho</div>
                    <div className="text-[17px] font-black text-[#1A1A0E]">{editingEntryId ? 'Editar Registro' : 'Novo Registro'}</div>
                  </div>
                </div>
                <button
                  onClick={() => setShowDeskModal(false)}
                  className="w-8 h-8 rounded-lg bg-black/[0.08] border border-black/10 text-black/45 hover:bg-black/[0.14] hover:text-[#1A1A0E] flex items-center justify-center transition-colors"
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>

              <div className="p-5 flex flex-col gap-3.5 overflow-y-auto">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className={modalLabelCls}>Colaborador</span>
                    <select
                      className={modalFieldCls}
                      value={deskDraft.colaborador_id}
                      onChange={e => setDeskDraft(prev => ({ ...prev, colaborador_id: e.target.value }))}
                    >
                      <option value="">Selecionar...</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className={modalLabelCls}>Modalidade</span>
                    <select
                      className={modalFieldCls}
                      value={deskDraft.modalidade}
                      onChange={e => changeDeskDraftModalidade(e.target.value as Modalidade)}
                    >
                      {MODALIDADES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <span className={modalLabelCls}>Tipo</span>
                  {TIPO_AUTOMATICO[deskDraft.modalidade] ? (
                    <div className={cn('flex items-center gap-1.5 w-fit text-[11px] font-extrabold uppercase tracking-wide px-3 py-2.5 rounded-xl', tipoColor(deskDraft.tipo))}>
                      <Lock size={10} strokeWidth={3} /> {deskDraft.tipo}
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      {(['Despesa', 'Receita'] as TipoLancamento[]).map(t => (
                        <button
                          key={t} onClick={() => setDeskDraft(prev => ({ ...prev, tipo: t }))}
                          className={cn(
                            'flex-1 py-2.5 rounded-xl text-[11px] font-extrabold uppercase tracking-wide border-[1.5px] transition-colors',
                            deskDraft.tipo === t ? tipoColor(t) : 'border-on-surface/[0.12] text-on-surface/40',
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className={modalLabelCls}>Valor (R$)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      onWheel={blockWheelChange}
                      className={cn(modalFieldCls, 'no-spinner')}
                      placeholder="0,00"
                      value={deskDraft.valor}
                      onChange={e => setDeskDraft(prev => ({ ...prev, valor: e.target.value }))}
                    />
                  </div>
                  <div>
                    <span className={modalLabelCls}>Data</span>
                    <input
                      type="date"
                      className={modalFieldCls}
                      value={deskDraft.data}
                      onChange={e => setDeskDraft(prev => ({ ...prev, data: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <span className={modalLabelCls}>Observação</span>
                  <input
                    type="text"
                    className={modalFieldCls}
                    placeholder="Opcional"
                    value={deskDraft.observacao}
                    onChange={e => setDeskDraft(prev => ({ ...prev, observacao: e.target.value }))}
                  />
                </div>

                {deskDraft.error && (
                  <p className="text-[11px] text-red-500 font-semibold">{deskDraft.error}</p>
                )}
              </div>

              <div className="px-5 py-4 border-t border-on-surface/[0.08] flex justify-end gap-2.5 flex-shrink-0">
                <button
                  onClick={() => setShowDeskModal(false)}
                  className="px-5 py-2.5 rounded-xl text-[12px] font-extrabold uppercase tracking-wide bg-on-surface/[0.07] text-on-surface/55 border border-on-surface/10"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveDeskDraft}
                  disabled={deskDraft.saving}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[12px] font-extrabold uppercase tracking-wide bg-primary text-white shadow-lg shadow-primary/25 active:scale-[0.97] transition-transform disabled:opacity-50"
                >
                  {deskDraft.saving
                    ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <><Check size={14} strokeWidth={2.8} /> Salvar Registro</>
                  }
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
