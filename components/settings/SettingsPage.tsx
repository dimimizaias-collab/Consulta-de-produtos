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
  Monitor
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';

interface StoreInfo {
  name: string;
  cnpj: string;
  address: string;
  logo: string;
}

const STORE_KEY = 'store_info';
const THEME_KEY = 'theme';

function formatCnpj(value: string) {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18);
}

export function SettingsPage() {
  const [storeInfo, setStoreInfo] = useState<StoreInfo>({ name: '', cnpj: '', address: '', logo: '' });
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [saved, setSaved] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem(STORE_KEY);
      if (s) setStoreInfo(JSON.parse(s));
      const t = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null;
      setTheme(t === 'dark' ? 'dark' : 'light');
    } catch {}
  }, []);

  const applyTheme = (next: 'light' | 'dark') => {
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  const handleSave = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(storeInfo));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {}
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
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 rounded-[1.2rem] bg-primary/10 text-primary flex items-center justify-center shadow-inner">
              <Store size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-on-surface tracking-tight">Dados da Loja</h3>
              <p className="text-xs text-on-surface/40 font-medium uppercase tracking-widest">Informações gerais</p>
            </div>
          </div>

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

          {/* Save */}
          <button
            onClick={handleSave}
            className="w-full flex items-center justify-center gap-2 bg-primary text-white py-4 rounded-2xl font-black text-sm hover:bg-on-surface transition-all shadow-xl shadow-primary/20 uppercase tracking-widest active:scale-95"
          >
            {saved ? (
              <>
                <CheckCircle2 size={18} />
                Salvo!
              </>
            ) : (
              <>
                <Save size={18} />
                Salvar Informações
              </>
            )}
          </button>
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
              {/* Mini preview — light */}
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
              {/* Mini preview — dark */}
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

          {/* Current status */}
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
