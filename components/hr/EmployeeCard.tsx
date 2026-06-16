'use client';

import { User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type Employee, fmtSalario, tempoDeCasa, initials } from '@/lib/hrEmployees';

interface EmployeeCardProps {
  employee: Employee;
  onClick: () => void;
  size?: 'full' | 'compact';
}

export function EmployeeCard({ employee, onClick, size = 'full' }: EmployeeCardProps) {
  const isFull = size === 'full';

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-4 bg-surface-container border border-on-surface/[0.07] rounded-[20px] text-left',
        'hover:border-on-surface/[0.16] transition-colors',
        isFull ? 'p-4' : 'p-3.5 gap-3',
      )}
    >
      <div className={cn(
        'rounded-2xl flex-shrink-0 overflow-hidden bg-surface flex items-center justify-center text-on-surface/30 font-black',
        isFull ? 'w-[76px] h-[76px] text-2xl' : 'w-[58px] h-[58px] text-lg',
      )}>
        {employee.foto_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={employee.foto_url} alt={employee.nome} className="w-full h-full object-cover" />
        ) : (
          employee.nome ? initials(employee.nome) : <User size={isFull ? 26 : 20} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className={cn('font-extrabold text-on-surface truncate', isFull ? 'text-[15px]' : 'text-[13.5px]')}>{employee.nome}</div>
        <div className={cn('font-bold text-[#EA580C] dark:text-[#FB923C] truncate mb-2', isFull ? 'text-[11.5px]' : 'text-[10.5px] mb-1.5')}>{employee.cargo}</div>
        <div className={cn('flex gap-3.5 flex-wrap', !isFull && 'gap-2.5')}>
          <Stat label="Loja" value={employee.loja} compact={!isFull} />
          {isFull && <Stat label="Idade" value={employee.idade ? `${employee.idade} anos` : '—'} compact={false} />}
          <Stat label="Tempo de Casa" value={tempoDeCasa(employee.data_admissao)} compact={!isFull} />
          <Stat label="Salário" value={fmtSalario(employee.salario)} money compact={!isFull} />
        </div>
      </div>
    </button>
  );
}

function Stat({ label, value, money, compact }: { label: string; value: string; money?: boolean; compact: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={cn('font-extrabold uppercase tracking-wide text-on-surface/35', compact ? 'text-[7.5px]' : 'text-[8px]')}>{label}</span>
      <span className={cn(
        'font-bold text-on-surface/75',
        compact ? 'text-[10.5px]' : 'text-[11.5px]',
        money && "font-['DM_Mono',monospace] text-emerald-600 dark:text-emerald-400",
      )}>
        {value}
      </span>
    </div>
  );
}
