'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, Hash, ImagePlus, MapPin, Save, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

export interface Company {
  id: string;
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  address: string;
  logo: string | null;
}

interface CompanyModalProps {
  open: boolean;
  company: Company | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

function formatCnpj(value: string) {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18);
}

const emptyForm = { razao_social: '', nome_fantasia: '', cnpj: '', address: '', logo: '' };

export function CompanyModal({ open, company, onClose, onSaved, onDeleted }: CompanyModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const isEdit = !!company;

  useEffect(() => {
    if (open) {
      setForm(company ? {
        razao_social: company.razao_social,
        nome_fantasia: company.nome_fantasia,
        cnpj: company.cnpj,
        address: company.address,
        logo: company.logo || '',
      } : emptyForm);
      setConfirmDelete(false);
    }
  }, [open, company]);

  if (!open) return null;

  const isValid = form.razao_social.trim() && form.nome_fantasia.trim() && form.cnpj.trim() && form.address.trim();

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm(prev => ({ ...prev, logo: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      if (isEdit) {
        await supabase.from('companies').update({ ...form, updated_at: new Date().toISOString() }).eq('id', company.id);
      } else {
        await supabase.from('companies').insert({ ...form });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!company) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      await supabase.from('companies').delete().eq('id', company.id);
      onDeleted();
    } finally {
      setDeleting(false);
    }
  };

  const field = 'w-full bg-surface border border-on-surface/[0.12] rounded-[11px] px-3 py-2.5 text-[13px] font-semibold text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-colors placeholder:text-on-surface/30 placeholder:font-medium';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-[480px] max-h-[88vh] bg-surface-container-lowest rounded-[24px] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-[22px] pt-[22px] pb-4">
          <div className="w-[38px] h-[38px] rounded-xl bg-on-surface/[0.09] dark:bg-[rgba(216,30,30,0.13)] flex items-center justify-center text-on-surface dark:text-primary shrink-0">
            <Building2 size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[17px] font-extrabold text-on-surface">{isEdit ? 'Editar Empresa' : 'Nova Empresa'}</div>
            <div className="text-[11.5px] font-semibold text-on-surface/40 mt-0.5 truncate">
              {isEdit ? company!.nome_fantasia : 'Cadastre os dados da loja'}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-[30px] h-[30px] rounded-[10px] bg-on-surface/[0.06] text-on-surface/45 hover:bg-on-surface/10 transition-colors flex items-center justify-center shrink-0"
          >
            <X size={13} strokeWidth={2.5} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-[22px] pb-5 flex flex-col gap-3.5">
          {/* Logo */}
          <div className="flex items-center gap-3.5">
            <div
              className="w-16 h-16 rounded-2xl border-2 border-dashed border-on-surface/[0.16] bg-surface flex items-center justify-center overflow-hidden shrink-0 cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => logoInputRef.current?.click()}
            >
              {form.logo ? (
                <img src={form.logo} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <ImagePlus size={22} className="text-on-surface/25" />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => logoInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-primary/10 text-primary text-[11px] font-extrabold uppercase tracking-wide hover:bg-primary hover:text-white transition-colors w-fit"
              >
                <ImagePlus size={13} />
                {form.logo ? 'Alterar foto' : 'Adicionar foto'}
              </button>
              <span className="text-[10.5px] font-semibold text-on-surface/35">Opcional — PNG ou JPG</span>
            </div>
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
          </div>

          <SectionTitle>Identificação</SectionTitle>

          <div>
            <FieldLabel required>Razão Social</FieldLabel>
            <input
              type="text"
              value={form.razao_social}
              onChange={e => setForm(prev => ({ ...prev, razao_social: e.target.value }))}
              placeholder="Ex: Universo Comércio de Produtos LTDA"
              className={field}
            />
          </div>
          <div>
            <FieldLabel required>Nome Fantasia</FieldLabel>
            <input
              type="text"
              value={form.nome_fantasia}
              onChange={e => setForm(prev => ({ ...prev, nome_fantasia: e.target.value }))}
              placeholder="Ex: Universo do Produto"
              className={field}
            />
          </div>
          <div>
            <FieldLabel required icon={<Hash size={11} />}>CNPJ</FieldLabel>
            <input
              type="text"
              value={form.cnpj}
              onChange={e => setForm(prev => ({ ...prev, cnpj: formatCnpj(e.target.value) }))}
              placeholder="00.000.000/0000-00"
              className={field}
            />
          </div>

          <SectionTitle>Endereço</SectionTitle>
          <div>
            <FieldLabel required icon={<MapPin size={11} />}>Endereço completo</FieldLabel>
            <textarea
              value={form.address}
              onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))}
              placeholder="Rua, número, bairro, cidade — UF"
              rows={2}
              className={cn(field, 'resize-none')}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2.5 px-[22px] pb-[22px] pt-4">
          {isEdit ? (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={cn(
                'flex items-center gap-1.5 px-4 rounded-[13px] font-extrabold text-[12px] uppercase tracking-wide transition-colors',
                confirmDelete
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20',
              )}
            >
              <Trash2 size={14} />
              {confirmDelete ? 'Confirmar' : ''}
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-[13px] font-extrabold text-[12px] text-on-surface/50 hover:bg-on-surface/5 transition-colors uppercase tracking-wide"
            >
              Cancelar
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !isValid}
            className="flex-[2] flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-[13px] font-extrabold text-[12px] hover:bg-on-surface transition-[colors,transform] shadow-lg shadow-primary/25 uppercase tracking-wide active:scale-95 disabled:opacity-50"
          >
            {saving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" />
            ) : (
              <>
                <Save size={15} />
                {isEdit ? 'Salvar Alterações' : 'Criar Empresa'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[10.5px] font-black uppercase tracking-wide text-on-surface/35 mt-1">
      {children}
      <div className="flex-1 h-px bg-on-surface/[0.09]" />
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
