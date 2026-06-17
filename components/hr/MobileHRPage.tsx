'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, Trash2, CalendarDays, ClipboardCheck, Wallet, CalendarRange, Users, BookText, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import {
  buildHrEvents, buildTaskEvents, buildFinanceEvents, groupEventsByDate, dateKey,
  type CalendarEvent, type HREvent,
} from '@/lib/hrCalendarEvents';
import { MonthCalendar, CalendarLegend } from '@/components/hr/MonthCalendar';
import { EmployeeCard } from '@/components/hr/EmployeeCard';
import { EmployeeModal } from '@/components/hr/EmployeeModal';
import { CaderninhoTable } from '@/components/hr/CaderninhoTable';
import { type Employee } from '@/lib/hrEmployees';

type HRView = 'calendario' | 'colaboradores' | 'caderninho';

const CATEGORIES: HREvent['categoria'][] = ['Reunião', 'Treinamento', 'Férias', 'Aniversário', 'Outro'];

type EventForm = {
  titulo: string;
  data: string;
  categoria: HREvent['categoria'];
  responsavel: string;
};

function emptyForm(date: Date): EventForm {
  return { titulo: '', data: date.toISOString().split('T')[0], categoria: 'Reunião', responsavel: '' };
}

const fmtShort = (v: number) => {
  if (Math.abs(v) >= 1000) return `R$${(v / 1000).toFixed(1)}k`;
  return `R$${v.toFixed(0)}`;
};

interface MobileHRPageProps {
  requests: any[];
  onOpenTask: (request: any, taskData: any) => void;
  onGoToFinance: () => void;
}

