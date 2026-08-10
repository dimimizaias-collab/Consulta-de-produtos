'use client';

import { useState, useEffect } from 'react';
import {
  Sun,
  Moon,
  Hash,
  Save,
  CheckCircle2,
  Monitor,
  Building2,
  Lock,
  Eye,
  EyeOff,
  Settings,
  Plus,
  ChevronRight,
  LayoutGrid,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { CompanyModal, type Company } from './CompanyModal';

const THEME_KEY = 'theme';
const SETTINGS_ID = 'default';

type Tab = 'dados' | 'usabilidade' | 'seguranca';

const TABS: { id: Tab; label: string }[] = [
  { id: 'dados', label: 'Dados' },
  { id: 'usabilidade', label: 'Usabilidade' },
  { id: 'seguranca', label: 'Segurança' },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('dados');

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  const [hrPassword, setHrPassword] = useState('');
  const [showHrPassword, setShowHrPassword] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null;
    setTheme(t === 'dark' ? 'dark' : 'light');
    loadCompanies();
    loadHrPassword();
  }, []);

  async function loadCompanies() {
    setCompaniesLoading(true);
    try {
      const { data } = await supabase.from('companies').select('*').order('nome_fantasia');
      setCompanies(data || []);
    } finally {
      setCompaniesLoading(false);
    }
  }

  async function loadHrPassword() {
    try {
      const { data } = await supabase.from('store_settings').select('hr_password').eq('id', SETTINGS_ID).maybeSingle();
      setHrPassword(data?.hr_password || '');
    } catch {}
  }

  const applyTheme = (next: 'light' | 'dark') => {
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  const handleSaveHrPassword = async () => {
    setSaving(true);
    try {
      await supabase.from('store_settings').upsert({ id: SETTINGS_ID, hr_password: hrPassword, updated_at: new Date().toISOString() });
    } finally {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  };

  const openCreateModal = () => { setEditingCompany(null); setModalOpen(true); };
  const openEditModal = (c: Company) => { setEditingCompany(c); setModalOpen(true); };
  const closeModal = () => setModalOpen(false);
  const handleSaved = () => { closeModal(); loadCompanies(); };
  const handleDeleted = () => { closeModal(); loadCompanies(); };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-[#FFE500] dark:bg-[#252520] border border-[#D4C000] dark:border-white/[0.07] rounded-[20px] px-6 py-5 flex items-center gap-3.5">
        <div className="w-[52px] h-[52px] rounded-[14px] bg-[rgba(26,26,10,0.09)] dark:bg-[rgba(216,30,30,0.13)] flex items-center justify-center text-[#1A1A0E] dark:text-primary shrink-0">
          <Settings size={24} strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-[26px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] tracking-tight leading-tight">Configurações</h1>
          <div className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-[rgba(26,26,10,0.40)] dark:text-white/[0.28]">Store Identity &amp; Display Preferences</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 bg-on-surface/10 rounded-full p-[3px] w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-[22px] py-2.5 rounded-full text-[11px] font-black uppercase tracking-[0.07em] transition-all duration-150',
              activeTab === tab.id
                ? 'bg-primary text-white shadow-sm'
                : 'text-on-surface/45 hover:text-on-surface/70',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'dados' && (
        <EmpresasSection
          companies={companies}
          loading={companiesLoading}
          onAdd={openCreateModal}
          onEdit={openEditModal}
        />
      )}

      {activeTab === 'usabilidade' && (
        <AparenciaSection theme={theme} onSelect={applyTheme} />
      )}

      {activeTab === 'seguranca' && (
        <SegurancaSection
          hrPassword={hrPassword}
          setHrPassword={setHrPassword}
          showHrPassword={showHrPassword}
          setShowHrPassword={setShowHrPassword}
          onSave={handleSaveHrPassword}
          saving={saving}
          saved={saved}
        />
      )}

      <CompanyModal
        open={modalOpen}
        company={editingCompany}
        onClose={closeModal}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </div>
  );
}

// ── Aba Dados — Empresas ────────────────────────────────────────────────────

