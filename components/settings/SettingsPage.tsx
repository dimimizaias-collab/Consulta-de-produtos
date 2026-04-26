'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Sun,
  Moon,
  Store,
  Hash,
  MapPin,
  ImagePlus,
  Save,
  Trash2,
  CheckCircle2,
  Monitor,
  Pencil,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

interface StoreInfo {
  name: string;
  cnpj: string;
  address: string;
  logo: string;
}

const STORE_KEY = 'store_info';
const THEME_KEY = 'theme';
const SETTINGS_ID = 'default';

function formatCnpj(value: string) {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18);
}

function hasData(info: StoreInfo) {
  return !!(info.name || info.cnpj || info.address || info.logo);
}

export function SettingsPage() {
  const [storeInfo, setStoreInfo] = useState<StoreInfo>({ name: '', cnpj: '', address: '', logo: '' });
  const [theme, setTheme]         = useState<'light' | 'dark'>('light');
  const [isEditing, setIsEditing] = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [loadError, setLoadError] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null;
    setTheme(t === 'dark' ? 'dark' : 'light');
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from('store_settings')
        .select('*')
        .eq('id', SETTINGS_ID)
        .maybeSingle();

      if (!error && data) {
        const info: StoreInfo = {
          name: data.name || '',
          cnpj: data.cnpj || '',
          address: data.address || '',
          logo: data.logo || '',
        };
        setStoreInfo(info);
        if (hasData(info)) setIsEditing(false);
        localStorage.setItem(STORE_KEY, JSON.stringify(info));
        return;
      }
    } catch {}

    // Fallback: localStorage
    try {
      const s = localStorage.getItem(STORE_KEY);
      if (s) {
        const info = JSON.parse(s) as StoreInfo;
        setStoreInfo(info);
        if (hasData(info)) setIsEditing(false);
      }
    } catch {}
  }

  const applyTheme = (next: 'light' | 'dark') => {
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('store_settings')
        .upsert({ id: SETTINGS_ID, ...storeInfo, updated_at: new Date().toISOString() });

      if (error) setLoadError(true);
      else setLoadError(false);
    } catch {
      setLoadError(true);
    }

    // Always persist locally too
    try { localStorage.setItem(STORE_KEY, JSON.stringify(storeInfo)); } catch {}

    setSaving(false);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      if (hasData(storeInfo)) setIsEditing(false);
    }, 1500);
  };

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setStoreInfo(prev => ({ ...prev, logo: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const field = 'w-full bg-surface-container border border-on-surface/10 rounded-2xl px-4 py-3 text-sm font-semibold text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-on-surface/30';

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-black text-on-surface tracking-tighter">Configurações</h1>
        <p className="text-sm text-on-surface/40 font-medium uppercase tracking-[0.2em]">Store Identity & Display Preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

        {/* Left — Store Info */}
        <div className="bg-surface-container-lowest rounded-[3rem] border border-on-surface/[0.03] shadow-xl shadow-on-surface/[0.02] p-10 space-y-8">

          {/* Card header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-[1.2rem] bg-primary/10 text-primary flex items-center justify-center shadow-inner">
                <Store size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-on-surface tracking-tight">Dados da Loja</h3>
                <p className="text-xs text-on-surface/40 font-medium uppercase tracking-widest">
                  {isEditing ? 'Editando informações' : 'Informações gerais'}
                </p>
              </div>
            </div>

            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                title="Editar informações"
                className="w-10 h-10 rounded-2xl bg-on-surface/5 text-on-surface/40 hover:bg-primary/10 hover:text-primary transition-all flex items-center justify-center"
              >
                <Pencil size={16} />
              </button>
            )}
          </div>

          {/* ── Profile View ───────────────────────────────────────────── */}
          {!isEditing ? (
            <div className="space-y-6">
              {/* Logo + name */}
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 rounded-2xl border border-on-surface/10 bg-surface-container flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                  {storeInfo.logo ? (
                    <img src={storeInfo.logo} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <Building2 size={32} className="text-on-surface/20" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-2xl font-black text-on-surface tracking-tight truncate">
                    {storeInfo.name || <span className="text-on-surface/30 text-lg font-semibold italic">Sem nome</span>}
                  </p>
                  {storeInfo.cnpj && (
                    <p className="text-xs font-bold text-on-surface/40 uppercase tracking-widest mt-1 flex items-center gap-1.5">
                      <Hash size={10} /> {storeInfo.cnpj}
                    </p>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-on-surface/5" />

              {/* Address */}
              <div className="flex items-start gap-3">
                <MapPin size={14} className="text-on-surface/30 mt-0.5 shrink-0" />
                <p className="text-sm font-semibold text-on-surface/60 leading-relaxed">
                  {storeInfo.address || <span className="italic text-on-surface/30">Endereço não informado</span>}
                </p>
              </div>

              {loadError && (
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">
                  Salvo localmente · Supabase indisponível
                </p>
              )}
            </div>

          ) : (
            /* ── Edit Form ─────────────────────────────────────────────── */
            <div className="space-y-8">
              {/* Logo */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-on-surface/40 uppercase tracking-widest">Logo</label>
                <div className="flex items-center gap-5">
                  <div
                    className="w-20 h-20 rounded-2xl border-2 border-dashed border-on-surface/10 bg-surface-container flex items-center justify-center overflow-hidden shrink-0 cursor-pointer hover:border-primary/40 transition-colors"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {storeInfo.logo ? (
                      <img src={storeInfo.logo} alt="Logo" className="w-full h-full object-contain" />
                    ) : (
                      <ImagePlus size={24} className="text-on-surface/20" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-black hover:bg-primary hover:text-white transition-all"
                    >
                      <ImagePlus size={14} />
                      {storeInfo.logo ? 'Alterar logo' : 'Adicionar logo'}
                    </button>
                    {storeInfo.logo && (
                      <button
                        onClick={() => setStoreInfo(prev => ({ ...prev, logo: '' }))}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 text-red-500 text-xs font-black hover:bg-red-100 transition-all"
                      >
                        <Trash2 size={14} />
                        Remover
                      </button>
                    )}
                  </div>
                </div>
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
              </div>

              {/* Nome */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-on-surface/40 uppercase tracking-widest flex items-center gap-1.5">
                  <Store size={11} /> Nome da Loja
                </label>
                <input
                  type="text"
                  value={storeInfo.name}
                  onChange={e => setStoreInfo(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Universo do Produto"
                  className={field}
                />
              </div>

              {/* CNPJ */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-on-surface/40 uppercase tracking-widest flex items-center gap-1.5">
                  <Hash size={11} /> CNPJ
                </label>
                <input
                  type="text"
                  value={storeInfo.cnpj}
                  onChange={e => setStoreInfo(prev => ({ ...prev, cnpj: formatCnpj(e.target.value) }))}
                  placeholder="00.000.000/0000-00"
                  className={field}
                />
              </div>

              {/* Endereço */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-on-surface/40 uppercase tracking-widest flex items-center gap-1.5">
                  <MapPin size={11} /> Endereço
                </label>
                <input
                  type="text"
                  value={storeInfo.address}
                  onChange={e => setStoreInfo(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Rua, número, bairro, cidade"
                  className={field}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                {hasData(storeInfo) && (
                  <button
                    onClick={() => setIsEditing(false)}
                    className="flex-1 py-4 rounded-2xl font-black text-sm text-on-surface/40 hover:bg-on-surface/5 transition-all uppercase tracking-widest"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-[2] flex items-center justify-center gap-2 bg-primary text-white py-4 rounded-2xl font-black text-sm hover:bg-on-surface transition-all shadow-xl shadow-primary/20 uppercase tracking-widest active:scale-95 disabled:opacity-60"
                >
                  {saved ? (
                    <>
                      <CheckCircle2 size={18} />
                      Salvo!
                    </>
                  ) : saving ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" />
                  ) : (
                    <>
                      <Save size={18} />
                      Salvar
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right — Theme */}
        <div className="bg-surface-container-lowest rounded-[3rem] border border-on-surface/[0.03] shadow-xl shadow-on-surface/[0.02] p-10 space-y-8">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 rounded-[1.2rem] bg-amber-500/10 text-amber-600 flex items-center justify-center shadow-inner">
              <Monitor size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-on-surface tracking-tight">Aparência</h3>
              <p className="text-xs text-on-surface/40 font-medium uppercase tracking-widest">Modo de exibição</p>
            </div>
          </div>

          <p className="text-sm text-on-surface/50 leading-relaxed">
            Escolha entre o modo claro e o modo escuro. A preferência é salva automaticamente no navegador.
          </p>

          <div className="grid grid-cols-2 gap-4">
            {/* Light */}
            <button
              onClick={() => applyTheme('light')}
              className={cn(
                'relative flex flex-col items-center gap-4 p-6 rounded-3xl border-2 transition-all group',
                theme === 'light'
                  ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                  : 'border-on-surface/10 hover:border-on-surface/20 bg-surface-container'
              )}
            >
              {theme === 'light' && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <CheckCircle2 size={12} className="text-white" />
                </div>
              )}
              <div className="w-full rounded-xl overflow-hidden border border-on-surface/10 shadow-sm" style={{ background: '#fcfae4' }}>
                <div className="h-2" style={{ background: '#b5000b' }} />
                <div className="p-2 space-y-1.5">
                  <div className="h-1.5 rounded w-3/4" style={{ background: '#1c1c0f', opacity: 0.3 }} />
                  <div className="h-1.5 rounded w-1/2" style={{ background: '#1c1c0f', opacity: 0.15 }} />
                  <div className="h-4 rounded-lg w-full" style={{ background: '#ffffff', border: '1px solid #e8e5e5' }} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Sun size={18} className={cn(theme === 'light' ? 'text-primary' : 'text-on-surface/40')} />
                <span className={cn('text-sm font-black uppercase tracking-wider', theme === 'light' ? 'text-primary' : 'text-on-surface/40')}>
                  Claro
                </span>
              </div>
            </button>

            {/* Dark */}
            <button
              onClick={() => applyTheme('dark')}
              className={cn(
                'relative flex flex-col items-center gap-4 p-6 rounded-3xl border-2 transition-all group',
                theme === 'dark'
                  ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                  : 'border-on-surface/10 hover:border-on-surface/20 bg-surface-container'
              )}
            >
              {theme === 'dark' && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <CheckCircle2 size={12} className="text-white" />
                </div>
              )}
              <div className="w-full rounded-xl overflow-hidden border border-white/5 shadow-sm" style={{ background: '#141410' }}>
                <div className="h-2" style={{ background: '#b5000b' }} />
                <div className="p-2 space-y-1.5">
                  <div className="h-1.5 rounded w-3/4" style={{ background: '#e6e4cc', opacity: 0.4 }} />
                  <div className="h-1.5 rounded w-1/2" style={{ background: '#e6e4cc', opacity: 0.2 }} />
                  <div className="h-4 rounded-lg w-full" style={{ background: '#1c1c16', border: '1px solid rgba(255,255,255,0.06)' }} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Moon size={18} className={cn(theme === 'dark' ? 'text-primary' : 'text-on-surface/40')} />
                <span className={cn('text-sm font-black uppercase tracking-wider', theme === 'dark' ? 'text-primary' : 'text-on-surface/40')}>
                  Escuro
                </span>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface-container border border-on-surface/5">
            {theme === 'dark' ? <Moon size={16} className="text-primary" /> : <Sun size={16} className="text-amber-500" />}
            <span className="text-xs font-bold text-on-surface/60 uppercase tracking-widest">
              Modo {theme === 'dark' ? 'Escuro' : 'Claro'} ativo
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
