'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { STORE_ESTABLISHMENTS, PERSONAL_ESTABLISHMENT, lojasDasEmpresas } from '@/lib/financeEstablishments';

// Lista de estabelecimentos do financeiro a partir das empresas cadastradas
// (Configurações › Dados). Carrega uma vez por sessão e é compartilhada entre os
// componentes; `recarregarEstabelecimentos()` força nova leitura (ex.: após cadastrar empresa).

let cache: string[] | null = null;
let carregando: Promise<void> | null = null;
const ouvintes = new Set<(lojas: string[]) => void>();

async function carregar() {
  const { data, error } = await supabase.from('companies').select('nome_fantasia').order('nome_fantasia');
  if (error) return; // mantém a lista padrão
  cache = lojasDasEmpresas((data ?? []).map(c => String(c.nome_fantasia ?? '')).filter(Boolean));
  ouvintes.forEach(fn => fn(cache!));
}

export function recarregarEstabelecimentos() {
  carregando = carregar().finally(() => { carregando = null; });
  return carregando;
}

/** `lojas`: empresas cadastradas; `todos`: lojas + Pessoal (para o campo Estabelecimento). */
export function useFinanceEstablishments() {
  const [lojas, setLojas] = useState<string[]>(cache ?? STORE_ESTABLISHMENTS);

  useEffect(() => {
    ouvintes.add(setLojas);
    if (!cache && !carregando) recarregarEstabelecimentos();
    return () => { ouvintes.delete(setLojas); };
  }, []);

  return { lojas, todos: [...lojas, PERSONAL_ESTABLISHMENT] };
}
