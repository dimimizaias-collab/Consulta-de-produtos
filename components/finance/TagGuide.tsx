'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, BookOpen, Pencil, Trash2, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FinanceTag, TAG_COLOR_MAP, TAG_COLORS, useFinanceTags } from '@/hooks/useFinanceTags';

interface TagGuideProps {
  tags: FinanceTag[];
  useCounts: Record<string, number>;
  onCreate: (nome: string, cor: string, descricao: string) => Promise<FinanceTag>;
  onUpdate: (id: string, fields: Partial<Pick<FinanceTag, 'nome' | 'cor' | 'descricao'>>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

const labelCls = 'text-[9px] font-black uppercase tracking-[0.12em] text-[rgba(26,26,10,0.38)] dark:text-white/28 block mb-1';
const inputCls = 'w-full px-3 py-2 bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-lg text-[12px] text-[#1A1A0E] dark:text-[#F2F0E3] placeholder:text-[rgba(26,26,10,0.28)] dark:placeholder:text-white/22 focus:outline-none focus:border-[#D81E1E] transition-colors';

export function TagGuide({ tags, useCounts, onCreate, onUpdate, onDelete, onClose }: TagGuideProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editCor, setEditCor] = useState('gray');
  const [editDesc, setEditDesc] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [newNome, setNewNome] = useState('');
  const [newCor, setNewCor] = useState('blue');
  const [newDesc, setNewDesc] = useState('');
  const [savingNew, setSavingNew] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  function startEdit(tag: FinanceTag) {
    setEditingId(tag.id);
    setEditNome(tag.nome);
    setEditCor(tag.cor);
    setEditDesc(tag.descricao ?? '');
  }

  async function saveEdit() {
    if (!editingId || !editNome.trim()) return;
    setSavingEdit(true);
    try {
      await onUpdate(editingId, { nome: editNome.trim(), cor: editCor, descricao: editDesc.trim() || null });
      setEditingId(null);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(tag: FinanceTag) {
    if (deletingId === tag.id) {
      await onDelete(tag.id);
      setDeletingId(null);
    } else {
      setDeletingId(tag.id);
      setTimeout(() => setDeletingId(prev => prev === tag.id ? null : prev), 3000);
    }
  }

  async function handleCreate() {
    if (!newNome.trim()) return;
    setSavingNew(true);
    try {
      await onCreate(newNome.trim(), newCor, newDesc.trim());
      setNewNome('');
      setNewDesc('');
      setNewCor('blue');
    } finally {
      setSavingNew(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 16 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        className="relative bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-3xl w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col border border-[rgba(26,26,10,0.07)] dark:border-white/[0.07]"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-[rgba(26,26,10,0.07)] dark:border-white/[0.06] shrink-0">
          <div className="w-8 h-8 rounded-xl bg-[rgba(26,26,10,0.07)] dark:bg-[rgba(216,30,30,0.13)] border border-[rgba(26,26,10,0.08)] dark:border-[rgba(216,30,30,0.20)] flex items-center justify-center text-[rgba(26,26,10,0.50)] dark:text-[#D81E1E]">
            <BookOpen size={15} />
          </div>
          <h2 className="flex-1 text-[15px] font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3]">Guia de tags</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[rgba(26,26,10,0.07)] dark:bg-white/[0.06] border border-[rgba(26,26,10,0.09)] dark:border-white/[0.08] flex items-center justify-center text-[rgba(26,26,10,0.40)] dark:text-white/35 hover:bg-[rgba(26,26,10,0.12)] dark:hover:bg-white/[0.09] transition-colors active:scale-[0.93]"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">

          {/* Section: existing tags */}
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[rgba(26,26,10,0.32)] dark:text-white/24">
            Tags existentes
          </p>

          {tags.length === 0 && (
            <p className="text-[12px] text-[rgba(26,26,10,0.38)] dark:text-white/28 italic py-2">
              Nenhuma tag criada ainda.
            </p>
          )}

          {tags.map(tag => {
            const c = TAG_COLOR_MAP[tag.cor] ?? TAG_COLOR_MAP.gray;
            const count = useCounts[tag.id] ?? 0;
            const isEditing = editingId === tag.id;
            const isDeleting = deletingId === tag.id;

            return (
              <div
                key={tag.id}
                className="flex flex-col gap-2 p-3 bg-[rgba(26,26,10,0.03)] dark:bg-white/[0.04] border border-[rgba(26,26,10,0.06)] dark:border-white/[0.06] rounded-xl"
              >
                {isEditing ? (
                  <div className="flex flex-col gap-2">
                    <div>
                      <label className={labelCls}>Nome</label>
                      <input className={inputCls} value={editNome} onChange={e => setEditNome(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                    </div>
                    <div>
                      <label className={labelCls}>Descrição (opcional)</label>
                      <input className={inputCls} value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Para que serve essa tag?" />
                    </div>
                    <div>
                      <label className={labelCls}>Cor</label>
                      <div className="flex gap-1.5 mt-1">
                        {TAG_COLORS.map(cor => (
                          <button key={cor} type="button" onClick={() => setEditCor(cor)}
                            className={cn('w-5 h-5 rounded-full transition-transform', editCor === cor ? 'scale-125 ring-2 ring-offset-1 ring-[rgba(26,26,10,0.40)] dark:ring-white/40' : '')}
                            style={{ backgroundColor: TAG_COLOR_MAP[cor].dot }} />
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveEdit} disabled={!editNome.trim() || savingEdit}
                        className="px-3 py-1.5 rounded-lg bg-[#D81E1E] text-white text-[11px] font-bold disabled:opacity-50 flex items-center gap-1">
                        <Check size={11} /> {savingEdit ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 rounded-lg bg-[rgba(26,26,10,0.07)] dark:bg-white/[0.07] text-[rgba(26,26,10,0.50)] dark:text-white/40 text-[11px] font-bold">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-[#1A1A0E] dark:text-[#F2F0E3]">{tag.nome}</p>
                      {tag.descricao && (
                        <p className="text-[11px] text-[rgba(26,26,10,0.38)] dark:text-white/28 truncate">{tag.descricao}</p>
                      )}
                    </div>
                    <span className={cn(
                      'text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0',
                      count === 0
                        ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
                        : 'bg-[rgba(26,26,10,0.06)] dark:bg-white/[0.07] border-[rgba(26,26,10,0.08)] dark:border-white/[0.08] text-[rgba(26,26,10,0.40)] dark:text-white/35'
                    )}>
                      {count === 0 ? 'Não usada' : `${count} uso${count !== 1 ? 's' : ''}`}
                    </span>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => startEdit(tag)}
                        className="w-7 h-7 rounded-lg border border-[rgba(26,26,10,0.09)] dark:border-white/[0.09] flex items-center justify-center text-[rgba(26,26,10,0.32)] dark:text-white/28 hover:bg-[rgba(26,26,10,0.06)] dark:hover:bg-white/[0.06] transition-colors">
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => handleDelete(tag)}
                        title={isDeleting ? 'Clique novamente para confirmar' : 'Excluir tag'}
                        className={cn(
                          'w-7 h-7 rounded-lg border flex items-center justify-center transition-all text-[11px] font-bold',
                          isDeleting
                            ? 'bg-red-500 border-red-500 text-white'
                            : 'border-[rgba(216,30,30,0.25)] text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors'
                        )}
                      >
                        {isDeleting ? '?' : <Trash2 size={12} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Divider */}
          <div className="h-px bg-[rgba(26,26,10,0.07)] dark:bg-white/[0.07]" />

          {/* New tag form */}
          <div className="p-3 border border-[rgba(26,26,10,0.08)] dark:border-white/[0.08] rounded-xl">
            <p className="text-[13px] font-bold text-[#1A1A0E] dark:text-[#F2F0E3] mb-3">Adicionar nova tag</p>
            <div className="flex flex-col gap-2">
              <div>
                <label className={labelCls}>Nome</label>
                <input className={inputCls} value={newNome} onChange={e => setNewNome(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  placeholder="Ex: Aluguel, Frete, Marketing..." />
              </div>
              <div>
                <label className={labelCls}>Descrição (opcional)</label>
                <input className={inputCls} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Para que serve essa tag?" />
              </div>
              <div>
                <label className={labelCls}>Cor</label>
                <div className="flex gap-1.5 mt-1">
                  {TAG_COLORS.map(cor => (
                    <button key={cor} type="button" onClick={() => setNewCor(cor)}
                      className={cn('w-5 h-5 rounded-full transition-transform', newCor === cor ? 'scale-125 ring-2 ring-offset-1 ring-[rgba(26,26,10,0.40)] dark:ring-white/40' : '')}
                      style={{ backgroundColor: TAG_COLOR_MAP[cor].dot }} />
                  ))}
                </div>
              </div>
              <button
                onClick={handleCreate}
                disabled={!newNome.trim() || savingNew}
                className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D81E1E] text-white text-[11px] font-bold disabled:opacity-50 transition-opacity"
              >
                <Plus size={12} />
                {savingNew ? 'Adicionando...' : 'Adicionar tag'}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
