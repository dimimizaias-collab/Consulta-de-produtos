'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Check, Trash2, Lock, Search, Calendar, Filter, X,
  ChevronLeft, ChevronRight, ChevronDown, Edit2, Users, Package, Ticket, Award, MoreHorizontal, BookText,
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

  // ── Desktop layout: tabela no centro + coluna com calendário e resumo (padrão quadrado) ──
  const sectionCls = 'bg-[#F1EAD3] dark:bg-[#181814] border border-[#E0D8BF] dark:border-white/[0.10]';
  const sectionHeadCls = 'h-7 flex items-center gap-2 px-2.5 bg-[#FFEC4D] border-b-[1.5px] border-[#8F7E10]';
  const sectionTitleCls = 'text-[9px] font-black uppercase tracking-[0.1em] text-[rgba(26,26,10,0.55)]';
  const modalLabelCls = 'block text-[9px] font-black uppercase tracking-[0.1em] text-[#1A1A0E]/[0.58] dark:text-[#F2F0E3]/55 pl-px mb-1';
  const modalFieldCls = 'w-full min-w-0 h-[34px] px-2.5 bg-white dark:bg-[#1E1E18] text-[13px] font-semibold text-on-surface border border-[#E0D8BF] dark:border-white/[0.10] outline-none caret-[#D81E1E] hover:border-[#CFC4A2] dark:hover:border-white/[0.20] focus:!border-[#D81E1E] focus:shadow-[0_0_0_2px_rgba(216,30,30,0.12)] placeholder:text-on-surface/25 placeholder:font-medium transition-[border-color,box-shadow]';
  const segWrapCls = 'flex gap-0.5 p-0.5 bg-on-surface/[0.06] border border-[#E0D8BF] dark:border-white/[0.10]';
  const segBtnCls = (on: boolean) => cn(
    'flex-1 h-[26px] px-2 text-[10px] font-black uppercase tracking-[0.05em] transition-colors duration-[130ms]',
    on ? 'bg-[#D81E1E] text-white' : 'text-on-surface/50 hover:text-on-surface',
  );
  const tipoTagCls = (t: TipoLancamento) => t === 'Receita'
    ? 'text-[#0A7A55] dark:text-[#34D399] bg-emerald-500/[0.07]'
    : 'text-[#B91818] dark:text-red-400 bg-[#D81E1E]/[0.06]';
  const modalidadeTagCls = (m: Modalidade) =>
    m === 'Mercadoria' ? 'text-[#B45309] dark:text-[#FCD34D] bg-amber-500/10'
    : m === 'Vale' ? 'text-[#1D4ED8] dark:text-[#93C5FD] bg-blue-500/10'
    : m === 'Bônus' ? 'text-[#047857] dark:text-[#6EE7B7] bg-emerald-500/10'
    : 'text-on-surface/55 bg-gray-500/10';
  const modalidadeDotCls = (m: Modalidade) =>
    m === 'Mercadoria' ? 'bg-amber-500' : m === 'Vale' ? 'bg-blue-500' : m === 'Bônus' ? 'bg-emerald-500' : 'bg-gray-400';
  const activeFilterCount = (filterModalidade ? 1 : 0) + (filterTipo ? 1 : 0);
  const calCells = buildCalCells(calViewDate);

  return (
    <div className="space-y-2.5">
      {/* Barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative group">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface/30 group-focus-within:text-[#D81E1E] transition-colors pointer-events-none" />
          <input
            className="h-[30px] w-60 bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10] pl-8 pr-2.5 text-[12px] font-semibold text-on-surface placeholder:text-on-surface/25 placeholder:font-medium caret-[#D81E1E] outline-none hover:border-[#CFC4A2] dark:hover:border-white/[0.20] focus:!border-[#D81E1E] transition-colors"
            placeholder="Buscar colaborador ou observação..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="relative">
          <button
            onClick={() => setShowFilterPopover(v => !v)}
            className={cn(
              'h-[30px] flex items-center gap-1.5 px-2.5 border text-[10.5px] font-extrabold uppercase tracking-[0.05em] transition-colors active:scale-[0.97]',
              hasFilter
                ? 'border-[#D81E1E] bg-[#D81E1E]/[0.06] text-[#D81E1E]'
                : 'border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-on-surface/55 hover:text-on-surface',
            )}
          >
            <Filter size={13} /> Filtrar
            {activeFilterCount > 0 && <span className="px-[5px] leading-[14px] bg-[#D81E1E] text-white text-[9px] font-black">{activeFilterCount}</span>}
          </button>
          {showFilterPopover && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowFilterPopover(false)} />
              <div className="absolute z-20 top-[calc(100%+4px)] left-0 w-[260px] p-2.5 bg-white dark:bg-[#2E2E28] border border-[#E0D8BF] dark:border-white/[0.10] shadow-[0_16px_36px_-10px_rgba(0,0,0,0.3)]">
                <span className={modalLabelCls}>Modalidade</span>
                <div className={cn(segWrapCls, 'mb-2.5')}>
                  {MODALIDADES.map(m => (
                    <button key={m} onClick={() => setFilterModalidade(prev => prev === m ? null : m)} className={segBtnCls(filterModalidade === m)}>
                      {m}
                    </button>
                  ))}
                </div>
                <span className={modalLabelCls}>Tipo</span>
                <div className={segWrapCls}>
                  {(['Despesa', 'Receita'] as TipoLancamento[]).map(t => (
                    <button key={t} onClick={() => setFilterTipo(prev => prev === t ? null : t)} className={segBtnCls(filterTipo === t)}>
                      {t}
                    </button>
                  ))}
                </div>
                {hasFilter && (
                  <button
                    onClick={() => { setFilterModalidade(null); setFilterTipo(null); }}
                    className="mt-2.5 w-full h-[26px] border border-[#E0D8BF] dark:border-white/[0.10] text-[10px] font-black uppercase tracking-[0.06em] text-on-surface/55 hover:text-[#D81E1E] hover:border-[#D81E1E]/35 transition-colors"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {hasDatePeriod && (
          <span className="h-[30px] flex items-center gap-2 pl-2.5 pr-1.5 border border-[#D81E1E]/40 bg-[#D81E1E]/[0.06] text-[11px] font-extrabold text-[#D81E1E]">
            {dateTo && dateTo !== dateFrom ? 'Período' : 'Data'}
            <span className="font-mono font-medium">
              {dateTo && dateTo !== dateFrom ? `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}` : fmtDate(dateFrom || dateTo)}
            </span>
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} title="Ver todo o histórico" className="w-5 h-5 flex items-center justify-center hover:bg-[#D81E1E]/10 transition-colors">
              <X size={12} strokeWidth={2.6} />
            </button>
          </span>
        )}

        <button
          onClick={openDeskCreate}
          className="ml-auto h-[30px] px-3.5 flex items-center gap-1.5 bg-[#D81E1E] hover:bg-[#B91818] text-white text-[11px] font-extrabold uppercase tracking-[0.05em] active:scale-[0.97] transition-all"
        >
          <Plus size={13} strokeWidth={2.8} /> Novo registro
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-2.5 items-start">
        {/* Tabela */}
        <div className="bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10]">
          {loading ? (
            <div className="py-12 flex justify-center">
              <div className="w-6 h-6 border-2 border-[#D81E1E] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto [&_tbody_td]:h-9 [&_tbody_td]:px-2.5 [&_tbody_td]:text-[12px] [&_tbody_td]:whitespace-nowrap [&_tbody_td]:border-r [&_tbody_td]:border-b [&_tbody_td]:border-[#A8A290] dark:[&_tbody_td]:border-white/20 [&_tbody_td:last-child]:border-r-0">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr className="bg-[#FFEC4D]">
                    {[
                      { label: 'Data', cls: 'w-[105px]' },
                      { label: 'Colaborador', cls: '' },
                      { label: 'Tipo', cls: 'w-[95px]' },
                      { label: 'Modalidade', cls: 'w-[115px]' },
                      { label: 'Observação', cls: '' },
                      { label: 'Valor', cls: 'w-[120px] text-right' },
                      { label: '', cls: 'w-[70px]' },
                    ].map((c, i) => (
                      <th
                        key={i}
                        className={cn(
                          'h-8 px-2.5 text-left whitespace-nowrap text-[9px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)] shadow-[inset_-1px_0_0_#B8A31F,inset_0_-1.5px_0_#8F7E10] last:shadow-[inset_0_-1.5px_0_#8F7E10]',
                          c.cls,
                        )}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.length === 0 && (
                    <tr>
                      <td colSpan={7} className="!h-auto py-10 text-center !text-[11.5px] font-bold text-on-surface/40 !whitespace-normal">
                        {entries.length === 0 ? 'Nenhum registro ainda. Clique em "Novo registro" para começar.' : 'Nenhum registro encontrado.'}
                      </td>
                    </tr>
                  )}

                  {filteredEntries.map((entry, idx) => (
                    <tr
                      key={entry.id}
                      className={cn(
                        'group transition-colors hover:bg-[#FFF8D0] dark:hover:bg-white/[0.04]',
                        idx % 2 === 0 ? 'bg-white dark:bg-[#252520]' : 'bg-[#FAF7EE] dark:bg-[#1E1E18]',
                      )}
                    >
                      <td className="font-mono text-on-surface/70">{fmtDate(entry.data)}</td>
                      <td className="font-extrabold text-on-surface">{entry.colaborador_nome || '—'}</td>
                      <td>
                        <span className={cn('inline-flex px-1.5 py-0.5 border border-current text-[9px] font-black uppercase tracking-[0.06em]', tipoTagCls(entry.tipo))}>
                          {entry.tipo}
                        </span>
                      </td>
                      <td>
                        <span className={cn('inline-flex px-1.5 py-0.5 border border-current text-[9px] font-black uppercase tracking-[0.06em]', modalidadeTagCls(entry.modalidade))}>
                          {entry.modalidade}
                        </span>
                      </td>
                      <td className="text-on-surface/55 max-w-[260px] truncate" title={entry.observacao || undefined}>{entry.observacao || '—'}</td>
                      <td className={cn('text-right font-mono', entry.tipo === 'Receita' ? 'text-[#0A7A55] dark:text-[#34D399]' : 'text-[#B91818] dark:text-red-400')}>
                        {entry.tipo === 'Receita' ? '+' : '−'}{fmtMoney(entry.valor)}
                      </td>
                      <td>
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openDeskEdit(entry)}
                            title="Editar registro"
                            className="w-6 h-6 flex items-center justify-center border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-on-surface/55 hover:text-on-surface hover:border-[#CFC4A2] active:scale-[0.94] transition-all"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={() => deleteEntry(entry)}
                            title="Excluir registro"
                            className="w-6 h-6 flex items-center justify-center border border-[#D81E1E]/25 bg-[#D81E1E]/[0.06] text-[#D81E1E] hover:bg-[#D81E1E]/[0.14] active:scale-[0.94] transition-all"
                          >
                            <Trash2 size={12} />
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

        {/* Coluna: período + resumo */}
        <div className="flex flex-col gap-2.5 xl:sticky xl:top-[92px]">
          <div className={sectionCls}>
            <div className={sectionHeadCls}>
              <Calendar size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
              <span className={sectionTitleCls}>Período</span>
            </div>
            <div className="p-2.5">
              <div className="select-none border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]">
                <div className="h-[30px] flex items-center border-b border-[#E0D8BF] dark:border-white/[0.10]">
                  <button
                    onClick={() => setCalViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                    title="Mês anterior"
                    className="w-[30px] h-full flex items-center justify-center border-r border-[#E0D8BF] dark:border-white/[0.10] text-on-surface/50 hover:text-on-surface hover:bg-on-surface/[0.05] transition-colors"
                  >
                    <ChevronLeft size={13} strokeWidth={2.5} />
                  </button>
                  <span className="flex-1 text-center text-[12px] font-black text-on-surface">
                    {MONTHS_PT[calViewDate.getMonth()]} {calViewDate.getFullYear()}
                  </span>
                  <button
                    onClick={() => setCalViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                    title="Próximo mês"
                    className="w-[30px] h-full flex items-center justify-center border-l border-[#E0D8BF] dark:border-white/[0.10] text-on-surface/50 hover:text-on-surface hover:bg-on-surface/[0.05] transition-colors"
                  >
                    <ChevronRight size={13} strokeWidth={2.5} />
                  </button>
                </div>
                <div className="grid grid-cols-7 bg-[#FFEC4D] shadow-[inset_0_-1.5px_0_#8F7E10]">
                  {WEEKDAYS_PT.map((d, i) => (
                    <span key={i} className="h-[22px] flex items-center justify-center text-[9px] font-black text-[rgba(26,26,10,0.55)]">{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {calCells.map((cell, i) => {
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
                          'relative aspect-square flex items-center justify-center font-mono text-[11.5px] transition-colors duration-[120ms]',
                          !cell.current && 'opacity-30',
                          highlighted
                            ? 'bg-[#D81E1E] text-white'
                            : inRange
                              ? 'bg-[#D81E1E]/10 text-on-surface'
                              : 'text-on-surface/70 hover:bg-[#FFF8D0] dark:hover:bg-white/[0.05] hover:text-on-surface',
                          isToday && !highlighted && 'font-semibold text-on-surface shadow-[inset_0_0_0_1.5px_rgba(26,26,10,0.40)] dark:shadow-[inset_0_0_0_1.5px_rgba(242,240,227,0.40)]',
                        )}
                      >
                        {cell.date.getDate()}
                        {hasDot && (
                          <span className={cn('absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1', highlighted ? 'bg-white/75' : 'bg-[#D81E1E]')} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="mt-1.5 text-[10.5px] font-semibold text-on-surface/40">
                Clique num dia para ver só ele, ou em dois dias para um período. Pontinho = dia com registro.
              </p>
            </div>
          </div>

          <div className={sectionCls}>
            <div className={sectionHeadCls}>
              <Users size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
              <span className={sectionTitleCls}>Resumo do período</span>
            </div>
            <div className="p-2.5">
              <div className={cn(segWrapCls, 'mb-2')}>
                <button onClick={() => setPanelTab('modalidades')} className={segBtnCls(panelTab === 'modalidades')}>Modalidades</button>
                <button onClick={() => setPanelTab('colaboradores')} className={segBtnCls(panelTab === 'colaboradores')}>Colaboradores</button>
              </div>
              {panelTab === 'modalidades' ? (
                <div className="grid grid-cols-2 border-l border-t border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]">
                  {MODALIDADES.map(m => {
                    const stat = modalidadeStats.get(m)!;
                    return (
                      <div key={m} className="px-2.5 py-2 border-r border-b border-[#E0D8BF] dark:border-white/[0.10] min-w-0">
                        <div className="flex items-center gap-[5px] text-[9px] font-black uppercase tracking-[0.1em] text-on-surface/40">
                          <span className={cn('w-2 h-2 shrink-0', modalidadeDotCls(m))} />
                          {m}
                        </div>
                        <div className="mt-0.5 font-mono text-[13.5px] text-on-surface truncate">{fmtMoney(stat.valor)}</div>
                        <div className="text-[10px] font-bold text-on-surface/40">{stat.count} registro{stat.count === 1 ? '' : 's'}</div>
                      </div>
                    );
                  })}
                </div>
              ) : colaboradorStats.length === 0 ? (
                <p className="py-5 text-center border border-dashed border-[#E0D8BF] dark:border-white/[0.12] bg-white dark:bg-[#1E1E18] text-[11.5px] font-bold text-on-surface/40">
                  Nenhum colaborador no período.
                </p>
              ) : (
                <div className="max-h-[260px] overflow-y-auto">
                  {colaboradorStats.map((c, idx) => (
                    <div
                      key={c.nome}
                      className={cn(
                        'flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-[#1E1E18] border border-[#B5AA86] dark:border-white/[0.10]',
                        idx > 0 && 'border-t-0',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-extrabold text-on-surface truncate">{c.nome}</div>
                        <div className="text-[10px] font-bold text-on-surface/40">{c.count} registro{c.count === 1 ? '' : 's'}</div>
                      </div>
                      <div className="flex flex-col items-end font-mono text-[11px] leading-[1.35] shrink-0">
                        {c.despesas > 0 && <span className="text-[#B91818] dark:text-red-400">−{fmtMoney(c.despesas)}</span>}
                        {c.receitas > 0 && <span className="text-[#0A7A55] dark:text-[#34D399]">+{fmtMoney(c.receitas)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal dedicado — Novo/Editar Registro */}
      {typeof window !== 'undefined' && showDeskModal && createPortal(
        <>
          <div className="fixed inset-0 bg-black/55 z-[100]" onClick={() => setShowDeskModal(false)} />
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 pointer-events-none">
            <div className="w-full max-w-[520px] max-h-[90vh] flex flex-col overflow-hidden pointer-events-auto bg-[#FDFAF0] dark:bg-[#1E1E18] border border-black/[0.12] dark:border-white/[0.08] shadow-2xl">
              <div className="h-12 pl-3.5 pr-3 flex items-center gap-[11px] bg-[#FBF35E] dark:bg-[#252520] border-b border-[#D9CF45] dark:border-white/[0.08] shrink-0">
                <div className="w-[30px] h-[30px] flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
                  <BookText size={15} strokeWidth={2.3} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="truncate text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight">{editingEntryId ? 'Editar Registro' : 'Novo Registro'}</h4>
                  <p className="truncate text-[10.5px] font-bold text-[#1A1A0E]/50 dark:text-[#F2F0E3]/40">Caderninho · lançamento de colaborador</p>
                </div>
                <button
                  onClick={() => setShowDeskModal(false)}
                  title="Fechar"
                  className="w-[30px] h-[30px] flex items-center justify-center shrink-0 border border-black/[0.14] dark:border-white/[0.10] text-black/50 dark:text-white/40 hover:bg-[#D81E1E]/[0.09] hover:text-[#D81E1E] hover:border-[#D81E1E]/25 active:scale-[0.93] transition-all duration-[130ms]"
                >
                  <X size={15} strokeWidth={2.6} />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3">
                <div className={sectionCls}>
                  <div className={sectionHeadCls}>
                    <BookText size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                    <span className={sectionTitleCls}>Registro</span>
                  </div>
                  <div className="p-2.5 grid grid-cols-2 gap-2.5">
                    <div className="min-w-0">
                      <span className={modalLabelCls}>Colaborador</span>
                      <select
                        className={cn(modalFieldCls, 'cursor-pointer')}
                        value={deskDraft.colaborador_id}
                        onChange={e => setDeskDraft(prev => ({ ...prev, colaborador_id: e.target.value }))}
                      >
                        <option value="">Selecionar...</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.nome}</option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0">
                      <span className={modalLabelCls}>Modalidade</span>
                      <select
                        className={cn(modalFieldCls, 'cursor-pointer')}
                        value={deskDraft.modalidade}
                        onChange={e => changeDeskDraftModalidade(e.target.value as Modalidade)}
                      >
                        {MODALIDADES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>

                    <div className="col-span-2 min-w-0">
                      <span className={modalLabelCls}>Tipo</span>
                      {TIPO_AUTOMATICO[deskDraft.modalidade] ? (
                        <span className={cn('h-[34px] inline-flex items-center gap-1.5 px-2.5 border border-current text-[10.5px] font-black uppercase tracking-[0.06em]', tipoTagCls(deskDraft.tipo))}>
                          <Lock size={11} strokeWidth={2.8} /> {deskDraft.tipo} · definido pela modalidade
                        </span>
                      ) : (
                        <div className={segWrapCls}>
                          {(['Despesa', 'Receita'] as TipoLancamento[]).map(t => (
                            <button key={t} onClick={() => setDeskDraft(prev => ({ ...prev, tipo: t }))} className={segBtnCls(deskDraft.tipo === t)}>
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <span className={modalLabelCls}>Valor (R$)</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        onWheel={blockWheelChange}
                        className={cn(modalFieldCls, 'font-mono no-spinner')}
                        placeholder="0,00"
                        value={deskDraft.valor}
                        onChange={e => setDeskDraft(prev => ({ ...prev, valor: e.target.value }))}
                      />
                    </div>
                    <div className="min-w-0">
                      <span className={modalLabelCls}>Data</span>
                      <input
                        type="date"
                        className={modalFieldCls}
                        value={deskDraft.data}
                        onChange={e => setDeskDraft(prev => ({ ...prev, data: e.target.value }))}
                      />
                    </div>

                    <div className="col-span-2 min-w-0">
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
                      <p className="col-span-2 px-2.5 py-1.5 border border-[#D81E1E]/35 bg-[#D81E1E]/[0.06] text-[11px] font-bold text-[#B91818] dark:text-red-400">{deskDraft.error}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-3.5 py-2.5 bg-[#EFE7CD] dark:bg-[#181814] border-t border-[#DDD2B0] dark:border-white/[0.08] flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowDeskModal(false)}
                  className="ml-auto h-9 px-[18px] border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-[12px] font-extrabold uppercase tracking-[0.04em] text-on-surface hover:bg-on-surface/[0.05] active:scale-[0.97] transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveDeskDraft}
                  disabled={deskDraft.saving}
                  className="h-9 px-[18px] flex items-center justify-center gap-2 bg-[#D81E1E] hover:bg-[#B91818] text-white text-[12px] font-extrabold uppercase tracking-[0.04em] active:scale-[0.97] transition-all disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  {deskDraft.saving
                    ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <><Check size={14} strokeWidth={2.8} /> Salvar registro</>
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
