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
  finance: 'Finanças',
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
            'flex items-center gap-[5px] font-extrabold uppercase tracking-wider text-on-surface/40',
            size === 'full' ? 'text-[11px]' : 'text-[9px]',
          )}
        >
          <span className={cn('rounded-[2px] flex-shrink-0', size === 'full' ? 'w-[9px] h-[9px]' : 'w-[7px] h-[7px]', ORIGIN_DOT_CLS[origin])} />
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
}

export function MonthCalendar({ viewDate, setViewDate, selectedDate, setSelectedDate, eventsByDate, size = 'full' }: MonthCalendarProps) {
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

  return (
    <div>
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

          if (isFull) {
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(cell.date)}
                className={cn(
                  'text-left rounded-[14px] border min-h-[104px] p-[9px] flex flex-col gap-[5px] transition-colors',
                  cell.current ? 'bg-surface-container border-on-surface/[0.07]' : 'bg-surface-container/40 border-on-surface/[0.05] opacity-40',
                  isSelected && 'border-primary shadow-[0_0_0_1px_var(--color-primary)_inset]',
                )}
              >
                <span className={cn(
                  'text-[12px] font-bold text-on-surface/55',
                  isToday && 'bg-[#FFE500] text-[#1A1A0E] w-[22px] h-[22px] rounded-[7px] flex items-center justify-center font-black',
                )}>
                  {cell.date.getDate()}
                </span>
                {dayEvents.slice(0, 2).map(ev => (
                  <span
                    key={ev.id}
                    className={cn(
                      'text-[9px] font-extrabold px-[6px] py-[3px] rounded-[6px] truncate',
                      ev.origin === 'hr' && 'bg-[rgba(79,70,229,0.10)] dark:bg-[rgba(129,140,248,0.16)] text-[#4338CA] dark:text-[#A5B4FC]',
                      ev.origin === 'task' && 'bg-[rgba(234,88,12,0.10)] dark:bg-[rgba(251,146,60,0.16)] text-[#C2410C] dark:text-[#FDBA74]',
                      ev.origin === 'finance' && 'bg-[rgba(180,83,9,0.10)] dark:bg-[rgba(251,191,36,0.16)] text-[#92400E] dark:text-[#FCD34D]',
                    )}
                  >
                    {ev.title}
                  </span>
                ))}
                {dayEvents.length > 2 && (
                  <span className="text-[9px] font-extrabold text-on-surface/30 px-[6px]">+{dayEvents.length - 2} mais</span>
                )}
              </button>
            );
          }

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