export function MobileHRPage({ requests, onOpenTask, onGoToFinance }: MobileHRPageProps) {
  const [activeView, setActiveView] = useState<HRView>('calendario');
  const [hrEvents, setHrEvents] = useState<HREvent[]>([]);
  const [financeTransactions, setFinanceTransactions] = useState<any[]>([]);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [showSheet, setShowSheet] = useState(false);
  const [editingEvent, setEditingEvent] = useState<HREvent | null>(null);
  const [form, setForm] = useState<EventForm>(() => emptyForm(new Date()));
  const [saving, setSaving] = useState(false);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showEmployeeSheet, setShowEmployeeSheet] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const [isHRUnlocked, setIsHRUnlocked] = useState(false);
  const [showPasswordSheet, setShowPasswordSheet] = useState(false);
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

  const fetchHrPassword = async () => {
    const { data } = await supabase.from('store_settings').select('hr_password').eq('id', 'default').maybeSingle();
    setHrPassword(data?.hr_password || '');
  };

  useEffect(() => {
    fetchHrEvents();
    fetchFinanceTransactions();
    fetchEmployees();
    fetchHrPassword();
  }, []);

  const handleProtectedTabClick = (view: HRView) => {
    if (isHRUnlocked) {
      setActiveView(view);
    } else {
      setPendingView(view);
      setPasswordInput('');
      setPasswordError('');
      setShowPasswordSheet(true);
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
      setShowPasswordSheet(false);
      setPasswordInput('');
      setPasswordError('');
    } else {
      setPasswordError('Senha incorreta.');
    }
  };

  const openCreateEmployeeSheet = () => {
    setEditingEmployee(null);
    setShowEmployeeSheet(true);
  };

  const openEditEmployeeSheet = (emp: Employee) => {
    setEditingEmployee(emp);
    setShowEmployeeSheet(true);
  };

  const allEvents: CalendarEvent[] = useMemo(() => [
    ...buildHrEvents(hrEvents),
    ...buildTaskEvents(requests),
    ...buildFinanceEvents(financeTransactions),
  ], [hrEvents, requests, financeTransactions]);

  const eventsByDate = useMemo(() => groupEventsByDate(allEvents), [allEvents]);
  const selectedDayEvents = eventsByDate[dateKey(selectedDate)] ?? [];

  const openCreateSheet = () => {
    setEditingEvent(null);
    setForm(emptyForm(selectedDate));
    setShowSheet(true);
  };

  const openEditSheet = (ev: HREvent) => {
    setEditingEvent(ev);
    setForm({ titulo: ev.titulo, data: ev.data, categoria: ev.categoria, responsavel: ev.responsavel || '' });
    setShowSheet(true);
  };

  const handleSave = async () => {
    if (!form.titulo.trim()) return;
    setSaving(true);
    try {
      if (editingEvent) {
        await supabase.from('hr_events').update({
          titulo: form.titulo.trim(), data: form.data, categoria: form.categoria,
          responsavel: form.responsavel.trim() || null, updated_at: new Date().toISOString(),
        }).eq('id', editingEvent.id);
      } else {
        await supabase.from('hr_events').insert([{
          titulo: form.titulo.trim(), data: form.data, categoria: form.categoria,
          responsavel: form.responsavel.trim() || null,
        }]);
      }
      await fetchHrEvents();
      setShowSheet(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingEvent) return;
    await supabase.from('hr_events').delete().eq('id', editingEvent.id);
    await fetchHrEvents();
    setShowSheet(false);
  };

  const handleEventClick = (ev: CalendarEvent) => {
    if (ev.origin === 'hr') {
      openEditSheet(ev.raw as HREvent);
    } else if (ev.origin === 'task') {
      try {
        const changes = JSON.parse(ev.raw.requested_changes);
        onOpenTask(ev.raw, changes);
      } catch { /* ignora */ }
    } else if (ev.origin === 'finance') {
      onGoToFinance();
    }
  };

  const fieldCls = 'w-full bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]';
  const labelCls = 'text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block';

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#FDFAF0] dark:bg-[#1E1E18] pb-[72px]">

      {/* Header */}
      <div className="shrink-0 bg-[#FFE500] dark:bg-[#252520] border-b border-[#D4C000] dark:border-white/[0.07] pt-14 px-4 pb-4">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[rgba(26,26,10,0.40)] mb-0.5">Planejamento</p>
        <h1 className="text-[19px] font-black text-[#1A1A0E] tracking-tight leading-none">Recursos Humanos</h1>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex gap-1.5 px-3 pt-3">
        <button
          onClick={() => setActiveView('calendario')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 py-2.5 rounded-[13px] text-[9.5px] font-extrabold uppercase tracking-wide border-[1.5px] transition-colors',
            activeView === 'calendario'
              ? 'bg-[rgba(216,30,30,0.10)] border-[rgba(216,30,30,0.30)] text-[#D81E1E]'
              : 'border-[rgba(26,26,10,0.12)] dark:border-white/[0.10] text-[rgba(26,26,10,0.50)] dark:text-white/40',
          )}
        >
          <CalendarRange size={12} strokeWidth={2.5} />
          Calendário
        </button>
        <button
          onClick={() => handleProtectedTabClick('colaboradores')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 py-2.5 rounded-[13px] text-[9.5px] font-extrabold uppercase tracking-wide border-[1.5px] transition-colors',
            activeView === 'colaboradores'
              ? 'bg-[rgba(216,30,30,0.10)] border-[rgba(216,30,30,0.30)] text-[#D81E1E]'
              : 'border-[rgba(26,26,10,0.12)] dark:border-white/[0.10] text-[rgba(26,26,10,0.50)] dark:text-white/40',
          )}
        >
          <Users size={12} strokeWidth={2.5} />
          Colaboradores
          {!isHRUnlocked && <Lock size={9} strokeWidth={2.5} className="opacity-40" />}
        </button>
        <button
          onClick={() => handleProtectedTabClick('caderninho')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 py-2.5 rounded-[13px] text-[9.5px] font-extrabold uppercase tracking-wide border-[1.5px] transition-colors',
            activeView === 'caderninho'
              ? 'bg-[rgba(216,30,30,0.10)] border-[rgba(216,30,30,0.30)] text-[#D81E1E]'
              : 'border-[rgba(26,26,10,0.12)] dark:border-white/[0.10] text-[rgba(26,26,10,0.50)] dark:text-white/40',
          )}
        >
          <BookText size={12} strokeWidth={2.5} />
          Caderninho
          {!isHRUnlocked && <Lock size={9} strokeWidth={2.5} className="opacity-40" />}
        </button>
      </div>

      {/* Primary action */}
      {activeView !== 'caderninho' && (
        <button
          onClick={activeView === 'calendario' ? openCreateSheet : openCreateEmployeeSheet}
          className="shrink-0 mx-3 mt-2.5 bg-[#D81E1E] text-white font-extrabold text-[11.5px] uppercase tracking-wide py-3 rounded-[13px] shadow-[0_8px_18px_rgba(216,30,30,0.30)] flex items-center justify-center gap-1.5"
        >
          <Plus size={14} strokeWidth={2.8} />
          {activeView === 'calendario' ? 'Novo Evento' : 'Novo Colaborador'}
        </button>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {activeView === 'calendario' ? (
          <>
            <div className="px-3 pt-3">
              <CalendarLegend size="compact" />
            </div>

            <div className="mx-3 mt-3 bg-white dark:bg-[#252520] border border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] rounded-[18px] p-4">
              <MonthCalendar
                viewDate={viewDate} setViewDate={setViewDate}
                selectedDate={selectedDate} setSelectedDate={setSelectedDate}
                eventsByDate={eventsByDate} size="compact"
              />
            </div>

            <div className="px-4 pt-4 pb-2 text-[9px] font-black uppercase tracking-[0.18em] text-[rgba(26,26,10,0.25)] dark:text-white/22">
              Eventos · {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
            </div>

            {selectedDayEvents.length === 0 ? (
              <p className="text-sm text-on-surface/35 py-6 text-center px-4">Nenhum evento neste dia.</p>
            ) : (
              <div className="px-3 pb-6 flex flex-col gap-2">
                {selectedDayEvents.map(ev => (
                  <button
                    key={ev.id}
                    onClick={() => handleEventClick(ev)}
                    className="flex items-center justify-between gap-2.5 bg-white dark:bg-[#252520] border-[1.5px] border-[rgba(26,26,10,0.08)] dark:border-white/[0.08] rounded-2xl px-3.5 py-3 text-left"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn(
                        'w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0',
                        ev.origin === 'hr' && 'bg-[rgba(79,70,229,0.10)] dark:bg-[rgba(129,140,248,0.14)] text-[#4F46E5] dark:text-[#A5B4FC]',
                        ev.origin === 'task' && 'bg-[rgba(234,88,12,0.10)] dark:bg-[rgba(251,146,60,0.14)] text-[#EA580C] dark:text-[#FDBA74]',
                        ev.origin === 'finance' && 'bg-[rgba(180,83,9,0.10)] dark:bg-[rgba(251,191,36,0.14)] text-[#B45309] dark:text-[#FCD34D]',
                      )}>
                        {ev.origin === 'hr' && <CalendarDays size={14} strokeWidth={2.3} />}
                        {ev.origin === 'task' && <ClipboardCheck size={14} strokeWidth={2.3} />}
                        {ev.origin === 'finance' && <Wallet size={14} strokeWidth={2.3} />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3] truncate">{ev.title}</div>
                        <div className="text-[9.5px] font-semibold text-[rgba(26,26,10,0.38)] dark:text-white/28 truncate">{ev.subtitle}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {ev.classificacao && (
                        <span className={cn(
                          'text-[8.5px] font-extrabold uppercase tracking-wide px-[7px] py-[3px] rounded-[7px]',
                          ev.classificacao === 'Alta' && 'bg-red-500/15 text-red-600 dark:text-red-400',
                          ev.classificacao === 'Média' && 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
                          ev.classificacao === 'Baixa' && 'bg-green-500/15 text-green-700 dark:text-green-400',
                        )}>
                          {ev.classificacao}
                        </span>
                      )}
                      {ev.amount != null && (
                        <span className={cn(
                          "font-['DM_Mono',monospace] text-[12.5px] font-bold",
                          ev.amountKind === 'rec' ? 'text-[#059669] dark:text-[#34D399]' : 'text-[#E11D48] dark:text-[#F43F5E]',
                        )}>
                          {ev.amountKind === 'rec' ? '+' : '−'}{fmtShort(ev.amount)}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : activeView === 'colaboradores' ? (
          <div className="px-3 pt-3 pb-6 flex flex-col gap-2.5">
            {employees.length === 0 ? (
              <p className="text-sm text-on-surface/35 py-10 text-center">Nenhum colaborador cadastrado ainda.</p>
            ) : (
              employees.map(emp => (
                <EmployeeCard key={emp.id} employee={emp} onClick={() => openEditEmployeeSheet(emp)} size="compact" />
              ))
            )}
          </div>
        ) : (
          <CaderninhoTable employees={employees} compact />
        )}
      </div>

      <EmployeeModal
        open={showEmployeeSheet}
        employee={editingEmployee}
        onClose={() => setShowEmployeeSheet(false)}
        onSaved={fetchEmployees}
        variant="sheet"
      />

      {/* Bottom sheet de senha */}
      <AnimatePresence>
        {showPasswordSheet && (
          <>
            <motion.div
              key="pwd-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/45 z-[59]" onClick={() => setShowPasswordSheet(false)}
            />
            <motion.div
              key="pwd-sheet"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="fixed inset-x-0 bottom-0 z-[60] bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-t-[28px] shadow-2xl overflow-hidden flex flex-col"
              style={{ maxHeight: '60svh' }}
            >
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 rounded-full bg-[rgba(26,26,10,0.15)] dark:bg-white/20" />
              </div>

              <div className="flex-1 overflow-y-auto px-5 pb-6 pt-3 flex flex-col items-center gap-4">
                <div className="w-14 h-14 rounded-[1.2rem] bg-[rgba(216,30,30,0.10)] text-[#D81E1E] flex items-center justify-center">
                  <Lock size={24} strokeWidth={2.2} />
                </div>
                <div className="text-center">
                  <p className="text-[16px] font-black text-[#1A1A0E] dark:text-[#F2F0E3]">Área Restrita</p>
                  <p className="text-[12px] text-[rgba(26,26,10,0.45)] dark:text-white/40 font-medium mt-0.5">
                    {hrPassword ? 'Digite a senha para continuar' : 'Configure uma senha em Configurações'}
                  </p>
                </div>

                {hrPassword && (
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={e => { setPasswordInput(e.target.value); setPasswordError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
                    placeholder="Senha"
                    autoFocus
                    className="w-full bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-4 py-3 text-[14px] font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]"
                  />
                )}

                {passwordError && (
                  <p className="text-[11.5px] text-red-500 font-semibold self-start">{passwordError}</p>
                )}

                <div className="flex gap-2 w-full mt-1">
                  <button
                    onClick={() => setShowPasswordSheet(false)}
                    className="flex-1 py-3 rounded-[13px] text-[11.5px] font-extrabold uppercase tracking-wide bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.06] text-[rgba(26,26,10,0.50)] dark:text-white/40"
                  >
                    Cancelar
                  </button>
                  {hrPassword && (
                    <button
                      onClick={handlePasswordSubmit}
                      className="flex-[2] py-3 rounded-[13px] text-[11.5px] font-extrabold uppercase tracking-wide bg-[#D81E1E] text-white shadow-[0_8px_18px_rgba(216,30,30,0.30)]"
                    >
                      Entrar
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom sheet criar/editar evento */}
      <AnimatePresence>
        {showSheet && (
          <>
            <motion.div
              key="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/45 z-[59]" onClick={() => setShowSheet(false)}
            />
            <motion.div
              key="sheet"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="fixed inset-x-0 bottom-0 z-[60] bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-t-[28px] shadow-2xl overflow-hidden flex flex-col"
              style={{ maxHeight: '90svh' }}
            >
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 rounded-full bg-[rgba(26,26,10,0.15)] dark:bg-white/20" />
              </div>

              <div className="flex items-center justify-between px-4 pb-3 shrink-0">
                <span className="text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3]">{editingEvent ? 'Editar Evento' : 'Novo Evento'}</span>
                <button
                  onClick={() => setShowSheet(false)}
                  className="w-8 h-8 rounded-full bg-[rgba(26,26,10,0.07)] dark:bg-white/[0.07] flex items-center justify-center text-[rgba(26,26,10,0.45)] dark:text-white/35 active:scale-90 transition-transform"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-4">
                <div>
                  <span className={labelCls}>Título</span>
                  <input className={fieldCls} value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ex: Treinamento PDV" />
                </div>
                <div>
                  <span className={labelCls}>Data</span>
                  <input type="date" className={fieldCls} value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} />
                </div>
                <div>
                  <span className={labelCls}>Categoria</span>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat} onClick={() => setForm({ ...form, categoria: cat })}
                        className={cn(
                          'px-3 py-2 rounded-[10px] text-[10.5px] font-bold border-[1.5px] transition-colors',
                          form.categoria === cat
                            ? 'bg-[rgba(216,30,30,0.10)] border-[rgba(216,30,30,0.30)] text-[#D81E1E]'
                            : 'border-[rgba(26,26,10,0.10)] dark:border-white/[0.08] text-[rgba(26,26,10,0.45)] dark:text-white/35',
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className={labelCls}>Responsável</span>
                  <input className={fieldCls} value={form.responsavel} onChange={e => setForm({ ...form, responsavel: e.target.value })} placeholder="Nome do responsável" />
                </div>

                <button
                  onClick={handleSave} disabled={saving || !form.titulo.trim()}
                  className="w-full bg-[#D81E1E] text-white font-extrabold text-[12.5px] uppercase tracking-wide py-3.5 rounded-[13px] shadow-[0_10px_22px_rgba(216,30,30,0.28)] mt-1 disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar Evento'}
                </button>

                {editingEvent && (
                  <button onClick={handleDelete} className="w-full text-center text-[11px] font-extrabold text-red-600 dark:text-red-400 uppercase tracking-wide flex items-center justify-center gap-1.5 py-1">
                    <Trash2 size={12} /> Excluir Evento
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
