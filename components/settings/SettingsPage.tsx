'use client';

import { useState, useEffect, useRef } from 'react';
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
  Camera,
  User,
  Check,
  Lock,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { EMPLOYEE_PHOTO_BUCKET } from '@/lib/hrEmployees';
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

  const [currentUsuario, setCurrentUsuario] = useState<CurrentUsuario | null>(null);
  const [currentUsuarioLoading, setCurrentUsuarioLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null;
    setTheme(t === 'dark' ? 'dark' : 'light');
    loadCompanies();
    loadUsuarios();
    loadEmployees();
    loadCurrentUsuario();
  }, []);

  async function loadCurrentUsuario() {
    setCurrentUsuarioLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('usuarios')
        .select('id, email, role, username, avatar_url, employee_id, hr_employees(nome, cargo, foto_url)')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (data) setCurrentUsuario(data as unknown as CurrentUsuario);
    } finally {
      setCurrentUsuarioLoading(false);
    }
  }

  const handleUpdateCurrentUsuario = async (updates: { username?: string | null; avatarUrl?: string | null; employeeId?: string; role?: string }) => {
    if (!currentUsuario) return { ok: false, error: 'Usuário não carregado.' };
    const res = await fetch('/api/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: currentUsuario.id, ...updates }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Erro ao salvar.' };
    await loadCurrentUsuario();
    loadUsuarios();
    return { ok: true };
  };

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
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
          <PerfilSection
            usuario={currentUsuario}
            loading={currentUsuarioLoading}
            allEmployees={allEmployees}
            onSave={handleUpdateCurrentUsuario}
          />
          <SegurancaSection
            usuarios={usuarios}
            loading={usuariosLoading}
            onAdd={() => setUsuarioModalOpen(true)}
            onToggleAtivo={handleToggleAtivo}
            onDelete={handleDeleteUsuario}
          />
        </div>
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

