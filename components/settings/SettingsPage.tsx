'use client';

import { useState, useEffect } from 'react';
import {
  Sun,
  Moon,
  Hash,
  CheckCircle2,
  Monitor,
  Building2,
  Settings,
  Plus,
  ChevronRight,
  LayoutGrid,
  ShieldCheck,
  UserCog,
  Power,
  Trash2,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { CompanyModal, type Company } from './CompanyModal';
import { UsuarioModal, type LinkableEmployee } from './UsuarioModal';

const THEME_KEY = 'theme';

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

  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuariosLoading, setUsuariosLoading] = useState(true);
  const [allEmployees, setAllEmployees] = useState<LinkableEmployee[]>([]);
  const [usuarioModalOpen, setUsuarioModalOpen] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null;
    setTheme(t === 'dark' ? 'dark' : 'light');
    loadCompanies();
    loadUsuarios();
    loadEmployees();
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

  async function loadUsuarios() {
    setUsuariosLoading(true);
    try {
      const res = await fetch('/api/usuarios');
      const data = await res.json();
      setUsuarios(res.ok ? data.usuarios || [] : []);
    } finally {
      setUsuariosLoading(false);
    }
  }

  async function loadEmployees() {
    const { data } = await supabase.from('hr_employees').select('id, nome, cargo').order('nome');
    setAllEmployees(data || []);
  }

  const applyTheme = (next: 'light' | 'dark') => {
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  const handleToggleAtivo = async (usuario: Usuario) => {
    setUsuarios(prev => prev.map(u => u.id === usuario.id ? { ...u, ativo: !u.ativo } : u));
    await fetch('/api/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: usuario.id, ativo: !usuario.ativo }),
    });
  };

  const handleDeleteUsuario = async (usuario: Usuario) => {
    if (!confirm(`Remover o login de ${usuario.hr_employees?.nome || usuario.email}? Essa ação não pode ser desfeita.`)) return;
    setUsuarios(prev => prev.filter(u => u.id !== usuario.id));
    await fetch(`/api/usuarios?id=${usuario.id}`, { method: 'DELETE' });
    loadEmployees();
  };

  const linkedEmployeeIds = new Set(usuarios.map(u => u.employee_id));
  const linkableEmployees = allEmployees.filter(emp => !linkedEmployeeIds.has(emp.id));

  const openCreateModal = () => { setEditingCompany(null); setModalOpen(true); };
  const openEditModal = (c: Company) => { setEditingCompany(c); setModalOpen(true); };
  const closeModal = () => setModalOpen(false);
  const handleSaved = () => { closeModal(); loadCompanies(); };
  const handleDeleted = () => { closeModal(); loadCompanies(); };

  return (
    <div className="w-full space-y-8">
      {/* Header */}
      <div className="relative mb-14">
        <div className="bg-[#FFE500] dark:bg-[#252520] border border-[#D4C000] dark:border-white/[0.07] rounded-tl-[20px] rounded-tr-[20px] rounded-br-[20px] px-6 py-5 flex items-center gap-3.5">
          <div className="w-[52px] h-[52px] rounded-[14px] bg-[rgba(26,26,10,0.09)] dark:bg-[rgba(216,30,30,0.13)] flex items-center justify-center text-[#1A1A0E] dark:text-primary shrink-0">
            <Settings size={24} strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-[26px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] tracking-tight leading-tight">Configurações</h1>
            <div className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-[rgba(26,26,10,0.40)] dark:text-white/[0.28]">Store Identity &amp; Display Preferences</div>
          </div>
        </div>

        <div className="absolute left-0 top-full flex">
          {TABS.map((tab, i, arr) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                title={tab.label}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-[136px] h-[34px] flex items-center justify-center shrink-0',
                  'bg-[#FFE500] dark:bg-[#252520] border border-t-0 border-[#D4C000] dark:border-white/[0.07]',
                  i === arr.length - 1 && 'rounded-br-[12px]',
                  'text-[12px] font-extrabold uppercase tracking-wide truncate',
                  'shadow-[inset_0_6px_8px_-5px_rgba(26,26,10,0.35)] dark:shadow-[inset_0_6px_8px_-5px_rgba(0,0,0,0.55)]',
                  'transition-[opacity,transform] duration-150 active:scale-[0.97]',
                  active
                    ? 'text-[#1A1A0E] dark:text-[#F2F0E3] opacity-100'
                    : 'text-[#1A1A0E] dark:text-white/75 opacity-55 hover:opacity-85'
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
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
          usuarios={usuarios}
          loading={usuariosLoading}
          onAdd={() => setUsuarioModalOpen(true)}
          onToggleAtivo={handleToggleAtivo}
          onDelete={handleDeleteUsuario}
        />
      )}

      <CompanyModal
        open={modalOpen}
        company={editingCompany}
        onClose={closeModal}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />

      <UsuarioModal
        open={usuarioModalOpen}
        employees={linkableEmployees}
        onClose={() => setUsuarioModalOpen(false)}
        onCreated={() => { setUsuarioModalOpen(false); loadUsuarios(); }}
      />
    </div>
  );
}

