'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Plus, X, Trash2, ChevronRight, CalendarDays, ClipboardCheck, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import {
  buildHrEvents, buildTaskEvents, buildFinanceEvents, groupEventsByDate, dateKey,
  type CalendarEvent, type HREvent,
} from '@/lib/hrCalendarEvents';
import { MonthCalendar, CalendarLegend } from '@/components/hr/MonthCalendar';

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
  const [hrEvents, setHrEvents] = useState<HREvent[]>([]);
  const [financeTransactions, setFinanceTransactions] = useState<any[]>([]);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<HREvent | null>(null);
  const [form, setForm] = useState<EventForm>(() => emptyForm(new Date()));
  const [saving, setSaving] = useState(false);

  const fetchHrEvents = async () => {
    const { data } = await supabase.from('hr_events').select('*').order('data', { ascending: true });
    setHrEvents(data || []);
  };
  const fetchFinanceTransactions = async () => {
    const { data } = await supabase.from('finance_transactions').select('*');
    setFinanceTransactions(data || []);
  };

  useEffect(() => {
    fetchHrEvents();
    fetchFinanceTransactions();
  }, []);

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

  return (
    <div className="max-w-[1300px]">
      <div className="flex items-center justify-between mb-7">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-[1.5rem] bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/20">
            <Users size={28} strokeWidth={2.2} />
          </div>
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-on-surface/45">Planejamento Interno</div>
            <h1 className="text-3xl font-black text-on-surface tracking-tight">Recursos Humanos</h1>
          </div>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-primary text-white px-8 py-4 rounded-2xl font-black uppercase tracking-wide text-[13px] flex items-center gap-2 shadow-lg shadow-primary/25 active:scale-[0.97] transition-transform"
        >
          <Plus size={16} strokeWidth={2.8} />
          Novo Evento
        </button>
      </div>

      <div className="bg-surface-container border border-on-surface/[0.07] rounded-[28px] p-7">
        <div className="flex items-center justify-between mb-3">
          <CalendarLegend size="full" />
        </div>
        <MonthCalendar
          viewDate={viewDate} setViewDate={setViewDate}
          selectedDate={selectedDate} setSelectedDate={setSelectedDate}
          eventsByDate={eventsByDate} size="full"
        />
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
