'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trash2, Camera, User, Pencil, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { type Employee, uploadEmployeePhoto, initials, fmtSalario, parseMoneyInput, toMoneyInput, maskCpf } from '@/lib/hrEmployees';
import {
  type Contrato, ANOS_FISCAIS, MESES_ABREV, validateNoOverlap, fetchContratosByColaborador,
} from '@/lib/hrContratos';
import { generateParcelasForPeriodo, deleteUnpaidParcelasForPeriodo } from '@/lib/hrSalarioFinance';
import { SalaryEditModal } from './SalaryEditModal';

type EmployeeForm = {
  nome: string;
  data_nascimento: string;
  cpf: string;
};

function emptyForm(): EmployeeForm {
  return { nome: '', data_nascimento: '', cpf: '' };
}

function employeeToForm(emp: Employee): EmployeeForm {
  return { nome: emp.nome, data_nascimento: emp.data_nascimento ?? '', cpf: emp.cpf ?? '' };
}

interface PeriodoDraft {
  localId: string;
  contratoId: string | null;
  ano: number;
  mesInicio: number;
  mesFim: number;
  loja: string;
  cargo: string;
  dataAdmissao: string;
  salarioBase: string;
  salarioComplementar: string;
  diasUteisPagamento: string;
}

function contratoToDraft(c: Contrato): PeriodoDraft {
  return {
    localId: c.id, contratoId: c.id, ano: c.ano, mesInicio: c.mes_inicio, mesFim: c.mes_fim,
    loja: c.loja, cargo: c.cargo, dataAdmissao: c.data_admissao,
    salarioBase: toMoneyInput(c.salario_base), salarioComplementar: toMoneyInput(c.salario_complementar),
    diasUteisPagamento: String(c.dias_uteis_pagamento),
  };
}

function emptyPeriodoDraft(ano: number): PeriodoDraft {
  return {
    localId: crypto.randomUUID(), contratoId: null, ano, mesInicio: 1, mesFim: 12,
    loja: '', cargo: '', dataAdmissao: new Date().toISOString().split('T')[0],
    salarioBase: '', salarioComplementar: '', diasUteisPagamento: '5',
  };
}

interface EmployeeModalProps {
  open: boolean;
  employee: Employee | null;
  onClose: () => void;
  onSaved: () => void;
  variant?: 'modal' | 'sheet';
  autoAddPeriodoAno?: number | null;
}

