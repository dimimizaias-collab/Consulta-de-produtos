'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, Trash2, ChevronLeft, ChevronRight, CalendarDays, ClipboardCheck, Wallet, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import { squareTabCls } from '@/components/shared/squareTabs';
import { supabase } from '@/lib/supabase';
import {
  buildHrEvents, buildTaskEvents, buildFinanceEvents, groupEventsByDate, dateKey,
  type CalendarEvent, type HREvent,
} from '@/lib/hrCalendarEvents';
import { MonthCalendar, CalendarLegend } from '@/components/hr/MonthCalendar';
import { ColaboradoresYearAccordion } from '@/components/hr/ColaboradoresYearAccordion';
import { EmployeeModal } from '@/components/hr/EmployeeModal';
import { VincularExistenteModal } from '@/components/hr/VincularExistenteModal';
import { CaderninhoTable } from '@/components/hr/CaderninhoTable';
import { DespesasPage } from '@/components/finance/DespesasPage';
import { type Employee } from '@/lib/hrEmployees';
import { type Contrato, fetchAllContratos } from '@/lib/hrContratos';

type HRView = 'calendario' | 'colaboradores' | 'caderninho' | 'financas';

const CATEGORIES: HREvent['categoria'][] = ['Reunião', 'Treinamento', 'Férias', 'Aniversário', 'Outro'];
const COLORS = ['#4F46E5', '#EA580C', '#059669', '#B45309', '#DB2777', '#D81E1E'];

type EventForm = {
  titulo: string;
  descricao: string;
  data: string;
  categoria: HREvent['categoria'];
  responsavel: string;
  cor: string;
};

