'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { estabelecimentoDaEmpresa, PERSONAL_ESTABLISHMENT } from '@/lib/financeEstablishments';

// Visão por empresa (só admin): a lista suspensa do cabeçalho troca o que o site mostra entre
// "Todas" (como sempre foi), uma empresa do cadastro ou a conta "Pessoal" do financeiro.
// É filtro de VISUALIZAÇÃO — o RLS do banco continua aberto, não serve como controle de acesso.
// Os dados ligam a empresa de jeitos diferentes; use os helpers abaixo em vez de comparar à mão:
//   - UUID (review_notes.company_id, product_company_stock)      → matchesCompanyId
//   - origem/destino (distribution_manifests)                     → matchesManifest
//   - nome em texto (finance estabelecimento, hr_contratos.loja) → matchesEstabelecimento

/** 'all' = todas; 'pessoal' = conta Pessoal do financeiro; senão o id (UUID) da empresa. */
export type CompanyScopeValue = 'all' | 'pessoal' | string;

export interface ScopeCompany {
  id: string;
  nome_fantasia: string;
}

interface CompanyScopeContextType {
  scope: CompanyScopeValue;
  /** Empresa selecionada (null em "Todas" e "Pessoal"). */
  company: ScopeCompany | null;
  companies: ScopeCompany[];
  /** Só admin vê a lista suspensa; para os demais o escopo é sempre 'all'. */
  isAdmin: boolean;
  setScope: (next: CompanyScopeValue) => void;
}

const STORAGE_KEY = 'company-scope';

const CompanyScopeContext = createContext<CompanyScopeContextType>({
  scope: 'all',
  company: null,
  companies: [],
  isAdmin: false,
  setScope: () => {},
});

export function CompanyScopeProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<CompanyScopeValue>('all');
  const [companies, setCompanies] = useState<ScopeCompany[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setStored(saved);
    } catch {}

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const [{ data: usuarioRow }, { data: companyRows }] = await Promise.all([
          supabase.from('usuarios').select('role').eq('auth_user_id', user.id).maybeSingle(),
          supabase.from('companies').select('id, nome_fantasia').order('nome_fantasia'),
        ]);
        setIsAdmin(usuarioRow?.role === 'admin');
        setCompanies((companyRows ?? []) as ScopeCompany[]);
      } catch {} finally {
        setReady(true);
      }
    })();
  }, []);

  // Escolha salva só vale para admin e para empresa que ainda existe — senão volta a "Todas"
  // (ex.: usuário deixou de ser admin, ou a empresa foi excluída em Configurações).
  const scope: CompanyScopeValue = useMemo(() => {
    if (!ready || !isAdmin) return 'all';
    if (stored === 'all' || stored === 'pessoal') return stored;
    return companies.some(c => c.id === stored) ? stored : 'all';
  }, [ready, isAdmin, stored, companies]);

  const company = useMemo(
    () => companies.find(c => c.id === scope) ?? null,
    [companies, scope],
  );

  const setScope = useCallback((next: CompanyScopeValue) => {
    setStored(next);
    try {
      if (next === 'all') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const value = useMemo(
    () => ({ scope, company, companies, isAdmin, setScope }),
    [scope, company, companies, isAdmin, setScope],
  );

  return <CompanyScopeContext.Provider value={value}>{children}</CompanyScopeContext.Provider>;
}

export function useCompanyScope() {
  return useContext(CompanyScopeContext);
}

/** Registro com company_id (UUID). Sem empresa (legado) só aparece em "Todas". */
export function matchesCompanyId(scope: CompanyScopeValue, companyId: string | null | undefined) {
  if (scope === 'all') return true;
  if (scope === 'pessoal') return false;
  return companyId === scope;
}

/** Transferência entre lojas: aparece para a origem e para o destino. */
export function matchesManifest(
  scope: CompanyScopeValue,
  originCompanyId: string | null | undefined,
  destinationCompanyId: string | null | undefined,
) {
  if (scope === 'all') return true;
  if (scope === 'pessoal') return false;
  return originCompanyId === scope || destinationCompanyId === scope;
}

/** Registro ligado por nome (estabelecimento do financeiro, loja do RH). */
export function matchesEstabelecimento(
  scope: CompanyScopeValue,
  company: ScopeCompany | null,
  estabelecimento: string | null | undefined,
) {
  if (scope === 'all') return true;
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const alvo = scope === 'pessoal' ? PERSONAL_ESTABLISHMENT : company ? estabelecimentoDaEmpresa(company.nome_fantasia) : null;
  if (!alvo || !estabelecimento) return false;
  return norm(estabelecimentoDaEmpresa(estabelecimento)) === norm(alvo);
}
