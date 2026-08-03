'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Plus, X, Trash2, ChevronLeft, ChevronRight, CalendarDays, ClipboardCheck, Wallet, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
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

  const [isHRUnlocked, setIsHRUnlocked] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingView, setPendingView] = useState<HRView | null>(null);
  const [hrPassword, setHrPassword] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

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

  const fetchHrPassword = async () => {
    const { data } = await supabase.from('store_settings').select('hr_password').eq('id', 'default').maybeSingle();
    setHrPassword(data?.hr_password || '');
  };

  useEffect(() => {
    fetchHrEvents();
    fetchFinanceTransactions();
    fetchEmployees();
    fetchContratos();
    fetchHrPassword();
  }, []);

  const handleProtectedTabClick = (view: HRView) => {
    if (isHRUnlocked) {
      setActiveView(view);
    } else {
      setPendingView(view);
      setPasswordInput('');
      setPasswordError('');
      setShowPasswordModal(true);
    }
  };

  const handlePasswordSubmit = () => {
    if (!hrPassword) {
      setPasswordError('Configure uma senha em Configurações para acessar esta área.');
      return;
    }
    if (passwordInput === hrPassword) {
      setIsHRUnlocked(true);
      if (pendingView) setActiveView(pendingView);
      setShowPasswordModal(false);
      setPasswordInput('');
      setPasswordError('');
    } else {
      setPasswordError('Senha incorreta.');
    }
  };

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

  return (
    <div className="max-w-[1300px]">
      {/* Header */}
      <div className="relative mb-14">
        <div className="bg-[#FFE500] dark:bg-[#252520] border border-[#D4C000] dark:border-white/[0.07] rounded-tl-[20px] rounded-tr-[20px] rounded-br-[20px] px-6 py-5 flex items-center gap-3.5">
          <div className="w-[52px] h-[52px] rounded-[14px] bg-[rgba(26,26,10,0.09)] dark:bg-[rgba(216,30,30,0.13)] flex items-center justify-center text-[#1A1A0E] dark:text-primary shrink-0">
            <Users size={24} strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-[26px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] tracking-tight leading-tight">Recursos Humanos</h1>
            <div className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-[rgba(26,26,10,0.40)] dark:text-white/[0.28]">Planejamento Interno</div>
          </div>
        </div>

        <div className="absolute left-0 top-full flex">
          {([
            { key: 'calendario', label: 'Calendário' },
            { key: 'financas', label: 'Finanças' },
            { key: 'colaboradores', label: 'Colaboradores' },
            { key: 'caderninho', label: 'Caderninho' },
          ] as const).map((tab, i, arr) => {
            const HEADER_TAB_LABEL_MAX = 12;
            const label = tab.label.length > HEADER_TAB_LABEL_MAX
              ? tab.label.slice(0, HEADER_TAB_LABEL_MAX - 1) + '…'
              : tab.label;
            const active = activeView === tab.key;
            const protectedTab = tab.key === 'colaboradores' || tab.key === 'caderninho';
            return (
              <button
                key={tab.key}
                title={tab.label}
                onClick={() => protectedTab ? handleProtectedTabClick(tab.key) : setActiveView(tab.key)}
                className={cn(
                  'w-[136px] h-[34px] flex items-center justify-center shrink-0',
                  'bg-[#FFE500] dark:bg-[#252520] border border-t-0 border-[#D4C000] dark:border-white/[0.07]',
                  i === arr.length - 1 && 'rounded-br-[12px]',
                  'text-[12px] font-extrabold uppercase tracking-wide truncate',
                  'shadow-[inset_0_6px_8px_-5px_rgba(26,26,10,0.35)] dark:shadow-[inset_0_6px_8px_-5px_rgba(0,0,0,0.55)]',
                  'transition-[opacity,transform] duration-150 active:scale-[0.97]',
                  active
                    ? 'text-[#1A1A0E] dark:text-[#F2F0E3] opacity-100'
                    : 'text-[#1A1A0E] dark:text-white/75 opacity-55 hover:opacity-85'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {activeView === 'calendario' ? (
        <>
          <div className="bg-surface-container-low border border-on-surface/[0.07] rounded-[18px] overflow-hidden">
            <div className="bg-[#FFE500] dark:bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] px-4 py-2.5 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-black text-[#1A1A0E] capitalize whitespace-nowrap min-w-[140px]">{hrMonthLabel}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
                    className="w-[26px] h-[26px] rounded-[8px] bg-[rgba(26,26,10,0.08)] flex items-center justify-center text-[rgba(26,26,10,0.55)] hover:bg-[rgba(26,26,10,0.14)] transition-colors"
                  >
                    <ChevronLeft size={12} strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
                    className="w-[26px] h-[26px] rounded-[8px] bg-[rgba(26,26,10,0.08)] flex items-center justify-center text-[rgba(26,26,10,0.55)] hover:bg-[rgba(26,26,10,0.14)] transition-colors"
                  >
                    <ChevronRight size={12} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
              <button
                onClick={openCreateModal}
                title="Novo Evento"
                className="w-[26px] h-[26px] rounded-[8px] bg-[#D81E1E] text-white flex items-center justify-center active:scale-90 transition-transform"
              >
                <Plus size={14} strokeWidth={2.8} />
              </button>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <CalendarLegend size="full" />
              </div>
              <MonthCalendar
                viewDate={viewDate} setViewDate={setViewDate}
                selectedDate={selectedDate} setSelectedDate={setSelectedDate}
                eventsByDate={eventsByDate} size="full" hideHeader
              />
            </div>
          </div>

          <div className="mt-6 bg-surface-container border border-on-surface/[0.07] rounded-[20px] p-5">
            <div className="flex items-center justify-between mb-3.5">
              <span className="text-[15px] font-extrabold text-on-surface">
                Eventos · {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface/35">
                {selectedDayEvents.length} {selectedDayEvents.length === 1 ? 'evento' : 'eventos'}
              </span>
            </div>

            {selectedDayEvents.length === 0 ? (
              <p className="text-sm text-on-surface/35 py-6 text-center">Nenhum evento neste dia.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {selectedDayEvents.map(ev => (
                  <button
                    key={ev.id}
                    onClick={() => handleEventClick(ev)}
                    className="flex items-center justify-between gap-3.5 px-3.5 py-3 rounded-[14px] bg-surface border border-on-surface/[0.07] hover:border-on-surface/[0.14] transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        'w-[38px] h-[38px] rounded-xl flex items-center justify-center flex-shrink-0',
                        ev.origin === 'hr' && 'bg-[rgba(79,70,229,0.10)] dark:bg-[rgba(129,140,248,0.14)] text-[#4F46E5] dark:text-[#A5B4FC]',
                        ev.origin === 'task' && 'bg-[rgba(234,88,12,0.10)] dark:bg-[rgba(251,146,60,0.14)] text-[#EA580C] dark:text-[#FDBA74]',
                        ev.origin === 'finance' && 'bg-[rgba(180,83,9,0.10)] dark:bg-[rgba(251,191,36,0.14)] text-[#B45309] dark:text-[#FCD34D]',
                      )}>
                        {ev.origin === 'hr' && <CalendarDays size={17} strokeWidth={2.3} />}
                        {ev.origin === 'task' && <ClipboardCheck size={17} strokeWidth={2.3} />}
                        {ev.origin === 'finance' && <Wallet size={17} strokeWidth={2.3} />}
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[13.5px] font-extrabold text-on-surface truncate">{ev.title}</span>
                        <span className="text-[11px] font-semibold text-on-surface/40 truncate">{ev.subtitle}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                      {ev.classificacao && (
                        <span className={cn(
                          'text-[9.5px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-lg',
                          ev.classificacao === 'Alta' && 'bg-red-500/15 text-red-600 dark:text-red-400',
                          ev.classificacao === 'Média' && 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
                          ev.classificacao === 'Baixa' && 'bg-green-500/15 text-green-700 dark:text-green-400',
                        )}>
                          {ev.classificacao}
                        </span>
                      )}
                      {ev.amount != null && (
                        <span className={cn(
                          'font-mono text-[13.5px] font-bold',
                          ev.amountKind === 'rec' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                        )}>
                          {ev.amountKind === 'rec' ? '+' : '−'}{fmt(ev.amount)}
                        </span>
                      )}
                      <ChevronRight size={16} className="text-on-surface/25" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      ) : activeView === 'financas' ? (
        <DespesasPage onBack={() => setActiveView('calendario')} />
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

      {/* Modal de senha */}
      <AnimatePresence>
        {showPasswordModal && (
          <>
            <motion.div
              key="pwd-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/55 z-[60]" onClick={() => setShowPasswordModal(false)}
            />
            <motion.div
              key="pwd-modal"
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[61] w-[380px] bg-surface-container border border-on-surface/[0.08] rounded-[24px] p-6 shadow-2xl"
            >
              <div className="flex flex-col items-center gap-3 mb-5">
                <div className="w-14 h-14 rounded-[1.2rem] bg-primary/10 text-primary flex items-center justify-center">
                  <Lock size={24} strokeWidth={2.2} />
                </div>
                <div className="text-center">
                  <span className="text-[16px] font-extrabold text-on-surface block">Área Restrita</span>
                  <span className="text-[12px] text-on-surface/40 font-medium">
                    {hrPassword ? 'Digite a senha para continuar' : 'Configure uma senha em Configurações para acessar esta área'}
                  </span>
                </div>
              </div>

              {hrPassword && (
                <input
                  type="password"
                  value={passwordInput}
                  onChange={e => { setPasswordInput(e.target.value); setPasswordError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
                  placeholder="Senha"
                  autoFocus
                  className="w-full bg-surface border border-on-surface/10 rounded-xl px-4 py-3 text-[14px] text-on-surface focus:outline-none focus:border-primary/50 transition-colors mb-2"
                />
              )}

              {passwordError && (
                <p className="text-[11.5px] text-red-500 font-semibold mb-2">{passwordError}</p>
              )}

              <div className="flex gap-2.5 mt-3">
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 bg-on-surface/[0.06] border border-on-surface/[0.12] text-on-surface/55 font-extrabold text-[12.5px] uppercase tracking-wide py-3.5 rounded-[13px]"
                >
                  Cancelar
                </button>
                {hrPassword && (
                  <button
                    onClick={handlePasswordSubmit}
                    className="flex-[1.4] bg-primary text-white font-extrabold text-[12.5px] uppercase tracking-wide py-3.5 rounded-[13px] shadow-lg shadow-primary/25"
                  >
                    Entrar
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modal criar/editar evento */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              key="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/55 z-[60]" onClick={() => setShowModal(false)}
            />
            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[61] w-[460px] max-h-[88vh] overflow-y-auto bg-surface-container border border-on-surface/[0.08] rounded-[24px] p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-5">
                <span className="text-[16px] font-extrabold text-on-surface">{editingEvent ? 'Editar Evento' : 'Novo Evento'}</span>
                <button onClick={() => setShowModal(false)} className="w-[30px] h-[30px] rounded-[10px] bg-on-surface/[0.06] flex items-center justify-center text-on-surface/45">
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>

              <div className="mb-4">
                <label className="text-[10px] font-extrabold uppercase tracking-wide text-on-surface/45 mb-1.5 block">Título</label>
                <input
                  value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })}
                  placeholder="Ex: Reunião de Equipe"
                  className="w-full bg-surface border border-on-surface/[0.10] rounded-xl px-3.5 py-2.5 text-[13px] text-on-surface outline-none focus:border-primary/50"
                />
              </div>

              <div className="mb-4">
                <label className="text-[10px] font-extrabold uppercase tracking-wide text-on-surface/45 mb-1.5 block">Descrição</label>
                <textarea
                  value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })}
                  placeholder="Detalhes do evento..." rows={3}
                  className="w-full bg-surface border border-on-surface/[0.10] rounded-xl px-3.5 py-2.5 text-[13px] text-on-surface outline-none focus:border-primary/50 resize-none"
                />
              </div>

              <div className="mb-4">
                <label className="text-[10px] font-extrabold uppercase tracking-wide text-on-surface/45 mb-1.5 block">Data</label>
                <input
                  type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })}
                  className="w-full bg-surface border border-on-surface/[0.10] rounded-xl px-3.5 py-2.5 text-[13px] text-on-surface outline-none focus:border-primary/50"
                />
              </div>

              <div className="mb-4">
                <label className="text-[10px] font-extrabold uppercase tracking-wide text-on-surface/45 mb-1.5 block">Categoria</label>
                <div className="flex gap-1.5 flex-wrap">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat} onClick={() => setForm({ ...form, categoria: cat })}
                      className={cn(
                        'px-3.5 py-2 rounded-[11px] text-[11.5px] font-bold border-[1.5px] transition-colors',
                        form.categoria === cat
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : 'border-on-surface/[0.10] text-on-surface/50',
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="text-[10px] font-extrabold uppercase tracking-wide text-on-surface/45 mb-1.5 block">Responsável</label>
                <input
                  value={form.responsavel} onChange={e => setForm({ ...form, responsavel: e.target.value })}
                  placeholder="Nome do responsável"
                  className="w-full bg-surface border border-on-surface/[0.10] rounded-xl px-3.5 py-2.5 text-[13px] text-on-surface outline-none focus:border-primary/50"
                />
              </div>

              <div className="mb-5">
                <label className="text-[10px] font-extrabold uppercase tracking-wide text-on-surface/45 mb-1.5 block">Cor</label>
                <div className="flex gap-2.5">
                  {COLORS.map(color => (
                    <button
                      key={color} onClick={() => setForm({ ...form, cor: color })}
                      style={{ background: color }}
                      className={cn(
                        'w-[26px] h-[26px] rounded-[9px] border-2 transition-transform active:scale-90',
                        form.cor === color ? 'border-on-surface' : 'border-transparent',
                      )}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-on-surface/[0.06] border border-on-surface/[0.12] text-on-surface/55 font-extrabold text-[12.5px] uppercase tracking-wide py-3.5 rounded-[13px]"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave} disabled={saving || !form.titulo.trim()}
                  className="flex-[1.4] bg-primary text-white font-extrabold text-[12.5px] uppercase tracking-wide py-3.5 rounded-[13px] shadow-lg shadow-primary/25 disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar Evento'}
                </button>
              </div>

              {editingEvent && (
                <button onClick={handleDelete} className="w-full text-center text-[11px] font-extrabold text-red-600 dark:text-red-400 uppercase tracking-wide mt-3.5 flex items-center justify-center gap-1.5">
                  <Trash2 size={12} /> Excluir Evento
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
