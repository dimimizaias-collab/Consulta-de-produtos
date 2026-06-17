'use client';

import { useState, useEffect } from 'react';
import { Plus, Check, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { type Employee } from '@/lib/hrEmployees';

interface CaderninhoEntry {
  id: string;
  colaborador_id: string | null;
  colaborador_nome: string | null;
  tipo: 'Mercadoria' | 'Vale' | 'Outros';
  valor: number;
  observacao: string | null;
  data: string;
  created_at: string;
}

interface PendingRow {
  localId: string;
  colaborador_id: string;
  tipo: 'Mercadoria' | 'Vale' | 'Outros';
  valor: string;
  observacao: string;
  data: string;
  saving: boolean;
  error: string | null;
}

interface CaderninhoTableProps {
  employees: Employee[];
  compact?: boolean;
}

const TIPOS = ['Mercadoria', 'Vale', 'Outros'] as const;

const fmtMoney = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d: string) => {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

const todayStr = () => new Date().toISOString().split('T')[0];

function makePending(): PendingRow {
  return {
    localId: crypto.randomUUID(),
    colaborador_id: '',
    tipo: 'Mercadoria',
    valor: '',
    observacao: '',
    data: todayStr(),
    saving: false,
    error: null,
  };
}

const tipoColor = (tipo: string) => {
  if (tipo === 'Vale') return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
  if (tipo === 'Mercadoria') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
  return 'bg-gray-500/15 text-gray-600 dark:text-gray-400';
};

export function CaderninhoTable({ employees, compact = false }: CaderninhoTableProps) {
  const [entries, setEntries] = useState<CaderninhoEntry[]>([]);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = async () => {
    const { data } = await supabase
      .from('hr_caderninho')
      .select('*')
      .order('data', { ascending: false });
    setEntries((data as CaderninhoEntry[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchEntries(); }, []);

  const addPending = () => setPending(prev => [...prev, makePending()]);

  const updatePending = (localId: string, patch: Partial<PendingRow>) =>
    setPending(prev => prev.map(r => r.localId === localId ? { ...r, ...patch } : r));

  const removePending = (localId: string) =>
    setPending(prev => prev.filter(r => r.localId !== localId));

  const confirmRow = async (row: PendingRow) => {
    const val = parseFloat(row.valor.replace(',', '.'));
    if (!row.colaborador_id) {
      updatePending(row.localId, { error: 'Selecione um colaborador.' });
      return;
    }
    if (!row.valor || isNaN(val) || val <= 0) {
      updatePending(row.localId, { error: 'Informe um valor válido.' });
      return;
    }
    if (!row.data) {
      updatePending(row.localId, { error: 'Informe a data.' });
      return;
    }

    updatePending(row.localId, { saving: true, error: null });

    const emp = employees.find(e => e.id === row.colaborador_id);
    const { error } = await supabase.from('hr_caderninho').insert([{
      colaborador_id: row.colaborador_id,
      colaborador_nome: emp?.nome || null,
      tipo: row.tipo,
      valor: val,
      observacao: row.observacao.trim() || null,
      data: row.data,
    }]);

    if (error) {
      updatePending(row.localId, { saving: false, error: 'Erro ao salvar. Tente novamente.' });
      return;
    }

    removePending(row.localId);
    fetchEntries();
  };

  const deleteEntry = async (id: string) => {
    await supabase.from('hr_caderninho').delete().eq('id', id);
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  // ── Mobile (compact) layout ──────────────────────────────────────────────
  if (compact) {
    const fieldCls = 'w-full bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]';
    const labelCls = 'text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block';

    return (
      <div className="px-3 pt-3 pb-6 flex flex-col gap-3">
        {loading ? (
          <div className="py-8 flex justify-center">
            <div className="w-5 h-5 border-2 border-[#D81E1E] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {entries.length === 0 && pending.length === 0 && (
              <p className="text-sm text-center py-6 text-[rgba(26,26,10,0.35)] dark:text-white/30">
                Nenhum registro ainda.
              </p>
            )}

            {/* Confirmed entries */}
            {entries.map(entry => (
              <div
                key={entry.id}
                className="bg-white dark:bg-[#252520] border border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] rounded-[18px] px-4 py-3.5 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3]">
                    {entry.colaborador_nome || '—'}
                  </span>
                  <button
                    onClick={() => deleteEntry(entry.id)}
                    className="w-7 h-7 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('text-[9.5px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-lg', tipoColor(entry.tipo))}>
                    {entry.tipo}
                  </span>
                  <span className="text-[13px] font-bold text-[#1A1A0E] dark:text-[#F2F0E3]">
                    {fmtMoney(entry.valor)}
                  </span>
                  <span className="text-[11px] text-[rgba(26,26,10,0.40)] dark:text-white/30 ml-auto">
                    {fmtDate(entry.data)}
                  </span>
                </div>
                {entry.observacao && (
                  <p className="text-[11px] text-[rgba(26,26,10,0.50)] dark:text-white/40">
                    {entry.observacao}
                  </p>
                )}
              </div>
            ))}

            {/* Pending rows */}
            {pending.map(row => (
              <div
                key={row.localId}
                className="bg-white dark:bg-[#252520] border-[1.5px] border-[rgba(216,30,30,0.25)] rounded-[18px] px-4 py-3.5 flex flex-col gap-2.5"
              >
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className={labelCls}>Colaborador</span>
                    <select
                      className={fieldCls}
                      value={row.colaborador_id}
                      onChange={e => updatePending(row.localId, { colaborador_id: e.target.value })}
                    >
                      <option value="">Selecionar...</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className={labelCls}>Tipo</span>
                    <select
                      className={fieldCls}
                      value={row.tipo}
                      onChange={e => updatePending(row.localId, { tipo: e.target.value as typeof row.tipo })}
                    >
                      {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className={labelCls}>Valor (R$)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className={cn(fieldCls, 'no-spinner')}
                      placeholder="0,00"
                      value={row.valor}
                      onChange={e => updatePending(row.localId, { valor: e.target.value })}
                    />
                  </div>
                  <div>
                    <span className={labelCls}>Data</span>
                    <input
                      type="date"
                      className={fieldCls}
                      value={row.data}
                      onChange={e => updatePending(row.localId, { data: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <span className={labelCls}>Observação</span>
                  <input
                    type="text"
                    className={fieldCls}
                    placeholder="Opcional"
                    value={row.observacao}
                    onChange={e => updatePending(row.localId, { observacao: e.target.value })}
                  />
                </div>
                {row.error && (
                  <p className="text-[11px] text-red-500 font-semibold">{row.error}</p>
                )}
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => removePending(row.localId)}
                    className="flex-1 py-2.5 rounded-[13px] text-[11.5px] font-extrabold uppercase tracking-wide bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.06] text-[rgba(26,26,10,0.50)] dark:text-white/40"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => confirmRow(row)}
                    disabled={row.saving}
                    className="flex-[2] py-2.5 rounded-[13px] text-[11.5px] font-extrabold uppercase tracking-wide bg-[#D81E1E] text-white shadow-[0_8px_18px_rgba(216,30,30,0.30)] flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {row.saving
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><Check size={13} strokeWidth={2.8} /> Confirmar</>
                    }
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Add button */}
        <button
          onClick={addPending}
          className="flex items-center justify-center gap-2 py-3 rounded-[13px] border-[1.5px] border-dashed border-[rgba(26,26,10,0.15)] dark:border-white/[0.12] text-[11.5px] font-extrabold uppercase tracking-wide text-[rgba(26,26,10,0.40)] dark:text-white/35 active:scale-[0.98] transition-transform"
        >
          <Plus size={13} strokeWidth={2.8} />
          Adicionar Linha
        </button>
      </div>
    );
  }

  // ── Desktop table layout ─────────────────────────────────────────────────
  const thCls = 'text-[10px] font-extrabold uppercase tracking-wide text-on-surface/40 px-3.5 py-3 text-left whitespace-nowrap';
  const tdCls = 'px-3.5 py-2.5';
  const inputCls = 'w-full bg-surface border border-on-surface/10 rounded-xl px-3 py-2 text-[13px] text-on-surface focus:outline-none focus:border-primary/50 transition-colors';

  return (
    <div className="bg-surface-container border border-on-surface/[0.07] rounded-[28px] overflow-hidden">
      {loading ? (
        <div className="py-12 flex justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-on-surface/[0.07]">
                  <th className={thCls}>Colaborador</th>
                  <th className={thCls}>Tipo</th>
                  <th className={thCls}>Valor</th>
                  <th className={thCls}>Observação</th>
                  <th className={thCls}>Data</th>
                  <th className={cn(thCls, 'w-12')} />
                </tr>
              </thead>
              <tbody className="divide-y divide-on-surface/[0.05]">
                {entries.length === 0 && pending.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-on-surface/35">
                      Nenhum registro ainda. Clique em "Adicionar Linha" para começar.
                    </td>
                  </tr>
                )}

                {/* Confirmed rows */}
                {entries.map(entry => (
                  <tr key={entry.id} className="group hover:bg-on-surface/[0.015] transition-colors">
                    <td className={cn(tdCls, 'text-[13px] font-semibold text-on-surface')}>
                      {entry.colaborador_nome || '—'}
                    </td>
                    <td className={tdCls}>
                      <span className={cn('text-[9.5px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-lg', tipoColor(entry.tipo))}>
                        {entry.tipo}
                      </span>
                    </td>
                    <td className={cn(tdCls, 'text-[13px] font-bold text-on-surface')}>
                      {fmtMoney(entry.valor)}
                    </td>
                    <td className={cn(tdCls, 'text-[12.5px] text-on-surface/60 max-w-[200px] truncate')}>
                      {entry.observacao || '—'}
                    </td>
                    <td className={cn(tdCls, 'text-[12.5px] text-on-surface/60 whitespace-nowrap')}>
                      {fmtDate(entry.data)}
                    </td>
                    <td className={tdCls}>
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        className="w-7 h-7 rounded-lg hover:bg-red-500/10 text-on-surface/20 hover:text-red-500 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}

                {/* Pending rows */}
                {pending.map(row => (
                  <>
                    <tr key={row.localId} className="bg-primary/[0.015]">
                      <td className={tdCls}>
                        <select
                          className={cn(inputCls, 'min-w-[140px]')}
                          value={row.colaborador_id}
                          onChange={e => updatePending(row.localId, { colaborador_id: e.target.value })}
                        >
                          <option value="">Selecionar...</option>
                          {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.nome}</option>
                          ))}
                        </select>
                      </td>
                      <td className={tdCls}>
                        <select
                          className={cn(inputCls, 'min-w-[110px]')}
                          value={row.tipo}
                          onChange={e => updatePending(row.localId, { tipo: e.target.value as typeof row.tipo })}
                        >
                          {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className={tdCls}>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          className={cn(inputCls, 'no-spinner min-w-[100px]')}
                          placeholder="0,00"
                          value={row.valor}
                          onChange={e => updatePending(row.localId, { valor: e.target.value })}
                        />
                      </td>
                      <td className={tdCls}>
                        <input
                          type="text"
                          className={cn(inputCls, 'min-w-[150px]')}
                          placeholder="Opcional"
                          value={row.observacao}
                          onChange={e => updatePending(row.localId, { observacao: e.target.value })}
                        />
                      </td>
                      <td className={tdCls}>
                        <input
                          type="date"
                          className={cn(inputCls, 'min-w-[130px]')}
                          value={row.data}
                          onChange={e => updatePending(row.localId, { data: e.target.value })}
                        />
                      </td>
                      <td className={tdCls}>
                        <button
                          onClick={() => confirmRow(row)}
                          disabled={row.saving}
                          className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/25 active:scale-95 transition-transform disabled:opacity-50"
                          title="Confirmar"
                        >
                          {row.saving
                            ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <Check size={14} strokeWidth={2.8} />
                          }
                        </button>
                      </td>
                    </tr>
                    {row.error && (
                      <tr key={`${row.localId}-err`} className="bg-red-500/[0.03]">
                        <td colSpan={6} className="px-3.5 py-1.5 text-[11px] text-red-500 font-semibold">
                          {row.error}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add row button */}
          <div className="px-5 py-3.5 border-t border-on-surface/[0.07]">
            <button
              onClick={addPending}
              className="flex items-center gap-2 px-4 py-2 rounded-[13px] border-[1.5px] border-dashed border-on-surface/15 text-[11.5px] font-extrabold uppercase tracking-wide text-on-surface/40 hover:border-primary/30 hover:text-primary transition-colors active:scale-[0.98]"
            >
              <Plus size={13} strokeWidth={2.8} />
              Adicionar Linha
            </button>
          </div>
        </>
      )}
    </div>
  );
}
