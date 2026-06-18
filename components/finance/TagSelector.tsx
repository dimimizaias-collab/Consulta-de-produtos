'use client';

import { useState } from 'react';
import { Plus, Tag } from 'lucide-react';
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

  const labelCls = 'text-[10px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.40)] dark:text-white/28';

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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className={labelCls}>Tags</label>
        <span className="text-[10px] text-[rgba(26,26,10,0.28)] dark:text-white/20">
          {value.length > 0 ? `${value.length} selecionada${value.length > 1 ? 's' : ''}` : 'Nenhuma'}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 p-2.5 bg-[rgba(26,26,10,0.04)] dark:bg-white/[0.04] border border-[rgba(26,26,10,0.07)] dark:border-white/[0.07] rounded-xl min-h-[42px]">
        {tags.map(tag => {
          const c = TAG_COLOR_MAP[tag.cor] ?? TAG_COLOR_MAP.gray;
          const selected = value.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggle(tag.id)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all duration-[130ms]',
                selected
                  ? 'bg-[#D81E1E] text-white border-[#D81E1E]'
                  : cn(c.bg, c.text, 'border', c.border, c.bgDark, c.textDark, c.borderDark)
              )}
            >
              {selected && <Tag size={9} strokeWidth={2.5} />}
              {tag.nome}
            </button>
          );
        })}

        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-dashed border-[rgba(26,26,10,0.20)] dark:border-white/20 text-[rgba(26,26,10,0.32)] dark:text-white/25 hover:border-[rgba(26,26,10,0.35)] dark:hover:border-white/35 transition-colors"
          >
            <Plus size={10} strokeWidth={2.5} />
            Nova tag
          </button>
        )}
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