export function EmployeeModal({ open, employee, onClose, onSaved, variant = 'modal', autoAddPeriodoAno }: EmployeeModalProps) {
  const [form, setForm] = useState<EmployeeForm>(emptyForm());
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [periodos, setPeriodos] = useState<PeriodoDraft[]>([]);
  const [overlapError, setOverlapError] = useState('');
  const [feriados, setFeriados] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [salaryModalOpen, setSalaryModalOpen] = useState(false);
  const [activePeriodoLocalId, setActivePeriodoLocalId] = useState<string | null>(null);
  const [draftBase, setDraftBase] = useState('');
  const [draftComplementar, setDraftComplementar] = useState('');
  const [draftDiasUteis, setDraftDiasUteis] = useState('');

  useEffect(() => {
    if (!open) return;
    setPhotoFile(null);
    setPhotoPreview(employee?.foto_url ?? null);
    setOverlapError('');

    supabase.from('hr_feriados').select('data').then(({ data }) => {
      setFeriados(new Set((data || []).map((f: { data: string }) => f.data)));
    });

    if (employee) {
      setForm(employeeToForm(employee));
      fetchContratosByColaborador(employee.id).then(contratos => {
        const drafts = contratos.map(contratoToDraft);
        if (autoAddPeriodoAno != null && !drafts.some(d => d.ano === autoAddPeriodoAno)) {
          drafts.push(emptyPeriodoDraft(autoAddPeriodoAno));
        }
        setPeriodos(drafts);
      });
    } else {
      setForm(emptyForm());
      setPeriodos([emptyPeriodoDraft(autoAddPeriodoAno ?? ANOS_FISCAIS[0])]);
    }
  }, [open, employee, autoAddPeriodoAno]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const updatePeriodo = (localId: string, patch: Partial<PeriodoDraft>) => {
    setPeriodos(prev => prev.map(p => p.localId === localId ? { ...p, ...patch } : p));
  };

  const addPeriodo = () => {
    const anoAtual = periodos[periodos.length - 1]?.ano ?? ANOS_FISCAIS[0];
    setPeriodos(prev => [...prev, emptyPeriodoDraft(anoAtual)]);
  };

  const removePeriodo = (localId: string) => {
    setPeriodos(prev => prev.filter(p => p.localId !== localId));
  };

  const openSalaryEdit = (localId: string) => {
    const p = periodos.find(pp => pp.localId === localId);
    if (!p) return;
    setDraftBase(p.salarioBase);
    setDraftComplementar(p.salarioComplementar);
    setDraftDiasUteis(p.diasUteisPagamento);
    setActivePeriodoLocalId(localId);
    setSalaryModalOpen(true);
  };

  const confirmSalaryEdit = () => {
    if (activePeriodoLocalId) {
      updatePeriodo(activePeriodoLocalId, {
        salarioBase: draftBase, salarioComplementar: draftComplementar, diasUteisPagamento: draftDiasUteis,
      });
    }
    setSalaryModalOpen(false);
  };

  const validate = (): boolean => {
    for (const ano of ANOS_FISCAIS) {
      const doAno = periodos.filter(p => p.ano === ano);
      for (let i = 0; i < doAno.length; i++) {
        const candidato = { ano, mes_inicio: doAno[i].mesInicio, mes_fim: doAno[i].mesFim };
        const outros = doAno.filter((_, idx) => idx !== i).map(p => ({ id: p.localId, mes_inicio: p.mesInicio, mes_fim: p.mesFim } as Contrato));
        if (!validateNoOverlap(outros, candidato)) {
          setOverlapError(`Períodos de ${ano} não podem se sobrepor.`);
          return false;
        }
      }
    }
    setOverlapError('');
    return true;
  };

  const handleSave = async () => {
    if (!form.nome.trim() || periodos.length === 0 || periodos.some(p => !p.dataAdmissao)) return;
    if (!validate()) return;
    setSaving(true);
    try {
      let fotoUrl = employee?.foto_url ?? null;
      if (photoFile) fotoUrl = await uploadEmployeePhoto(photoFile);

      const employeePayload = {
        nome: form.nome.trim(),
        data_nascimento: form.data_nascimento || null,
        cpf: form.cpf || null,
        foto_url: fotoUrl,
        updated_at: new Date().toISOString(),
      };

      let employeeId = employee?.id ?? null;
      if (employeeId) {
        await supabase.from('hr_employees').update(employeePayload).eq('id', employeeId);
      } else {
        const { data } = await supabase.from('hr_employees').insert([employeePayload]).select('id').single();
        employeeId = data?.id ?? null;
      }
      if (!employeeId) return;

      const originalIds = employee ? (await fetchContratosByColaborador(employeeId)).map(c => c.id) : [];
      const keptIds = new Set(periodos.map(p => p.contratoId).filter(Boolean) as string[]);
      for (const id of originalIds) {
        if (!keptIds.has(id)) {
          await deleteUnpaidParcelasForPeriodo(id);
          await supabase.from('hr_contratos').delete().eq('id', id);
        }
      }

      for (const p of periodos) {
        const contratoPayload = {
          colaborador_id: employeeId,
          ano: p.ano,
          mes_inicio: p.mesInicio,
          mes_fim: p.mesFim,
          loja: p.loja.trim(),
          cargo: p.cargo.trim(),
          data_admissao: p.dataAdmissao,
          salario_base: parseMoneyInput(p.salarioBase),
          salario_complementar: parseMoneyInput(p.salarioComplementar),
          dias_uteis_pagamento: parseInt(p.diasUteisPagamento, 10) || 5,
          updated_at: new Date().toISOString(),
        };

        let contratoId = p.contratoId;
        if (contratoId) {
          await supabase.from('hr_contratos').update(contratoPayload).eq('id', contratoId);
        } else {
          const { data } = await supabase.from('hr_contratos').insert([contratoPayload]).select('id').single();
          contratoId = data?.id ?? null;
        }
        if (contratoId) {
          const contrato: Contrato = { ...contratoPayload, id: contratoId, created_at: '', updated_at: '' };
          await generateParcelasForPeriodo(contrato, form.nome.trim());
        }
      }

      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!employee) return;
    await supabase.from('hr_employees').delete().eq('id', employee.id);
    onSaved();
    onClose();
  };

  const fieldCls = 'w-full bg-surface border border-on-surface/[0.10] rounded-xl px-3.5 py-2.5 text-[13px] text-on-surface outline-none focus:border-primary/50';
  const labelCls = 'text-[10px] font-extrabold uppercase tracking-wide text-on-surface/45 mb-1.5 block';
  const sectionTitleCls = 'text-[11px] font-black uppercase tracking-wide text-on-surface/42';
  const selectSmCls = 'bg-surface-container border border-on-surface/[0.10] rounded-lg px-1.5 py-1 text-[10px] font-bold text-on-surface outline-none';

  const activePeriodo = periodos.find(p => p.localId === activePeriodoLocalId);

  const body = (
    <>
      <div className="flex items-center justify-between mb-5">
        <span className="text-[16px] font-extrabold text-on-surface">{employee ? 'Editar Colaborador' : 'Novo Colaborador'}</span>
        <button onClick={onClose} className="w-[30px] h-[30px] rounded-[10px] bg-on-surface/[0.06] flex items-center justify-center text-on-surface/45">
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      {/* ═══ Dados Pessoais ═══ */}
      <div className="mb-6">
        <div className={`${sectionTitleCls} mb-3.5`}>Dados Pessoais</div>

        <div className="flex flex-col items-center gap-2.5 mb-5">
          <div className="w-24 h-24 rounded-[24px] bg-surface overflow-hidden flex items-center justify-center text-on-surface/45 text-3xl font-black">
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview} alt="" className="w-full h-full object-cover" />
            ) : form.nome ? initials(form.nome) : <User size={30} />}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 text-[11px] font-extrabold text-primary uppercase tracking-wide">
            <Camera size={12} /> Trocar Foto
          </button>
        </div>

        <div className="mb-4">
          <label className={labelCls}>Nome</label>
          <input className={fieldCls} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome completo" />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className={labelCls}>Data de Nascimento</label>
            <input type="date" className={fieldCls} value={form.data_nascimento} onChange={e => setForm({ ...form, data_nascimento: e.target.value })} />
          </div>
          <div className="flex-1">
            <label className={labelCls}>CPF</label>
            <input
              className={`${fieldCls} font-mono tracking-wide`} value={form.cpf}
              onChange={e => setForm({ ...form, cpf: maskCpf(e.target.value) })}
              placeholder="000.000.000-00"
            />
          </div>
        </div>
      </div>

      {/* ═══ Informações Contratuais ═══ */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3.5">
          <span className={sectionTitleCls}>Informações Contratuais</span>
          <button onClick={addPeriodo} className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Plus size={13} strokeWidth={2.8} />
          </button>
        </div>

        {overlapError && <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 mb-3">{overlapError}</p>}

        <div className="flex flex-col gap-3">
          {periodos.map(p => {
            const total = parseMoneyInput(p.salarioBase) + parseMoneyInput(p.salarioComplementar);
            const pct = parseMoneyInput(p.salarioBase) > 0 ? Math.round((parseMoneyInput(p.salarioComplementar) / parseMoneyInput(p.salarioBase)) * 100) : 0;
            return (
              <div key={p.localId} className="bg-surface border border-on-surface/[0.08] rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <select className={selectSmCls} value={p.ano} onChange={e => updatePeriodo(p.localId, { ano: parseInt(e.target.value, 10) })}>
                      {ANOS_FISCAIS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <select className={selectSmCls} value={p.mesInicio} onChange={e => updatePeriodo(p.localId, { mesInicio: parseInt(e.target.value, 10) })}>
                      {MESES_ABREV.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                    <span className="text-on-surface/30 text-[10px]">–</span>
                    <select className={selectSmCls} value={p.mesFim} onChange={e => updatePeriodo(p.localId, { mesFim: parseInt(e.target.value, 10) })}>
                      {MESES_ABREV.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <button onClick={() => removePeriodo(p.localId)} className="w-6 h-6 rounded-lg flex items-center justify-center text-on-surface/40 hover:bg-red-500/10 hover:text-red-500 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>

                <div className="flex gap-2.5 mb-3">
                  <div className="flex-1">
                    <label className={labelCls}>Loja</label>
                    <input className={fieldCls} value={p.loja} onChange={e => updatePeriodo(p.localId, { loja: e.target.value })} placeholder="Castelo Real" />
                  </div>
                  <div className="flex-1">
                    <label className={labelCls}>Cargo</label>
                    <input className={fieldCls} value={p.cargo} onChange={e => updatePeriodo(p.localId, { cargo: e.target.value })} placeholder="Gerente de Loja" />
                  </div>
                </div>

                <div className="flex gap-2.5">
                  <div className="flex-1">
                    <label className={labelCls}>Data de Admissão</label>
                    <input type="date" className={fieldCls} value={p.dataAdmissao} onChange={e => updatePeriodo(p.localId, { dataAdmissao: e.target.value })} />
                  </div>
                  <div className="flex-1">
                    <label className={labelCls}>Salário</label>
                    <div className="w-full h-[42px] bg-surface-container border border-on-surface/[0.10] rounded-xl px-2.5 flex items-center gap-2">
                      <span className="flex-1 min-w-0 font-mono text-[13px] font-extrabold text-on-surface truncate">{fmtSalario(total)}</span>
                      {pct > 0 && (
                        <span className="text-[10px] font-extrabold text-amber-700 dark:text-amber-300 bg-amber-700/10 dark:bg-amber-300/15 px-2 py-1 rounded-md font-mono whitespace-nowrap flex-shrink-0">
                          ▲{pct}%
                        </span>
                      )}
                      <button
                        type="button" onClick={() => openSalaryEdit(p.localId)}
                        className="w-[26px] h-[26px] rounded-lg bg-on-surface/[0.06] border border-on-surface/[0.10] flex items-center justify-center text-on-surface/55 hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors flex-shrink-0"
                      >
                        <Pencil size={13} strokeWidth={2.3} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <button onClick={addPeriodo} className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border-[1.5px] border-dashed border-on-surface/20 text-[11.5px] font-extrabold uppercase tracking-wide text-on-surface/42">
            <Plus size={13} strokeWidth={2.8} /> Adicionar Período
          </button>
        </div>
      </div>

      <div className="flex gap-2.5">
        <button onClick={onClose} className="flex-1 bg-on-surface/[0.06] border border-on-surface/[0.12] text-on-surface/55 font-extrabold text-[12.5px] uppercase tracking-wide py-3.5 rounded-[13px]">
          Cancelar
        </button>
        <button
          onClick={handleSave} disabled={saving || !form.nome.trim() || periodos.length === 0}
          className="flex-[1.4] bg-primary text-white font-extrabold text-[12.5px] uppercase tracking-wide py-3.5 rounded-[13px] shadow-lg shadow-primary/25 disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar Colaborador'}
        </button>
      </div>

      {employee && (
        <button onClick={handleDelete} className="w-full text-center text-[11px] font-extrabold text-red-600 dark:text-red-400 uppercase tracking-wide mt-3.5 flex items-center justify-center gap-1.5">
          <Trash2 size={12} /> Excluir Colaborador
        </button>
      )}
    </>
  );

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/55 z-[60]" onClick={onClose}
            />
            {variant === 'modal' ? (
              <motion.div
                key="modal"
                initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[61] w-[520px] max-h-[88vh] overflow-y-auto bg-surface-container border border-on-surface/[0.08] rounded-[24px] p-6 shadow-2xl"
              >
                {body}
              </motion.div>
            ) : (
              <motion.div
                key="sheet"
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 380, damping: 38 }}
                className="fixed inset-x-0 bottom-0 z-[61] bg-surface-container rounded-t-[28px] shadow-2xl overflow-y-auto p-5"
                style={{ maxHeight: '92svh' }}
              >
                <div className="flex justify-center pb-2 -mt-1">
                  <div className="w-10 h-1 rounded-full bg-on-surface/[0.15]" />
                </div>
                {body}
              </motion.div>
            )}
          </>
        )}
      </AnimatePresence>

      {activePeriodo && (
        <SalaryEditModal
          open={salaryModalOpen}
          employeeName={form.nome || 'Novo Colaborador'}
          periodoLabel={`${MESES_ABREV[activePeriodo.mesInicio - 1]} – ${MESES_ABREV[activePeriodo.mesFim - 1]} ${activePeriodo.ano}`}
          base={draftBase}
          complementar={draftComplementar}
          diasUteis={draftDiasUteis}
          onChangeBase={setDraftBase}
          onChangeComplementar={setDraftComplementar}
          onChangeDiasUteis={setDraftDiasUteis}
          onCancel={() => setSalaryModalOpen(false)}
          onConfirm={confirmSalaryEdit}
          ano={activePeriodo.ano}
          mesInicio={activePeriodo.mesInicio}
          mesFim={activePeriodo.mesFim}
          feriados={feriados}
          variant={variant}
        />
      )}
    </>
  );
}