interface CurrentUsuario {
  id: string;
  email: string;
  role: string;
  username: string | null;
  avatar_url: string | null;
  employee_id: string;
  hr_employees?: { nome: string; cargo: string; foto_url: string | null } | null;
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

// ── Aba Segurança — Perfil do usuário logado ─────────────────────────────────

function PerfilSection({
  usuario, loading, allEmployees, onSave,
}: {
  usuario: CurrentUsuario | null;
  loading: boolean;
  allEmployees: LinkableEmployee[];
  onSave: (updates: { username?: string | null; avatarUrl?: string | null; employeeId?: string; role?: string }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const isAdmin = usuario?.role === 'admin';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [role, setRole] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const resetFromUsuario = () => {
    if (!usuario) return;
    setUsername(usuario.username || '');
    setEmployeeId(usuario.employee_id);
    setRole(usuario.role);
  };

  useEffect(() => {
    resetFromUsuario();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(t);
  }, [message]);

  const sectionCls = 'bg-white dark:bg-[#252520] border border-[#1A1A0E]/[0.11] dark:border-white/[0.08] shadow-[0_1px_2px_rgba(26,26,10,0.04),0_6px_16px_-8px_rgba(26,26,10,0.14)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)] rounded-[20px] p-4';
  const fieldCls = 'w-full min-w-0 bg-[#1A1A0E]/[0.045] dark:bg-white/[0.05] border-[1.5px] border-[#1A1A0E]/[0.14] dark:border-white/[0.12] rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-[#1A1A0E] dark:text-[#F2F0E3] outline-none focus:border-primary/50 disabled:opacity-55 disabled:cursor-not-allowed';
  const labelCls = 'text-[10px] font-extrabold uppercase tracking-wide text-[#1A1A0E]/45 dark:text-white/40 mb-1.5 block';

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !usuario) return;
    setUploading(true);
    setMessage(null);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `avatars/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(EMPLOYEE_PHOTO_BUCKET).upload(path, file);
      if (uploadError) throw uploadError;
      const avatarUrl = supabase.storage.from(EMPLOYEE_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
      const res = await onSave({ avatarUrl });
      setMessage(res.ok ? { type: 'ok', text: 'Foto atualizada.' } : { type: 'error', text: res.error || 'Erro ao salvar a foto.' });
    } catch {
      setMessage({ type: 'error', text: 'Erro ao enviar a foto.' });
    } finally {
      setUploading(false);
    }
  };

  const handleEditToggle = async () => {
    if (!isEditing) {
      setIsEditing(true);
      return;
    }
    setSaving(true);
    setMessage(null);
    const updates: { username?: string | null; employeeId?: string; role?: string } = {
      username: username.trim() || null,
    };
    if (isAdmin) {
      updates.employeeId = employeeId;
      updates.role = role;
    }
    const res = await onSave(updates);
    setSaving(false);
    if (res.ok) {
      setIsEditing(false);
      setMessage({ type: 'ok', text: 'Alterações salvas.' });
    } else {
      setMessage({ type: 'error', text: res.error || 'Erro ao salvar.' });
    }
  };

  const handleCancel = () => {
    resetFromUsuario();
    setIsEditing(false);
    setMessage(null);
  };

  const avatarUrl = usuario?.avatar_url || usuario?.hr_employees?.foto_url || null;
  // allEmployees já lista todos os funcionários (não só os sem login vinculado),
  // então o funcionário atual do usuário sempre aparece nas opções.
  const employeesForSelect = allEmployees;

  return (
    <div className="bg-[#F5EDCE] dark:bg-[#1E1E18] rounded-[3rem] border border-[#1A1A0E]/[0.07] dark:border-white/5 shadow-xl shadow-on-surface/[0.02] p-7 space-y-4 flex flex-col">
      <div className="flex items-center gap-4">
        <div className="w-[42px] h-[42px] rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-inner shrink-0">
          <UserCog size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-black text-on-surface tracking-tight">Perfil</h3>
          <p className="text-[10px] text-on-surface/40 font-extrabold uppercase tracking-widest">Sua conta</p>
        </div>
        {!loading && usuario && (
          <div className="flex items-center gap-2 shrink-0">
            {isEditing && (
              <button
                onClick={handleCancel}
                disabled={saving}
                className="text-[11px] font-extrabold uppercase tracking-wide text-on-surface/45 hover:text-on-surface transition-colors px-2 disabled:opacity-50"
              >
                Cancelar
              </button>
            )}
            <button
              onClick={handleEditToggle}
              disabled={saving}
              title={isEditing ? 'Salvar' : 'Editar perfil'}
              className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors disabled:opacity-60',
                isEditing ? 'bg-primary text-white' : 'bg-[#1A1A0E]/[0.07] dark:bg-white/[0.08] text-on-surface/55 hover:text-on-surface'
              )}
            >
              {saving ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-solid border-current border-r-transparent" />
              ) : isEditing ? (
                <Check size={15} />
              ) : (
                <Pencil size={14} />
              )}
            </button>
          </div>
        )}
      </div>

      {loading || !usuario ? (
        <div className="text-center py-8 text-on-surface/30 text-sm font-semibold">
          {loading ? 'Carregando…' : 'Não foi possível carregar seu perfil.'}
        </div>
      ) : (
        <>
          <div className={sectionCls}>
            <div className="flex items-center gap-3.5">
              <div className="relative w-14 h-14 rounded-[18px] bg-[#1A1A0E]/[0.045] dark:bg-white/[0.05] border border-[#1A1A0E]/[0.14] dark:border-white/[0.12] overflow-hidden flex items-center justify-center text-[#1A1A0E]/30 dark:text-white/30 shrink-0">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User size={22} />
                )}
                {uploading && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-extrabold text-on-surface truncate">
                  {usuario.hr_employees?.nome || 'Funcionário removido'}
                </div>
                <div className="text-[11px] font-bold text-on-surface/40 truncate">{usuario.email}</div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 text-[10.5px] font-extrabold text-primary uppercase tracking-wide disabled:opacity-50 shrink-0 whitespace-nowrap"
              >
                <Camera size={11} /> Trocar Foto
              </button>
            </div>
          </div>

          <div className={sectionCls}>
            <div className="flex items-center gap-1.5 mb-3">
              <Lock size={12} className="text-primary shrink-0" />
              <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-on-surface">Acesso</span>
            </div>
            <label className={labelCls}>Nome de usuário</label>
            <input
              className={fieldCls}
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="ex: joao.silva"
              autoCapitalize="none"
              autoCorrect="off"
              disabled={!isEditing}
            />
            <p className="text-[10px] font-medium text-on-surface/35 mt-1.5 leading-relaxed">
              Use no lugar do e-mail para entrar no sistema.
            </p>
          </div>

          <div className={sectionCls}>
            <div className="flex items-center gap-1.5 mb-3 text-on-surface/40">
              {!isAdmin && <Lock size={11} />}
              <span className="text-[10px] font-extrabold uppercase tracking-wide">
                {isAdmin ? 'Editável por administradores' : 'Somente administradores podem editar'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Funcionário</label>
                {isAdmin ? (
                  <select className={fieldCls} value={employeeId} onChange={e => setEmployeeId(e.target.value)} disabled={!isEditing}>
                    {employeesForSelect.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.nome}</option>
                    ))}
                  </select>
                ) : (
                  <div className={cn(fieldCls, 'opacity-60 cursor-not-allowed truncate')}>{usuario.hr_employees?.nome || '—'}</div>
                )}
              </div>

              <div>
                <label className={labelCls}>Papel</label>
                {isAdmin ? (
                  <select className={fieldCls} value={role} onChange={e => setRole(e.target.value)} disabled={!isEditing}>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                ) : (
                  <div className={cn(fieldCls, 'opacity-60 cursor-not-allowed truncate')}>{ROLE_LABELS[usuario.role] || usuario.role}</div>
                )}
              </div>
            </div>
          </div>

          {message && (
            <p className={cn(
              'text-[11.5px] font-bold rounded-xl px-3.5 py-2.5 text-center',
              message.type === 'ok' ? 'text-green-700 dark:text-green-400 bg-green-500/10' : 'text-red-600 dark:text-red-400 bg-red-500/10'
            )}>
              {message.text}
            </p>
          )}
        </>
      )}
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
    <div className="bg-[#F5EDCE] dark:bg-[#1E1E18] rounded-[3rem] border border-[#1A1A0E]/[0.07] dark:border-white/5 shadow-xl shadow-on-surface/[0.02] p-7 space-y-4 min-w-0 flex flex-col">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-[42px] h-[42px] rounded-2xl bg-red-500/10 text-red-600 flex items-center justify-center shadow-inner shrink-0">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h3 className="text-lg font-black text-on-surface tracking-tight">Segurança</h3>
            <p className="text-[10px] text-on-surface/40 font-extrabold uppercase tracking-widest">Usuários com acesso ao sistema</p>
          </div>
        </div>
      </div>

      <p className="text-[12.5px] text-on-surface/55 leading-relaxed">
        Cada login é vinculado a um funcionário já cadastrado em <strong className="text-on-surface/75">Recursos Humanos</strong>. Crie um usuário por pessoa que precisa acessar o sistema.
      </p>

      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-extrabold text-on-surface/40 uppercase tracking-widest">
          {loading ? 'Carregando…' : `${usuarios.length} usuário${usuarios.length !== 1 ? 's' : ''} cadastrado${usuarios.length !== 1 ? 's' : ''}`}
        </span>
        <button
          onClick={onAdd}
          className="flex items-center gap-2 bg-primary text-white px-4.5 py-2.5 rounded-2xl font-black text-[10.5px] hover:bg-on-surface transition-[colors,transform] shadow-lg shadow-primary/25 uppercase tracking-wide active:scale-95"
        >
          <Plus size={14} strokeWidth={2.6} />
          Novo Usuário
        </button>
      </div>

      <div className="space-y-2.5">
        {usuarios.map(usuario => (
          <div
            key={usuario.id}
            className="flex items-center gap-3 bg-white dark:bg-[#252520] border border-[#1A1A0E]/[0.11] dark:border-white/[0.08] shadow-[0_1px_2px_rgba(26,26,10,0.04),0_6px_16px_-8px_rgba(26,26,10,0.14)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.25)] rounded-[18px] p-3"
          >
            <div className="w-10 h-10 rounded-[14px] bg-[#1A1A0E]/[0.045] dark:bg-white/[0.05] border border-[#1A1A0E]/[0.14] dark:border-white/[0.12] flex items-center justify-center overflow-hidden shrink-0 text-[#1A1A0E]/30 dark:text-white/30">
              {usuario.hr_employees?.foto_url ? (
                <img src={usuario.hr_employees.foto_url} alt={usuario.hr_employees.nome} className="w-full h-full object-cover" />
              ) : (
                <UserCog size={17} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-extrabold text-on-surface truncate">
                {usuario.hr_employees?.nome || 'Funcionário removido'}
              </div>
              <div className="text-[10.5px] font-bold text-on-surface/45 truncate">{usuario.email}</div>
            </div>
            <span className={cn(
              'text-[9.5px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg shrink-0',
              'bg-primary/10 text-primary'
            )}>
              {ROLE_LABELS[usuario.role] || usuario.role}
            </span>
            <button
              onClick={() => onToggleAtivo(usuario)}
              title={usuario.ativo ? 'Desativar acesso' : 'Ativar acesso'}
              className={cn(
                'w-[30px] h-[30px] rounded-xl flex items-center justify-center shrink-0 transition-colors',
                usuario.ativo ? 'bg-green-500/10 text-green-600' : 'bg-on-surface/[0.06] text-on-surface/30'
              )}
            >
              <Power size={14} />
            </button>
            <button
              onClick={() => onDelete(usuario)}
              title="Remover usuário"
              className="w-[30px] h-[30px] rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 flex items-center justify-center shrink-0 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        {!loading && usuarios.length === 0 && (
          <div className="text-center py-8 text-on-surface/30 text-sm font-semibold">
            Nenhum usuário cadastrado ainda.
          </div>
        )}
      </div>
    </div>
  );
}