interface Usuario {
  id: string;
  email: string;
  role: string;
  ativo: boolean;
  employee_id: string;
  hr_employees?: { nome: string; cargo: string; loja: string; foto_url: string | null } | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  gerente: 'Gerente',
  estoque: 'Estoque',
  caixa: 'Caixa',
};

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

// ── Aba Segurança — Usuários ─────────────────────────────────────────────────

function SegurancaSection({
  usuarios, loading, onAdd, onToggleAtivo, onDelete,
}: {
  usuarios: Usuario[];
  loading: boolean;
  onAdd: () => void;
  onToggleAtivo: (u: Usuario) => void;
  onDelete: (u: Usuario) => void;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-[3rem] border border-on-surface/[0.03] shadow-xl shadow-on-surface/[0.02] p-10 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[1.2rem] bg-red-500/10 text-red-600 flex items-center justify-center shadow-inner">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h3 className="text-xl font-black text-on-surface tracking-tight">Segurança</h3>
            <p className="text-xs text-on-surface/40 font-medium uppercase tracking-widest">Usuários com acesso ao sistema</p>
          </div>
        </div>
      </div>

      <p className="text-sm text-on-surface/50 leading-relaxed">
        Cada login é vinculado a um funcionário já cadastrado em <strong className="text-on-surface/70">Recursos Humanos</strong>. Crie um usuário por pessoa que precisa acessar o sistema.
      </p>

      <div className="flex items-center justify-between pt-2">
        <span className="text-xs font-extrabold text-on-surface/35 uppercase tracking-widest">
          {loading ? 'Carregando…' : `${usuarios.length} usuário${usuarios.length !== 1 ? 's' : ''} cadastrado${usuarios.length !== 1 ? 's' : ''}`}
        </span>
        <button
          onClick={onAdd}
          className="flex items-center gap-2 bg-primary text-white px-5 py-3 rounded-2xl font-black text-xs hover:bg-on-surface transition-[colors,transform] shadow-lg shadow-primary/25 uppercase tracking-wide active:scale-95"
        >
          <Plus size={15} strokeWidth={2.6} />
          Novo Usuário
        </button>
      </div>

      <div className="space-y-3">
        {usuarios.map(usuario => (
          <div
            key={usuario.id}
            className="flex items-center gap-3.5 bg-surface-container border border-on-surface/[0.08] rounded-[20px] p-3.5"
          >
            <div className="w-[46px] h-[46px] rounded-2xl bg-surface border border-on-surface/[0.08] flex items-center justify-center overflow-hidden shrink-0 text-on-surface/25">
              {usuario.hr_employees?.foto_url ? (
                <img src={usuario.hr_employees.foto_url} alt={usuario.hr_employees.nome} className="w-full h-full object-cover" />
              ) : (
                <UserCog size={20} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-extrabold text-on-surface truncate">
                {usuario.hr_employees?.nome || 'Funcionário removido'}
              </div>
              <div className="text-[11px] font-bold text-on-surface/45 truncate">{usuario.email}</div>
            </div>
            <span className={cn(
              'text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg shrink-0',
              'bg-primary/10 text-primary'
            )}>
              {ROLE_LABELS[usuario.role] || usuario.role}
            </span>
            <button
              onClick={() => onToggleAtivo(usuario)}
              title={usuario.ativo ? 'Desativar acesso' : 'Ativar acesso'}
              className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                usuario.ativo ? 'bg-green-500/10 text-green-600' : 'bg-on-surface/[0.06] text-on-surface/30'
              )}
            >
              <Power size={15} />
            </button>
            <button
              onClick={() => onDelete(usuario)}
              title="Remover usuário"
              className="w-8 h-8 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 flex items-center justify-center shrink-0 transition-colors"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}

        {!loading && usuarios.length === 0 && (
          <div className="text-center py-8 text-on-surface/30 text-sm font-semibold">
            Nenhum usuário cadastrado ainda.
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-on-surface/[0.06]">
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = '/login';
          }}
          className="flex items-center gap-2 text-red-600 dark:text-red-400 font-extrabold text-xs uppercase tracking-wide hover:opacity-70 transition-opacity mt-4"
        >
          <LogOut size={15} />
          Sair da conta
        </button>
      </div>
    </div>
  );
}
