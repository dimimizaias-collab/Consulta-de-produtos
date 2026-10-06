'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CalendarEvent, CalendarEventOrigin } from '@/lib/hrCalendarEvents';
import { dateKey } from '@/lib/hrCalendarEvents';

const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DAYS_PT_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DAYS_PT_FULL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const ORIGIN_DOT_CLS: Record<CalendarEventOrigin, string> = {
  hr: 'bg-[#4F46E5] dark:bg-[#818CF8]',
  task: 'bg-[#EA580C] dark:bg-[#FB923C]',
  finance: 'bg-[#B45309] dark:bg-[#FBBF24]',
};

export const ORIGIN_LABEL: Record<CalendarEventOrigin, string> = {
  hr: 'RH',
  task: 'Tarefa',
  finance: 'Salários',
};

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function CalendarLegend({ size = 'full' }: { size?: 'full' | 'compact' }) {
  return (
    <div className={cn('flex items-center gap-3', size === 'full' ? 'gap-[18px]' : 'gap-3')}>
      {(['hr', 'task', 'finance'] as const).map(origin => (
        <span
          key={origin}
          className={cn(
            'flex items-center gap-[5px] font-extrabold uppercase',
            size === 'full' ? 'text-[10px] tracking-[0.06em] text-on-surface/55' : 'text-[9px] tracking-wider text-on-surface/40',
          )}
        >
          <span className={cn('flex-shrink-0', size === 'full' ? 'w-[9px] h-[9px]' : 'w-[7px] h-[7px] rounded-[2px]', ORIGIN_DOT_CLS[origin])} />
          {ORIGIN_LABEL[origin]}
        </span>
      ))}
    </div>
  );
}

interface MonthCalendarProps {
  viewDate: Date;
  setViewDate: (d: Date) => void;
  selectedDate: Date;
  setSelectedDate: (d: Date) => void;
  eventsByDate: Record<string, CalendarEvent[]>;
  size?: 'full' | 'compact';
  hideHeader?: boolean;
}

