'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trash2, Camera, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { type Employee, uploadEmployeePhoto, initials } from '@/lib/hrEmployees';

type EmployeeForm = {
  nome: string;
  idade: string;
  cargo: string;
  loja: string;
  data_admissao: string;
  salario: string;
};

function emptyForm(): EmployeeForm {
  return { nome: '', idade: '', cargo: '', loja: '', data_admissao: new Date().toISOString().split('T')[0], salario: '' };
}

function employeeToForm(emp: Employee): EmployeeForm {
  return {
    nome: emp.nome, idade: emp.idade != null ? String(emp.idade) : '',
    cargo: emp.cargo, loja: emp.loja, data_admissao: emp.data_admissao,
    salario: emp.salario ? String(emp.salario) : '',
  };
}

interface EmployeeModalProps {
  open: boolean;
  employee: Employee | null;
  onClose: () => void;
  onSaved: () => void;
  variant?: 'modal' | 'sheet';
}

export function EmployeeModal({ open, employee, onClose, onSaved, variant = 'modal' }: EmployeeModalProps) {
  const [form, setForm] = useState<EmployeeForm>(emptyForm());
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(employee ? employeeToForm(employee) : emptyForm());
      setPhotoFile(null);
      setPhotoPreview(employee?.foto_url ?? null);
    }
  }, [open, employee]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.data_admissao) return;
    setSaving(true);
    try {
      let fotoUrl = employee?.foto_url ?? null;
      if (photoFile) fotoUrl = await uploadEmployeePhoto(photoFile);

      const payload = {
        nome: form.nome.trim(),
        idade: form.idade ? parseInt(form.idade, 10) : null,
        cargo: form.cargo.trim(),
        loja: form.loja.trim(),
        data_admissao: form.data_admissao,
        salario: form.salario ? parseFloat(form.salario.replace(/\./g, '').replace(',', '.')) : 0,
        foto_url: fotoUrl,
        updated_at: new Date().toISOString(),
      };

      if (employee) {
        await supabase.from('hr_employees').update(payload).eq('id', employee.id);
      } else {
        await supabase.from('hr_employees').insert([payload]);
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

  const body = (
    <>
      <div className="flex items-center justify-between mb-5">
        <span className="text-[16px] font-extrabold text-on-surface">{employee ? 'Editar Colaborador' : 'Novo Colaborador'}</span>
        <button onClick={onClose} className="w-[30px] h-[30px] rounded-[10px] bg-on-surface/[0.06] flex items-center justify-center text-on-surface/45">
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

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

      <div className="flex gap-3 mb-4">
        <div className="flex-1">
          <label className={labelCls}>Idade</label>
          <input className={fieldCls} value={form.idade} onChange={e => setForm({ ...form, idade: e.target.value.replace(/\D/g, '') })} placeholder="34" />
        </div>
        <div className="flex-[1.6]">
          <label className={labelCls}>Cargo</label>
          <input className={fieldCls} value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} placeholder="Gerente de Loja" />
        </div>
      </div>

      <div className="mb-4">
        <label className={labelCls}>Loja</label>
        <input className={fieldCls} value={form.loja} onChange={e => setForm({ ...form, loja: e.target.value })} placeholder="Castelo Real" />
      </div>

      <div className="flex gap-3 mb-5">
        <div className="flex-1">
          <label className={labelCls}>Data de Admissão</label>
          <input type="date" className={fieldCls} value={form.data_admissao} onChange={e => setForm({ ...form, data_admissao: e.target.value })} />
        </div>
        <div className="flex-1">
          <label className={labelCls}>Salário</label>
          <input className={fieldCls} value={form.salario} onChange={e => setForm({ ...form, salario: e.target.value.replace(/[^0-9.,]/g, '') })} placeholder="3200.00" />
        </div>
      </div>

      <div className="flex gap-2.5">
        <button onClick={onClose} className="flex-1 bg-on-surface/[0.06] border border-on-surface/[0.12] text-on-surface/55 font-extrabold text-[12.5px] uppercase tracking-wide py-3.5 rounded-[13px]">
          Cancelar
        </button>
        <button
          onClick={handleSave} disabled={saving || !form.nome.trim() || !form.data_admissao}
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
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[61] w-[460px] max-h-[88vh] overflow-y-auto bg-surface-container border border-on-surface/[0.08] rounded-[24px] p-6 shadow-2xl"
            >
              {body}
            </motion.div>
          ) : (
            <motion.div
              key="sheet"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="fixed inset-x-0 bottom-0 z-[61] bg-surface-container rounded-t-[28px] shadow-2xl overflow-y-auto p-5"
              style={{ maxHeight: '90svh' }}
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
  );
}
