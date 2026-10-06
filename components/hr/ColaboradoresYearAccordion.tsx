'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type Employee, tempoDeCasa, calcIdade, fmtSalario, initials } from '@/lib/hrEmployees';
import { type Contrato, ANOS_FISCAIS, earliestAdmissao, periodoLabel } from '@/lib/hrContratos';
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
    <div className={cn('flex flex-col', isFull ? 'gap-2' : 'gap-3.5')}>
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

        if (isFull) {
          const folha = cardsDoAno.reduce((s, { contrato }) => s + contrato.salario_base + contrato.salario_complementar, 0);
          return (
            <div key={ano} className="border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]">
              <div
                onClick={() => setOpenYear(isOpen ? -1 : ano)}
                className={cn(
                  'h-10 flex items-center gap-2.5 pl-2.5 pr-2 cursor-pointer text-[#1A1A0E]',
                  isOpen ? 'bg-[#FFEC4D] border-b-[1.5px] border-[#8F7E10]' : 'bg-[#FFF4A8] dark:bg-[#252520] dark:text-[#F2F0E3] hover:bg-[#FFEC4D] dark:hover:bg-[#2E2E28]',
                )}
              >
                <span className="w-6 h-6 flex items-center justify-center bg-black/[0.08] dark:bg-white/[0.08] shrink-0">
                  <ChevronRight size={12} strokeWidth={2.6} className={cn('transition-transform duration-200', isOpen && 'rotate-90')} />
                </span>
                <span className="text-[17px] font-black">{ano}</span>
                <span className="text-[10px] font-black uppercase tracking-[0.08em] opacity-55">
                  {cardsDoAno.length} colaborador{cardsDoAno.length !== 1 ? 'es' : ''}
                </span>
                {cardsDoAno.length > 0 && (
                  <span className="ml-3.5 text-[10px] font-black uppercase tracking-[0.08em] opacity-70">
                    Folha mensal <span className="ml-1 font-mono text-[12px] font-medium normal-case tracking-normal">{fmtSalario(folha)}</span>
                  </span>
                )}
                <span className="ml-auto">
                  <YearAddMenu size={size} onNovo={() => onNovoColaborador(ano)} onVincular={() => onVincularExistente(ano)} />
                </span>
              </div>

              {isOpen && (
                cardsDoAno.length === 0 ? (
                  <p className="py-6 text-center text-[11.5px] font-bold text-on-surface/40">Nenhum colaborador neste ano ainda.</p>
                ) : (
                  <div className="overflow-x-auto [&_td]:h-[46px] [&_td]:px-2.5 [&_td]:text-[12px] [&_td]:whitespace-nowrap [&_td]:border-r [&_td]:border-b [&_td]:border-[#A8A290] dark:[&_td]:border-white/20 [&_td:last-child]:border-r-0 [&_tr:last-child_td]:border-b-0">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-[#FFF4A8] dark:bg-[#FFEC4D]">
                          {[
                            { label: 'Colaborador', cls: '' },
                            { label: 'Loja', cls: 'w-[140px]' },
                            { label: 'Idade', cls: 'w-[80px]' },
                            { label: 'Período', cls: 'w-[110px]' },
                            { label: 'Tempo de casa', cls: 'w-[140px]' },
                            { label: 'Salário', cls: 'w-[130px] text-right' },
                          ].map(c => (
                            <th key={c.label} className={cn('h-7 px-2.5 text-left text-[9px] font-black uppercase tracking-[0.1em] text-[rgba(26,26,10,0.55)] shadow-[inset_-1px_0_0_#D9CF45,inset_0_-1px_0_#B8A31F] last:shadow-[inset_0_-1px_0_#B8A31F]', c.cls)}>
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cardsDoAno.map(({ emp, contrato, tempoDeCasaLabel }, idx) => {
                          const idade = calcIdade(emp.data_nascimento);
                          return (
                            <tr
                              key={`${emp.id}-${contrato.id}`}
                              onClick={() => onEditEmployee(emp)}
                              className={cn(
                                'cursor-pointer transition-colors hover:bg-[#FFF8D0] dark:hover:bg-white/[0.04]',
                                idx % 2 === 0 ? 'bg-white dark:bg-[#252520]' : 'bg-[#FAF7EE] dark:bg-[#1E1E18]',
                              )}
                            >
                              <td>
                                <span className="flex items-center gap-2.5 min-w-0">
                                  <span className="w-[34px] h-[34px] shrink-0 overflow-hidden flex items-center justify-center bg-[#F1EAD3] dark:bg-[#181814] border border-[#E0D8BF] dark:border-white/[0.10] text-[12px] font-black text-on-surface/40">
                                    {emp.foto_url ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={emp.foto_url} alt={emp.nome} className="w-full h-full object-cover" />
                                    ) : initials(emp.nome || '?')}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block text-[12.5px] font-extrabold text-on-surface truncate">{emp.nome}</span>
                                    <span className="block text-[10.5px] font-bold text-[#C2410C] dark:text-[#FB923C] truncate">{contrato.cargo}</span>
                                  </span>
                                </span>
                              </td>
                              <td className="text-on-surface">{contrato.loja || '—'}</td>
                              <td className="text-on-surface/55">{idade != null ? `${idade} anos` : '—'}</td>
                              <td className="font-mono text-on-surface/55">{periodoLabel(contrato.mes_inicio, contrato.mes_fim)}</td>
                              <td className="text-on-surface/55">{tempoDeCasaLabel}</td>
                              <td className="text-right font-mono text-[#0A7A55] dark:text-[#34D399]">
                                {fmtSalario(contrato.salario_base + contrato.salario_complementar)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          );
        }

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
