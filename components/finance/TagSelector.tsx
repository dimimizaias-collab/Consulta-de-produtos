'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FinanceTag, TAG_COLOR_MAP, TAG_COLORS } from '@/hooks/useFinanceTags';

interface TagSelectorProps {
  tags: FinanceTag[];
  value: string[];
  onChange: (ids: string[]) => void;
  onCreateTag?: (nome: string, cor: string) => Promise<FinanceTag>;
  parcelCount?: number;
}

export function TagSelector({ tags, value, onChange, onCreateTag, parcelCount }: TagSelectorProps) {
  const [creating, setCreating] = useState(false);
  const [newNome, setNewNome] = useState('');
  const [newCor, setNewCor] = useState<string>('blue');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const labelCls = 'text-[10px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.40)] dark:text-white/28';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  }

  async function handleCreate() {
    if (!newNome.trim() || !onCreateTag) return;
    setSaving(true);
    try {
      const tag = await onCreateTag(newNome.trim(), newCor);
      onChange([...value, tag.id]);
      setNewNome('');
      setNewCor('blue');
      setCreating(false);
    } finally {
      setSaving(false);
    }
  }

  const selectedTags = tags.filter(t => value.includes(t.id));
  const filteredTags = tags.filter(t => !search.trim() || t.nome.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className={labelCls}>Tags</label>
        <span className="text-[10px] text-[rgba(26,26,10,0.28)] dark:text-white/20">
          {value.length > 0 ? `${value.length} selecionada${value.length > 1 ? 's' : ''}` : 'Nenhuma'}
        </span>
      </div>

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTags.map(tag => {
            const c = TAG_COLOR_MAP[tag.cor] ?? TAG_COLOR_MAP.gray;
            return (
              <span
                key={tag.id}
                className={cn(
                  'inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-semibold border',
                  c.bg, c.text, c.border, c.bgDark, c.textDark, c.borderDark,
                )}
              >
                {tag.nome}
                <button
                  type="button"
                  onClick={() => toggle(tag.id)}
                  className="w-3.5 h-3.5 rounded-full flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/15 transition-colors"
                >
                  <X size={9} strokeWidth={2.5} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 items-stretch">
        <div className="relative flex-1" ref={wrapRef}>
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[rgba(26,26,10,0.30)] dark:text-white/25 pointer-events-none" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Buscar tag..."
            autoComplete="off"
            className="w-full pl-8 pr-3 py-2 bg-[rgba(26,26,10,0.04)] dark:bg-white/[0.04] border border-[rgba(26,26,10,0.07)] dark:border-white/[0.07] rounded-xl text-[12px] text-[#1A1A0E] dark:text-[#F2F0E3] placeholder:text-[rgba(26,26,10,0.28)] dark:placeholder:text-white/25 focus:outline-none focus:border-[#D81E1E]"
          />
          {open && (
            <ul className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-[#2a2a24] border border-[rgba(26,26,10,0.10)] dark:border-white/10 rounded-xl shadow-xl overflow-hidden max-h-44 overflow-y-auto">
              {filteredTags.map(tag => {
                const c = TAG_COLOR_MAP[tag.cor] ?? TAG_COLOR_MAP.gray;
                const selected = value.includes(tag.id);
                return (
                  <li
                    key={tag.id}
                    onMouseDown={() => toggle(tag.id)}
                    className="flex items-center gap-2 px-3 py-2 text-[12px] font-semibold text-[#1A1A0E] dark:text-[#F2F0E3] hover:bg-[rgba(26,26,10,0.05)] dark:hover:bg-white/[0.06] cursor-pointer transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: TAG_COLOR_MAP[tag.cor]?.dot ?? c.dot }} />
                    <span className="flex-1 truncate">{tag.nome}</span>
                    {selected && <Check size={13} className="shrink-0 text-[#D81E1E]" strokeWidth={2.5} />}
                  </li>
                );
              })}
              {filteredTags.length === 0 && (
                <li className="px-3 py-2.5 text-[12px] text-[rgba(26,26,10,0.35)] dark:text-white/25 italic">Nenhuma tag encontrada</li>
              )}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCreating(v => !v)}
          title="Nova tag"
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.06] border border-[rgba(26,26,10,0.08)] dark:border-white/[0.08] text-[rgba(26,26,10,0.50)] dark:text-white/40 hover:bg-[rgba(216,30,30,0.10)] hover:text-[#D81E1E] hover:border-[rgba(216,30,30,0.30)] active:scale-[0.93] transition-all"
        >
          <Plus size={15} />
        </button>
      </div>

      {creating && (
        <div className="flex flex-col gap-2 p-3 bg-[rgba(26,26,10,0.03)] dark:bg-white/[0.03] border border-[rgba(26,26,10,0.08)] dark:border-white/[0.07] rounded-xl">
          <span className={cn(labelCls, 'mb-0')}>Criar nova tag</span>
          <input
            autoFocus
            value={newNome}
            onChange={e => setNewNome(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
            placeholder="Nome da tag..."
            className="px-3 py-2 bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-lg text-[12px] text-[#1A1A0E] dark:text-[#F2F0E3] placeholder:text-[rgba(26,26,10,0.28)] dark:placeholder:text-white/25 focus:outline-none focus:border-[#D81E1E]"
          />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[rgba(26,26,10,0.38)] dark:text-white/28">Cor:</span>
            <div className="flex gap-1.5">
              {TAG_COLORS.map(cor => (
                <button
                  key={cor}
                  type="button"
                  onClick={() => setNewCor(cor)}
                  className={cn(
                    'w-5 h-5 rounded-full transition-transform',
                    newCor === cor ? 'scale-125 ring-2 ring-offset-1 ring-[rgba(26,26,10,0.40)] dark:ring-white/40' : ''
                  )}
                  style={{ backgroundColor: TAG_COLOR_MAP[cor].dot }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newNome.trim() || saving}
              className="px-3 py-1.5 rounded-lg bg-[#D81E1E] text-white text-[11px] font-bold disabled:opacity-50 transition-opacity"
            >
              {saving ? 'Salvando...' : 'Criar'}
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setNewNome(''); }}
              className="px-3 py-1.5 rounded-lg bg-[rgba(26,26,10,0.07)] dark:bg-white/[0.07] text-[rgba(26,26,10,0.50)] dark:text-white/40 text-[11px] font-bold"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {parcelCount !== undefined && parcelCount > 1 && value.length > 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5">
          Esta tag será aplicada a todas as <strong>{parcelCount} parcelas</strong> automaticamente.
        </p>
      )}
    </div>
  );
}