function emptyForm(date: Date): EventForm {
  return {
    titulo: '', descricao: '',
    data: date.toISOString().split('T')[0],
    categoria: 'Reunião', responsavel: '', cor: COLORS[0],
  };
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const TABS: { key: HRView; label: string }[] = [
  { key: 'calendario', label: 'Calendário' },
  { key: 'financas', label: 'Finanças' },
  { key: 'colaboradores', label: 'Colaboradores' },
  { key: 'caderninho', label: 'Caderninho' },
];

// Padrão quadrado do site (mesmo dos modais de Fornecedor/Etiquetas).
const sectionCls = 'bg-[#F1EAD3] dark:bg-[#181814] border border-[#E0D8BF] dark:border-white/[0.10]';
const sectionHeadCls = 'h-7 flex items-center gap-2 px-2.5 bg-[#FFEC4D] border-b-[1.5px] border-[#8F7E10]';
const sectionTitleCls = 'text-[9px] font-black uppercase tracking-[0.1em] text-[rgba(26,26,10,0.55)]';
const sectionCountCls = 'ml-auto text-[10px] font-extrabold text-[rgba(26,26,10,0.55)]';
const labelCls = 'block text-[9px] font-black uppercase tracking-[0.1em] text-[#1A1A0E]/[0.58] dark:text-[#F2F0E3]/55 pl-px mb-1';
const inputCls = 'w-full min-w-0 h-[34px] px-2.5 bg-white dark:bg-[#1E1E18] text-[13px] font-semibold text-on-surface border border-[#E0D8BF] dark:border-white/[0.10] outline-none caret-[#D81E1E] hover:border-[#CFC4A2] dark:hover:border-white/[0.20] focus:!border-[#D81E1E] focus:shadow-[0_0_0_2px_rgba(216,30,30,0.12)] placeholder:text-on-surface/25 placeholder:font-medium transition-[border-color,box-shadow]';
const btnCls = 'h-9 px-[18px] flex items-center justify-center gap-2 border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-[12px] font-extrabold uppercase tracking-[0.04em] text-on-surface hover:bg-on-surface/[0.05] active:scale-[0.97] transition-all';
const btnPrimaryCls = 'h-9 px-[18px] flex items-center justify-center gap-2 bg-[#D81E1E] hover:bg-[#B91818] text-white text-[12px] font-extrabold uppercase tracking-[0.04em] active:scale-[0.97] transition-all disabled:opacity-45 disabled:cursor-not-allowed';

interface HRManagerProps {
  requests: any[];
  onOpenTask: (request: any, taskData: any) => void;
  onGoToFinance: () => void;
}

export function HRManager({ requests, onOpenTask, onGoToFinance }: HRManagerProps) {
  const [activeView, setActiveView] = useState<HRView>('calendario');
  const [hrEvents, setHrEvents] = useState<HREvent[]>([]);
  const [financeTransactions, setFinanceTransactions] = useState<any[]>([]);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<HREvent | null>(null);
  const [form, setForm] = useState<EventForm>(() => emptyForm(new Date()));
  const [saving, setSaving] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [autoAddPeriodoAno, setAutoAddPeriodoAno] = useState<number | null>(null);
  const [showVincularModal, setShowVincularModal] = useState(false);
  const [vincularAno, setVincularAno] = useState<number | null>(null);

  const fetchHrEvents = async () => {
    const { data } = await supabase.from('hr_events').select('*').order('data', { ascending: true });
    setHrEvents(data || []);
  };
  const fetchFinanceTransactions = async () => {
    const { data } = await supabase.from('finance_transactions').select('*');
    setFinanceTransactions(data || []);
  };
  const fetchEmployees = async () => {
    const { data } = await supabase.from('hr_employees').select('*').order('nome', { ascending: true });
    setEmployees(data || []);
  };
  const fetchContratos = async () => setContratos(await fetchAllContratos());

  useEffect(() => {
    fetchHrEvents();
    fetchFinanceTransactions();
    fetchEmployees();
    fetchContratos();
  }, []);

  const handleProtectedTabClick = (view: HRView) => setActiveView(view);

  const openEditEmployeeModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setAutoAddPeriodoAno(null);
    setShowEmployeeModal(true);
  };

  const openNovoColaboradorAno = (ano: number) => {
    setEditingEmployee(null);
    setAutoAddPeriodoAno(ano);
    setShowEmployeeModal(true);
  };

  const openVincularExistente = (ano: number) => {
    setVincularAno(ano);
    setShowVincularModal(true);
  };

  const handleVincularSelect = (emp: Employee) => {
    setEditingEmployee(emp);
    setAutoAddPeriodoAno(vincularAno);
    setShowVincularModal(false);
    setShowEmployeeModal(true);
  };

  const handleEmployeeSaved = () => {
    fetchEmployees();
    fetchContratos();
  };

  const allEvents: CalendarEvent[] = useMemo(() => [
    ...buildHrEvents(hrEvents),
    ...buildTaskEvents(requests),
    ...buildFinanceEvents(financeTransactions),
  ], [hrEvents, requests, financeTransactions]);

  const eventsByDate = useMemo(() => groupEventsByDate(allEvents), [allEvents]);
  const selectedDayEvents = eventsByDate[dateKey(selectedDate)] ?? [];

  const openCreateModal = () => {
    setEditingEvent(null);
    setForm(emptyForm(selectedDate));
    setShowModal(true);
  };

  const openEditModal = (ev: HREvent) => {
    setEditingEvent(ev);
    setForm({
      titulo: ev.titulo, descricao: ev.descricao || '', data: ev.data,
      categoria: ev.categoria, responsavel: ev.responsavel || '', cor: ev.cor,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.titulo.trim()) return;
    setSaving(true);
    try {
      if (editingEvent) {
        await supabase.from('hr_events').update({
          titulo: form.titulo.trim(), descricao: form.descricao.trim() || null,
          data: form.data, categoria: form.categoria,
          responsavel: form.responsavel.trim() || null, cor: form.cor,
          updated_at: new Date().toISOString(),
        }).eq('id', editingEvent.id);
      } else {
        await supabase.from('hr_events').insert([{
          titulo: form.titulo.trim(), descricao: form.descricao.trim() || null,
          data: form.data, categoria: form.categoria,
          responsavel: form.responsavel.trim() || null, cor: form.cor,
        }]);
      }
      await fetchHrEvents();
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingEvent) return;
    await supabase.from('hr_events').delete().eq('id', editingEvent.id);
    await fetchHrEvents();
    setShowModal(false);
  };

  const handleEventClick = (ev: CalendarEvent) => {
    if (ev.origin === 'hr') {
      openEditModal(ev.raw as HREvent);
    } else if (ev.origin === 'task') {
      try {
        const changes = JSON.parse(ev.raw.requested_changes);
        onOpenTask(ev.raw, changes);
      } catch { /* ignora */ }
    } else if (ev.origin === 'finance') {
      onGoToFinance();
    }
  };

  const hrMonthLabel = viewDate.toLocaleDateString('pt-BR', { month: 'long' }).replace(/^\w/, c => c.toUpperCase())
    + ' ' + viewDate.getFullYear();

  const isSelectedToday = selectedDate.toDateString() === new Date().toDateString();
  const selectedDayLabel = selectedDate
    .toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
    .replace(/^\w/, c => c.toUpperCase());

  return (
    <div className="w-full">
      {/* Abas — penduradas direto no cabeçalho do site (o título já fica nele).
          -ml-7/-mt-5 desfazem o padding do conteúdo pra colar na barra e no menu lateral. */}
      <div className="sticky top-11 z-20 -ml-7 -mt-5 mb-3 w-max">
        <div className="flex">
          {TABS.map((tab, i) => {
            const active = activeView === tab.key;
            const protectedTab = tab.key === 'colaboradores' || tab.key === 'caderninho';
            return (
              <button
                key={tab.key}
                onClick={() => protectedTab ? handleProtectedTabClick(tab.key) : setActiveView(tab.key)}
                className={squareTabCls(active, i === 0)}
              >
                <span className={cn('transition-opacity', active ? 'opacity-100' : 'opacity-55 hover:opacity-85')}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeView === 'calendario' ? (
        <div className="space-y-2.5">
          {/* Barra de ferramentas */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]">
              <button
                onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
                className="w-7 h-[26px] flex items-center justify-center text-on-surface/45 hover:text-on-surface transition-colors"
                title="Mês anterior"
              >
                <ChevronLeft size={14} strokeWidth={2.5} />
              </button>
              <span className="h-[26px] min-w-[132px] px-2.5 flex items-center justify-center border-x border-[#E0D8BF] dark:border-white/[0.10] text-[12px] font-black text-on-surface whitespace-nowrap">
                {hrMonthLabel}
              </span>
              <button
                onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
                className="w-7 h-[26px] flex items-center justify-center text-on-surface/45 hover:text-on-surface transition-colors"
                title="Próximo mês"
              >
                <ChevronRight size={14} strokeWidth={2.5} />
              </button>
            </div>
            <button
              onClick={() => { const now = new Date(); setViewDate(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDate(now); }}
              className="h-7 px-2.5 border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-[10.5px] font-extrabold uppercase tracking-[0.05em] text-on-surface/55 hover:text-on-surface active:scale-[0.97] transition-all"
            >
              Hoje
            </button>
            <span className="w-px h-5 mx-1 bg-[#E0D8BF] dark:bg-white/[0.10]" />
            <CalendarLegend size="full" />
            <button
              onClick={openCreateModal}
              className="ml-auto h-[30px] px-3.5 flex items-center gap-1.5 bg-[#D81E1E] hover:bg-[#B91818] text-white text-[11px] font-extrabold uppercase tracking-[0.05em] active:scale-[0.97] transition-all"
            >
              <Plus size={13} strokeWidth={2.8} />
              Novo evento
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-2.5 items-start">
            <MonthCalendar
              viewDate={viewDate} setViewDate={setViewDate}
              selectedDate={selectedDate} setSelectedDate={setSelectedDate}
              eventsByDate={eventsByDate} size="full" hideHeader
            />

            {/* Eventos do dia selecionado */}
            <div className={cn(sectionCls, 'xl:sticky xl:top-[92px]')}>
              <div className={sectionHeadCls}>
                <List size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                <span className={sectionTitleCls}>Eventos do dia</span>
                <span className={sectionCountCls}>
                  {selectedDayEvents.length} {selectedDayEvents.length === 1 ? 'evento' : 'eventos'}
                </span>
              </div>
              <div className="p-2.5">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-[14px] font-black text-on-surface">{selectedDayLabel}</span>
                  {isSelectedToday && <span className="text-[11px] font-bold text-on-surface/40">hoje</span>}
                </div>

                {selectedDayEvents.length === 0 ? (
                  <div className="py-[18px] px-3 text-center border border-dashed border-[#E0D8BF] dark:border-white/[0.12] bg-white dark:bg-[#1E1E18] text-[11.5px] font-bold text-on-surface/40">
                    Nenhum evento neste dia.
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {selectedDayEvents.map((ev, idx) => (
                      <button
                        key={ev.id}
                        onClick={() => handleEventClick(ev)}
                        className={cn(
                          'flex items-center gap-2.5 px-2.5 py-2 text-left bg-white dark:bg-[#1E1E18] border border-[#B5AA86] dark:border-white/[0.10] hover:bg-[#FFF8D0] dark:hover:bg-white/[0.04] transition-colors',
                          idx > 0 && 'border-t-0',
                        )}
                      >
                        <span className={cn(
                          'w-[30px] h-[30px] flex items-center justify-center shrink-0',
                          ev.origin === 'hr' && 'bg-[rgba(79,70,229,0.09)] dark:bg-[rgba(129,140,248,0.14)] text-[#4338CA] dark:text-[#A5B4FC]',
                          ev.origin === 'task' && 'bg-[rgba(234,88,12,0.09)] dark:bg-[rgba(251,146,60,0.14)] text-[#C2410C] dark:text-[#FDBA74]',
                          ev.origin === 'finance' && 'bg-[rgba(180,83,9,0.09)] dark:bg-[rgba(251,191,36,0.14)] text-[#92400E] dark:text-[#FCD34D]',
                        )}>
                          {ev.origin === 'hr' && <CalendarDays size={15} strokeWidth={2.3} />}
                          {ev.origin === 'task' && <ClipboardCheck size={15} strokeWidth={2.3} />}
                          {ev.origin === 'finance' && <Wallet size={15} strokeWidth={2.3} />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[12.5px] font-extrabold text-on-surface truncate">{ev.title}</span>
                          <span className="block text-[10.5px] font-semibold text-on-surface/40 truncate">{ev.subtitle}</span>
                        </span>
                        {ev.classificacao && (
                          <span className={cn(
                            'shrink-0 px-1.5 py-0.5 border border-current text-[8.5px] font-black uppercase tracking-[0.06em]',
                            ev.classificacao === 'Alta' && 'text-[#D81E1E] bg-[#D81E1E]/[0.06]',
                            ev.classificacao === 'Média' && 'text-[#C2410C] dark:text-[#FDBA74] bg-orange-500/[0.06]',
                            ev.classificacao === 'Baixa' && 'text-[#0A7A55] dark:text-[#34D399] bg-emerald-500/[0.06]',
                          )}>
                            {ev.classificacao}
                          </span>
                        )}
                        {ev.amount != null && (
                          <span className={cn(
                            'shrink-0 font-mono text-[12.5px] font-medium',
                            ev.amountKind === 'rec' ? 'text-[#0A7A55] dark:text-[#34D399]' : 'text-[#B91818] dark:text-red-400',
                          )}>
                            {ev.amountKind === 'rec' ? '+' : '−'}{fmt(ev.amount)}
                          </span>
                        )}
                        <ChevronRight size={15} className="shrink-0 text-on-surface/25" />
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={openCreateModal}
                  className="mt-2 w-full h-7 flex items-center justify-center gap-1.5 border border-dashed border-[#D81E1E]/45 text-[10px] font-black uppercase tracking-[0.06em] text-[#D81E1E] hover:bg-[#D81E1E]/[0.06] transition-colors"
                >
                  <Plus size={12} strokeWidth={2.8} />
                  Novo evento neste dia
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : activeView === 'financas' ? (
        <DespesasPage />
      ) : activeView === 'colaboradores' ? (
        <ColaboradoresYearAccordion
          employees={employees}
          contratos={contratos}
          onEditEmployee={openEditEmployeeModal}
          onNovoColaborador={openNovoColaboradorAno}
          onVincularExistente={openVincularExistente}
          size="full"
        />
      ) : (
        <CaderninhoTable employees={employees} />
      )}

      <EmployeeModal
        open={showEmployeeModal}
        employee={editingEmployee}
        onClose={() => setShowEmployeeModal(false)}
        onSaved={handleEmployeeSaved}
        autoAddPeriodoAno={autoAddPeriodoAno}
      />

      <VincularExistenteModal
        open={showVincularModal}
        ano={vincularAno ?? 2026}
        employees={employees}
        onClose={() => setShowVincularModal(false)}
        onSelect={handleVincularSelect}
      />

      {/* Modal criar/editar evento */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              key="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/55" onClick={() => setShowModal(false)}
            />
            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="relative w-full max-w-[480px] max-h-[88vh] flex flex-col overflow-hidden bg-[#FDFAF0] dark:bg-[#1E1E18] border border-black/[0.12] dark:border-white/[0.08] shadow-2xl"
            >
              {/* Barra de título */}
              <div className="h-12 pl-3.5 pr-3 flex items-center gap-[11px] bg-[#FBF35E] dark:bg-[#252520] border-b border-[#D9CF45] dark:border-white/[0.08] shrink-0">
                <div className="w-[30px] h-[30px] flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
                  <CalendarDays size={15} strokeWidth={2.3} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="truncate text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight">{editingEvent ? 'Editar Evento' : 'Novo Evento'}</h4>
                  <p className="truncate text-[10.5px] font-bold text-[#1A1A0E]/50 dark:text-[#F2F0E3]/40">
                    {form.data
                      ? new Date(form.data + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())
                      : 'Calendário do RH'}
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  title="Fechar"
                  className="w-[30px] h-[30px] flex items-center justify-center shrink-0 border border-black/[0.14] dark:border-white/[0.10] text-black/50 dark:text-white/40 hover:bg-[#D81E1E]/[0.09] hover:text-[#D81E1E] hover:border-[#D81E1E]/25 active:scale-[0.93] transition-all duration-[130ms]"
                >
                  <X size={15} strokeWidth={2.6} />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3">
                <div className={sectionCls}>
                  <div className={sectionHeadCls}>
                    <CalendarDays size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                    <span className={sectionTitleCls}>Evento</span>
                  </div>
                  <div className="p-2.5 grid grid-cols-2 gap-2.5">
                    <div className="col-span-2 min-w-0">
                      <label className={labelCls}>Título</label>
                      <input
                        value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })}
                        placeholder="Ex: Reunião de Equipe"
                        className={inputCls}
                        autoFocus={!editingEvent}
                      />
                    </div>
                    <div className="col-span-2 min-w-0">
                      <label className={labelCls}>Descrição</label>
                      <textarea
                        value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })}
                        placeholder="Detalhes do evento..." rows={3}
                        className={cn(inputCls, 'h-auto py-2 resize-none leading-[1.45]')}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className={labelCls}>Data</label>
                      <input
                        type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className={labelCls}>Responsável</label>
                      <input
                        value={form.responsavel} onChange={e => setForm({ ...form, responsavel: e.target.value })}
                        placeholder="Nome do responsável"
                        className={inputCls}
                      />
                    </div>
                    <div className="col-span-2 min-w-0">
                      <label className={labelCls}>Categoria</label>
                      <div className="flex flex-wrap gap-0.5 p-0.5 bg-on-surface/[0.06] border border-[#E0D8BF] dark:border-white/[0.10]">
                        {CATEGORIES.map(cat => (
                          <button
                            key={cat} onClick={() => setForm({ ...form, categoria: cat })}
                            className={cn(
                              'h-[26px] px-2.5 text-[10px] font-black uppercase tracking-[0.05em] transition-colors duration-[130ms]',
                              form.categoria === cat ? 'bg-[#D81E1E] text-white' : 'text-on-surface/50 hover:text-on-surface',
                            )}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <label className={labelCls}>Cor</label>
                      <div className="flex gap-1.5">
                        {COLORS.map(color => (
                          <button
                            key={color} onClick={() => setForm({ ...form, cor: color })}
                            style={{ background: color }}
                            title={color}
                            className={cn(
                              'w-[26px] h-[26px] transition-transform active:scale-90',
                              form.cor === color && 'shadow-[0_0_0_2px_#FDFAF0,0_0_0_4px_#1A1A0E] dark:shadow-[0_0_0_2px_#1E1E18,0_0_0_4px_#F2F0E3]',
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-3.5 py-2.5 bg-[#EFE7CD] dark:bg-[#181814] border-t border-[#DDD2B0] dark:border-white/[0.08] flex items-center gap-2 shrink-0">
                {editingEvent && (
                  <button onClick={handleDelete} className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#D81E1E] hover:text-[#B91818] transition-colors">
                    <Trash2 size={13} /> Excluir
                  </button>
                )}
                <button onClick={() => setShowModal(false)} className={cn(btnCls, 'ml-auto')}>
                  Cancelar
                </button>
                <button onClick={handleSave} disabled={saving || !form.titulo.trim()} className={btnPrimaryCls}>
                  {saving ? 'Salvando...' : 'Salvar evento'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
