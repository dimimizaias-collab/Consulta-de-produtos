'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type Employee, tempoDeCasa } from '@/lib/hrEmployees';
import { type Contrato, ANOS_FISCAIS, earliestAdmissao } from '@/lib/hrContratos';
import { EmployeeCard } from './EmployeeCard';
import { YearAddMenu } from './YearAddMenu';

interface ColaboradoresYearAccordionProps {
  employees: Employee[];
  contratos: Contrato[];
  onEditEmployee: (employee: Employee) => void;
  onNovoColaborador: (ano: number) => void;
  onVincularExistente: (ano: number) => void;
  size?: 'full' | 'compact';
}

function pickContratoDoAno(contratosDoColaborador: Contrato[], ano: number): Contrato | null {
  const doAno = contratosDoColaborador.filter(c => c.ano === ano);
  if (doAno.length === 0) return null;
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;
  if (ano === anoAtual) {
    const vigente = doAno.find(c => c.mes_inicio <= mesAtual && mesAtual <= c.mes_fim);
    if (vigente) return vigente;
  }
  return doAno.reduce((last, c) => (c.mes_fim > last.mes_fim ? c : last), doAno[0]);
}

export function ColaboradoresYearAccordion({
  employees, contratos, onEditEmployee, onNovoColaborador, onVincularExistente, size = 'full',
}: ColaboradoresYearAccordionProps) {
  const [openYear, setOpenYear] = useState<number>(ANOS_FISCAIS[0]);
  const isFull = size === 'full';

  return (
    <div className="flex flex-col gap-3.5">
      {ANOS_FISCAIS.map(ano => {
        const isOpen = openYear === ano;
        const cardsDoAno = employees
          .map(emp => {
            const contratosDoColaborador = contratos.filter(c => c.colaborador_id === emp.id);
            const contrato = pickContratoDoAno(contratosDoColaborador, ano);
            if (!contrato) return null;
            const admissaoOriginal = earliestAdmissao(contratosDoColaborador) ?? contrato.data_admissao;
            return { emp, contrato, tempoDeCasaLabel: tempoDeCasa(admissaoOriginal) };
          })
          .filter((v): v is { emp: Employee; contrato: Contrato; tempoDeCasaLabel: string } => v !== null);

        return (
          <div key={ano} className={cn('bg-surface-container border border-on-surface/[0.07] overflow-hidden', isFull ? 'rounded-[22px]' : 'rounded-[18px]')}>
            <div
              onClick={() => setOpenYear(isOpen ? -1 : ano)}
              className={cn('flex items-center gap-3.5 cursor-pointer', isFull ? 'px-[22px] py-[18px]' : 'px-3.5 py-3')}
            >
              <div className={cn(
                'rounded-[10px] bg-on-surface/[0.06] flex items-center justify-center text-on-surface/50 flex-shrink-0 transition-transform duration-200',
                isFull ? 'w-[30px] h-[30px]' : 'w-6 h-6',
                isOpen && 'rotate-90',
              )}>
                <ChevronRight size={isFull ? 14 : 12} strokeWidth={2.5} />
              </div>
              <div className="flex-1 flex items-baseline gap-2.5 min-w-0">
                <span className={cn('font-black text-on-surface font-manrope', isFull ? 'text-[20px]' : 'text-[15px]')}>{ano}</span>
                <span className={cn('font-extrabold text-on-surface/35 uppercase', isFull ? 'text-[11px] tracking-wide' : 'text-[9.5px]')}>
                  {cardsDoAno.length} colaborador{cardsDoAno.length !== 1 ? 'es' : ''}
                </span>
              </div>
              <YearAddMenu
                size={size}
                onNovo={() => onNovoColaborador(ano)}
                onVincular={() => onVincularExistente(ano)}
              />
            </div>

            {isOpen && (
              cardsDoAno.length === 0 ? (
                <p className={cn('text-center text-on-surface/32 font-semibold', isFull ? 'text-[12.5px] pb-7' : 'text-[11px] pb-5')}>
                  Nenhum colaborador neste ano ainda.
                </p>
              ) : (
                <div className={cn(isFull ? 'px-[22px] pb-[22px] grid grid-cols-2 gap-3.5' : 'px-3.5 pb-3.5 flex flex-col gap-2.5')}>
                  {cardsDoAno.map(({ emp, contrato, tempoDeCasaLabel }) => (
                    <EmployeeCard
                      key={`${emp.id}-${contrato.id}`}
                      employee={emp}
                      contrato={contrato}
                      tempoDeCasaLabel={tempoDeCasaLabel}
                      onClick={() => onEditEmployee(emp)}
                      size={size}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
