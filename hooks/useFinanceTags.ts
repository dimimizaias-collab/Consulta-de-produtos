'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface FinanceTag {
  id: string;
  nome: string;
  cor: string;
  descricao: string | null;
  created_at: string;
}

export const TAG_COLOR_MAP: Record<string, { bg: string; text: string; border: string; bgDark: string; textDark: string; borderDark: string; dot: string }> = {
  blue:   { bg: 'bg-blue-100',   text: 'text-blue-800',   border: 'border-blue-200',   bgDark: 'dark:bg-blue-950',   textDark: 'dark:text-blue-300',   borderDark: 'dark:border-blue-800',   dot: '#3b82f6' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200', bgDark: 'dark:bg-purple-950', textDark: 'dark:text-purple-300', borderDark: 'dark:border-purple-800', dot: '#8b5cf6' },
  amber:  { bg: 'bg-amber-100',  text: 'text-amber-800',  border: 'border-amber-200',  bgDark: 'dark:bg-amber-950',  textDark: 'dark:text-amber-300',  borderDark: 'dark:border-amber-800',  dot: '#f59e0b' },
  red:    { bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-200',    bgDark: 'dark:bg-red-950',    textDark: 'dark:text-red-300',    borderDark: 'dark:border-red-800',    dot: '#ef4444' },
  teal:   { bg: 'bg-teal-100',   text: 'text-teal-800',   border: 'border-teal-200',   bgDark: 'dark:bg-teal-950',   textDark: 'dark:text-teal-300',   borderDark: 'dark:border-teal-800',   dot: '#14b8a6' },
  green:  { bg: 'bg-green-100',  text: 'text-green-800',  border: 'border-green-200',  bgDark: 'dark:bg-green-950',  textDark: 'dark:text-green-300',  borderDark: 'dark:border-green-800',  dot: '#22c55e' },
  gray:   { bg: 'bg-stone-100',  text: 'text-stone-600',  border: 'border-stone-200',  bgDark: 'dark:bg-stone-800',  textDark: 'dark:text-stone-300',  borderDark: 'dark:border-stone-600',  dot: '#6b7280' },
};

export const TAG_COLORS = Object.keys(TAG_COLOR_MAP) as (keyof typeof TAG_COLOR_MAP)[];

export function useFinanceTags() {
  const [tags, setTags] = useState<FinanceTag[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTags = useCallback(async () => {
    const { data } = await supabase
      .from('finance_tags')
      .select('*')
      .order('nome');
    if (data) setTags(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const createTag = useCallback(async (nome: string, cor: string, descricao: string) => {
    const { data, error } = await supabase
      .from('finance_tags')
      .insert({ nome: nome.trim(), cor, descricao: descricao.trim() || null })
      .select()
      .single();
    if (error) throw error;
    setTags(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)));
    return data as FinanceTag;
  }, []);

  const updateTag = useCallback(async (id: string, fields: Partial<Pick<FinanceTag, 'nome' | 'cor' | 'descricao'>>) => {
    const { error } = await supabase
      .from('finance_tags')
      .update(fields)
      .eq('id', id);
    if (error) throw error;
    setTags(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t).sort((a, b) => a.nome.localeCompare(b.nome)));
  }, []);

  const deleteTag = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('finance_tags')
      .delete()
      .eq('id', id);
    if (error) throw error;
    setTags(prev => prev.filter(t => t.id !== id));
  }, []);

  return { tags, loading, fetchTags, createTag, updateTag, deleteTag };
}