export function MonthCalendar({ viewDate, setViewDate, selectedDate, setSelectedDate, eventsByDate, size = 'full', hideHeader = false }: MonthCalendarProps) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  const cells: { date: Date; current: boolean }[] = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push({ date: new Date(year, month - 1, daysInPrev - firstDay + 1 + i), current: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), current: true });
  }
  while (cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, cells.length - firstDay - daysInMonth + 1), current: false });
  }

  const t = today();
  const isFull = size === 'full';

  // Desktop: grade no padrão das tabelas do site — cabeçalho amarelo dos dias, linhas de grade,
  // hoje em amarelo, selecionado com contorno vermelho e eventos como etiquetas retas. Só as
  // semanas do mês (sem completar 6 linhas).
  if (isFull) {
    const rows = Math.ceil((firstDay + daysInMonth) / 7);
    const fullCells = cells.slice(0, rows * 7);
    return (
      <div className="border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]">
        <div className="grid grid-cols-7 bg-[#FFEC4D]">
          {DAYS_PT_FULL.map(d => (
            <div key={d} className="h-[30px] px-[9px] flex items-center text-[9px] font-black uppercase tracking-[0.1em] text-[rgba(26,26,10,0.55)] shadow-[inset_-1px_0_0_#B8A31F,inset_0_-1.5px_0_#8F7E10] last:shadow-[inset_0_-1.5px_0_#8F7E10]">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {fullCells.map((cell, i) => {
            const isToday = sameDay(cell.date, t);
            const isSelected = sameDay(cell.date, selectedDate);
            const dayEvents = eventsByDate[dateKey(cell.date)] ?? [];
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(cell.date)}
                className={cn(
                  'min-w-0 min-h-[98px] px-1.5 pt-1.5 pb-[7px] flex flex-col gap-[3px] text-left transition-colors',
                  'border-[#A8A290] dark:border-white/20',
                  i % 7 !== 6 && 'border-r',
                  i < fullCells.length - 7 && 'border-b',
                  cell.current ? 'bg-white dark:bg-[#1E1E18]' : 'bg-[#F3EEDD] dark:bg-[#191914]',
                  'hover:bg-[#FFF8D0] dark:hover:bg-white/[0.04]',
                  isSelected && 'shadow-[inset_0_0_0_2px_#D81E1E]',
                )}
              >
                <span className={cn(
                  'h-5 flex items-center font-mono text-[11.5px] font-medium',
                  isToday ? 'self-start px-[5px] bg-[#FFE500] text-[#1A1A0E]' : 'text-on-surface/55',
                  !cell.current && 'opacity-40',
                )}>
                  {String(cell.date.getDate()).padStart(2, '0')}
                </span>
                {dayEvents.slice(0, 2).map(ev => (
                  <span
                    key={ev.id}
                    className={cn(
                      'block pl-1.5 pr-[5px] py-0.5 border-l-[3px] text-[9.5px] font-extrabold truncate',
                      ev.origin === 'hr' && 'border-[#4F46E5] dark:border-[#818CF8] bg-[rgba(79,70,229,0.09)] dark:bg-[rgba(129,140,248,0.14)] text-[#4338CA] dark:text-[#A5B4FC]',
                      ev.origin === 'task' && 'border-[#EA580C] dark:border-[#FB923C] bg-[rgba(234,88,12,0.09)] dark:bg-[rgba(251,146,60,0.14)] text-[#C2410C] dark:text-[#FDBA74]',
                      ev.origin === 'finance' && 'border-[#B45309] dark:border-[#FBBF24] bg-[rgba(180,83,9,0.09)] dark:bg-[rgba(251,191,36,0.14)] text-[#92400E] dark:text-[#FCD34D]',
                    )}
                  >
                    {ev.title}
                  </span>
                ))}
                {dayEvents.length > 2 && (
                  <span className="pl-1.5 text-[9.5px] font-extrabold text-on-surface/40">+{dayEvents.length - 2} mais</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      {!hideHeader && (
        <div className={cn('flex items-center justify-between', isFull ? 'mb-[18px]' : 'mb-3')}>
          <button
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className={cn(
              'rounded-[11px] bg-on-surface/[0.06] border border-on-surface/[0.08] flex items-center justify-center text-on-surface/50 active:scale-90 transition-transform',
              isFull ? 'w-[34px] h-[34px]' : 'w-[26px] h-[26px]',
            )}
          >
            <ChevronLeft size={isFull ? 14 : 12} />
          </button>
          <span className={cn('font-extrabold text-on-surface', isFull ? 'text-[17px] min-w-[160px] text-center' : 'text-[13px]')}>
            {MONTHS_PT[month]} {year}
          </span>
          <button
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className={cn(
              'rounded-[11px] bg-on-surface/[0.06] border border-on-surface/[0.08] flex items-center justify-center text-on-surface/50 active:scale-90 transition-transform',
              isFull ? 'w-[34px] h-[34px]' : 'w-[26px] h-[26px]',
            )}
          >
            <ChevronRight size={isFull ? 14 : 12} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-7 mb-1">
        {(isFull ? DAYS_PT_FULL : DAYS_PT_SHORT).map((d, i) => (
          <div key={i} className={cn('text-center font-extrabold uppercase tracking-wider text-on-surface/30', isFull ? 'text-[10px] pb-2' : 'text-[8px] py-1')}>
            {d}
          </div>
        ))}
      </div>

      <div className={cn('grid grid-cols-7', isFull ? 'gap-[6px]' : 'gap-y-0.5')}>
        {cells.map((cell, i) => {
          const isToday = sameDay(cell.date, t);
          const isSelected = sameDay(cell.date, selectedDate);
          const dayEvents = eventsByDate[dateKey(cell.date)] ?? [];
          const origins = Array.from(new Set(dayEvents.map(e => e.origin))).slice(0, isFull ? 2 : 3);
          const extra = dayEvents.length - origins.length;

          return (
            <button
              key={i}
              onClick={() => setSelectedDate(cell.date)}
              className={cn(
                'aspect-square rounded-[7px] flex flex-col items-center justify-center relative text-[10px] font-bold',
                isToday
                  ? 'bg-[#FFE500] text-[#1A1A0E] font-black'
                  : cell.current ? 'text-on-surface/55' : 'text-on-surface/15',
                isSelected && !isToday && 'shadow-[0_0_0_1.5px_var(--color-primary)_inset] rounded-[8px]',
              )}
            >
              {cell.date.getDate()}
              {origins.length > 0 && (
                <span className="absolute bottom-[3px] left-1/2 -translate-x-1/2 flex gap-[2px]">
                  {origins.map(o => (
                    <span key={o} className={cn('w-[3.5px] h-[3.5px] rounded-full', ORIGIN_DOT_CLS[o])} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