function EmpresasSection({
  companies, loading, onAdd, onEdit,
}: {
  companies: Company[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (c: Company) => void;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-[3rem] border border-on-surface/[0.03] shadow-xl shadow-on-surface/[0.02] p-10 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[1.2rem] bg-primary/10 text-primary flex items-center justify-center shadow-inner">
            <LayoutGrid size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-on-surface tracking-tight">Empresas</h3>
            <p className="text-xs text-on-surface/40 font-medium uppercase tracking-widest">Lojas cadastradas no sistema</p>
          </div>
        </div>
      </div>

      <p className="text-sm text-on-surface/50 leading-relaxed max-w-xl">
        Cada loja opera com dados próprios de recebimento, preços e movimentações. Cadastre aqui todas as unidades da rede.
      </p>

      <div className="flex items-center justify-between pt-2">
        <span className="text-xs font-extrabold text-on-surface/35 uppercase tracking-widest">
          {loading ? 'Carregando…' : `${companies.length} empresa${companies.length !== 1 ? 's' : ''} cadastrada${companies.length !== 1 ? 's' : ''}`}
        </span>
        <button
          onClick={onAdd}
          className="flex items-center gap-2 bg-primary text-white px-5 py-3 rounded-2xl font-black text-xs hover:bg-on-surface transition-[colors,transform] shadow-lg shadow-primary/25 uppercase tracking-wide active:scale-95"
        >
          <Plus size={15} strokeWidth={2.6} />
          Nova Empresa
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {companies.map(company => (
          <button
            key={company.id}
            onClick={() => onEdit(company)}
            className="flex items-center gap-3.5 bg-surface-container border border-on-surface/[0.08] hover:border-on-surface/[0.16] rounded-[20px] p-3.5 text-left transition-colors"
          >
            <div className="w-[52px] h-[52px] rounded-2xl bg-surface border border-on-surface/[0.08] flex items-center justify-center overflow-hidden shrink-0 text-on-surface/25">
              {company.logo ? (
                <img src={company.logo} alt={company.nome_fantasia} className="w-full h-full object-cover" />
              ) : (
                <Building2 size={22} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-extrabold text-on-surface truncate">{company.nome_fantasia}</div>
              <div className="text-[11px] font-bold text-on-surface/45 flex items-center gap-1.5 mt-1 font-['DM_Mono',monospace]">
                <Hash size={10} className="opacity-50 shrink-0" />
                {company.cnpj}
              </div>
            </div>
            <ChevronRight size={16} className="text-on-surface/20 shrink-0" />
          </button>
        ))}

        <button
          onClick={onAdd}
          className="flex flex-col items-center justify-center gap-2.5 border-2 border-dashed border-on-surface/[0.14] hover:border-primary/40 rounded-[20px] py-8 px-4 text-on-surface/30 hover:text-primary transition-colors"
        >
          <Plus size={20} strokeWidth={2.2} />
          <span className="text-xs font-black uppercase tracking-wide">Adicionar loja</span>
        </button>
      </div>
    </div>
  );
}

// ── Aba Usabilidade — Aparência ─────────────────────────────────────────────

function AparenciaSection({ theme, onSelect }: { theme: 'light' | 'dark'; onSelect: (t: 'light' | 'dark') => void }) {
  return (
    <div className="bg-surface-container-lowest rounded-[3rem] border border-on-surface/[0.03] shadow-xl shadow-on-surface/[0.02] p-10 space-y-8 max-w-2xl">
      <div className="flex items-center gap-4">
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
        <button
          onClick={() => onSelect('light')}
          className={cn(
            'relative flex flex-col items-center gap-4 p-6 rounded-3xl border-2 transition-[colors,box-shadow] group',
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

        <button
          onClick={() => onSelect('dark')}
          className={cn(
            'relative flex flex-col items-center gap-4 p-6 rounded-3xl border-2 transition-[colors,box-shadow] group',
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
  );
}

// ── Aba Segurança — Senhas ──────────────────────────────────────────────────

function SegurancaSection({
  hrPassword, setHrPassword, showHrPassword, setShowHrPassword, onSave, saving, saved,
}: {
  hrPassword: string;
  setHrPassword: (v: string) => void;
  showHrPassword: boolean;
  setShowHrPassword: (v: boolean | ((prev: boolean) => boolean)) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const field = 'w-full bg-surface-container border border-on-surface/10 rounded-2xl px-4 py-3 text-sm font-semibold text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-colors placeholder:text-on-surface/30';

  return (
    <div className="bg-surface-container-lowest rounded-[3rem] border border-on-surface/[0.03] shadow-xl shadow-on-surface/[0.02] p-10 space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-[1.2rem] bg-red-500/10 text-red-600 flex items-center justify-center shadow-inner">
          <ShieldCheck size={22} />
        </div>
        <div>
          <h3 className="text-xl font-black text-on-surface tracking-tight">Segurança</h3>
          <p className="text-xs text-on-surface/40 font-medium uppercase tracking-widest">Acesso a áreas restritas</p>
        </div>
      </div>

      <p className="text-sm text-on-surface/50 leading-relaxed">
        Define a senha para acessar as abas <strong className="text-on-surface/70">Colaboradores</strong> e <strong className="text-on-surface/70">Caderninho</strong> no módulo de Recursos Humanos. Deixe em branco para desativar a proteção.
      </p>

      <div className="space-y-2">
        <label className="text-[10px] font-black text-on-surface/40 uppercase tracking-widest flex items-center gap-1.5">
          <Lock size={11} /> Senha — Recursos Humanos
        </label>
        <div className="relative">
          <input
            type={showHrPassword ? 'text' : 'password'}
            value={hrPassword}
            onChange={e => setHrPassword(e.target.value)}
            placeholder="Digite uma senha..."
            className={cn(field, 'pr-12')}
          />
          <button
            type="button"
            onClick={() => setShowHrPassword(v => !v)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface/30 hover:text-on-surface/60 transition-colors"
          >
            {showHrPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center justify-center gap-2 bg-primary text-white px-8 py-4 rounded-2xl font-black text-sm hover:bg-on-surface transition-[colors,transform] shadow-xl shadow-primary/20 uppercase tracking-widest active:scale-95 disabled:opacity-60"
      >
        {saved ? (
          <><CheckCircle2 size={18} /> Salvo!</>
        ) : saving ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" />
        ) : (
          <><Save size={18} /> Salvar Senha</>
        )}
      </button>
    </div>
  );
}
