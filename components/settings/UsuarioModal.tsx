'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Save, UserPlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LinkableEmployee {
  id: string;
  nome: string;
  cargo: string;
}

const ROLES: { id: string; label: string }[] = [
  { id: 'admin', label: 'Admin' },
  { id: 'gerente', label: 'Gerente' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'caixa', label: 'Caixa' },
];

interface UsuarioModalProps {
  open: boolean;
  employees: LinkableEmployee[];
  onClose: () => void;
  onCreated: () => void;
}

const emptyForm = { employeeId: '', email: '', password: '', role: 'admin' };

export function UsuarioModal({ open, employees, onClose, onCreated }: UsuarioModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setError('');
      setShowPassword(false);
    }
  }, [open]);

  if (!open) return null;

  const isValid = form.employeeId && form.email.trim() && form.password.length >= 8;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.details || data.error || 'Erro ao criar usuário.');
        return;
      }
      onCreated();
    } catch {
      setError('Erro ao criar usuário.');
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full bg-surface border border-on-surface/[0.12] rounded-[11px] px-3 py-2.5 text-[13px] font-semibold text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-colors placeholder:text-on-surface/30 placeholder:font-medium';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-[440px] max-h-[88vh] bg-surface-container-lowest rounded-[24px] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-[22px] pt-[22px] pb-4">
          <div className="w-[38px] h-[38px] rounded-xl bg-on-surface/[0.09] dark:bg-[rgba(216,30,30,0.13)] flex items-center justify-center text-on-surface dark:text-primary shrink-0">
            <UserPlus size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[17px] font-extrabold text-on-surface">Novo usuário</div>
            <div className="text-[11.5px] font-semibold text-on-surface/40 mt-0.5 truncate">Vincula um login a um funcionário do RH</div>
          </div>
          <button
            onClick={onClose}
            className="w-[30px] h-[30px] rounded-[10px] bg-on-surface/[0.06] text-on-surface/45 hover:bg-on-surface/10 transition-colors flex items-center justify-center shrink-0"
          >
            <X size={13} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-[22px] pb-5 flex flex-col gap-3.5">
          <div>
            <FieldLabel required>Funcionário</FieldLabel>
            {employees.length === 0 ? (
              <p className="text-[12px] font-semibold text-on-surface/40 bg-surface border border-on-surface/[0.1] rounded-[11px] px-3 py-2.5">
                Todos os funcionários já possuem um login vinculado.
              </p>
            ) : (
              <select
                value={form.employeeId}
                onChange={e => setForm(prev => ({ ...prev, employeeId: e.target.value }))}
                className={field}
              >
                <option value="">Selecione…</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.nome}{emp.cargo ? ` — ${emp.cargo}` : ''}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <FieldLabel required>E-mail de login</FieldLabel>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
              placeholder="nome@empresa.com"
              className={field}
            />
          </div>

          <div>
            <FieldLabel required icon={<KeyRound size={11} />}>Senha</FieldLabel>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Mínimo 8 caracteres"
                className={cn(field, 'pr-11')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface/30 hover:text-on-surface/60 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <FieldLabel required>Papel</FieldLabel>
            <select
              value={form.role}
              onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))}
              className={field}
            >
              {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>

          {error && (
            <p className="text-[12px] font-semibold text-red-600 dark:text-red-400 bg-red-500/10 rounded-[11px] px-3 py-2.5">{error}</p>
          )}
        </div>

        <div className="flex gap-2.5 px-[22px] pb-[22px] pt-4">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-[13px] font-extrabold text-[12px] text-on-surface/50 hover:bg-on-surface/5 transition-colors uppercase tracking-wide"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isValid}
            className="flex-[2] flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-[13px] font-extrabold text-[12px] hover:bg-on-surface transition-[colors,transform] shadow-lg shadow-primary/25 uppercase tracking-wide active:scale-95 disabled:opacity-50"
          >
            {saving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" />
            ) : (
              <><Save size={15} /> Criar usuário</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children, required, icon }: { children: React.ReactNode; required?: boolean; icon?: React.ReactNode }) {
  return (
    <label className="text-[10px] font-black text-on-surface/40 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
      {icon}
      {children}
      {required && <span className="text-primary">*</span>}
    </label>
  );
}
