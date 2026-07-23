'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, Link2, Loader2, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

export interface LinkedNoteLite {
  id: string;
  note_number: string | null;
  supplier_name: string | null;
  timestamp_label: string | null;
  file_name?: string | null;
}

const NOTE_COLUMNS = 'id, note_number, supplier_name, timestamp_label, file_name';

// ── Sync helpers (junção = fonte de verdade; FK legada aponta p/ 1ª tx) ────

export async function linkNotesToTransactions(
  txs: { id: string; favorecido: string; valor_final: number }[],
  noteIds: string[],
) {
  if (txs.length === 0 || noteIds.length === 0) return;
  const rows = txs.flatMap(tx => noteIds.map(noteId => ({ transaction_id: tx.id, note_id: noteId })));
  await supabase.from('finance_transaction_notes').upsert(rows, { onConflict: 'transaction_id,note_id' });
  await supabase.from('review_notes').update({
    finance_transaction_id: txs[0].id,
    finance_tx_favorecido: txs[0].favorecido,
    finance_tx_valor: txs[0].valor_final,
  }).in('id', noteIds);
}

export async function unlinkNoteFromTransaction(txId: string, noteId: string) {
  await supabase.from('finance_transaction_notes').delete()
    .eq('transaction_id', txId).eq('note_id', noteId);
  const { data: remaining } = await supabase.from('finance_transaction_notes')
    .select('transaction_id').eq('note_id', noteId).limit(1);
  if (!remaining || remaining.length === 0) {
    await supabase.from('review_notes').update({
      finance_transaction_id: null,
      finance_tx_favorecido: null,
      finance_tx_valor: null,
    }).eq('id', noteId);
    return;
  }
  const { data: tx } = await supabase.from('finance_transactions')
    .select('id, favorecido, valor_final').eq('id', remaining[0].transaction_id).single();
  await supabase.from('review_notes').update({
    finance_transaction_id: tx?.id ?? null,
    finance_tx_favorecido: tx?.favorecido ?? null,
    finance_tx_valor: tx?.valor_final ?? null,
  }).eq('id', noteId);
}

// Limpa FK/caches de notas cujas transações foram deletadas (junção some via CASCADE)
export async function cleanupNoteLinksForDeletedTxs(txIds: string[]) {
  if (txIds.length === 0) return;
  const { data: notes } = await supabase.from('review_notes')
    .select('id').in('finance_transaction_id', txIds);
  if (!notes || notes.length === 0) return;
  for (const n of notes) {
    const { data: remaining } = await supabase.from('finance_transaction_notes')
      .select('transaction_id').eq('note_id', n.id).limit(1);
    if (remaining && remaining.length > 0) {
      const { data: tx } = await supabase.from('finance_transactions')
        .select('id, favorecido, valor_final').eq('id', remaining[0].transaction_id).single();
      await supabase.from('review_notes').update({
        finance_transaction_id: tx?.id ?? null,
        finance_tx_favorecido: tx?.favorecido ?? null,
        finance_tx_valor: tx?.valor_final ?? null,
      }).eq('id', n.id);
    } else {
      await supabase.from('review_notes').update({
        finance_transaction_id: null,
        finance_tx_favorecido: null,
        finance_tx_valor: null,
      }).eq('id', n.id);
    }
  }
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  txId: string | null;
  editable: boolean;
  variant: 'desktop' | 'mobile';
  txMeta?: { favorecido: string; valor_final: number } | null;
  pendingNotes?: LinkedNoteLite[];
  onPendingChange?: (notes: LinkedNoteLite[]) => void;
  // Parcelas irmãs (mesmo parcelamento) — quando presente, vincular uma nota aqui
  // vincula automaticamente a todas elas, não só à parcela sendo vista.
  siblingTxs?: { id: string; favorecido: string; valor_final: number }[];
}

const noteLabel = (n: LinkedNoteLite) => n.note_number || n.file_name || 'Sem número';

export function LinkedNotesSection({ txId, editable, variant, txMeta, pendingNotes, onPendingChange, siblingTxs }: Props) {
  const isDesktop = variant === 'desktop';
  const isCreate = txId === null;

  const [linkedNotes, setLinkedNotes] = useState<LinkedNoteLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<LinkedNoteLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyNoteId, setBusyNoteId] = useState<string | null>(null);

  const notes = isCreate ? (pendingNotes ?? []) : linkedNotes;

  const fetchLinked = useCallback(async () => {
    if (!txId) return;
    setLoading(true);
    const { data } = await supabase.from('finance_transaction_notes')
      .select(`note_id, review_notes (${NOTE_COLUMNS})`)
      .eq('transaction_id', txId);
    setLinkedNotes(
      (data ?? [])
        .map((r: any) => r.review_notes as LinkedNoteLite | null)
        .filter((n): n is LinkedNoteLite => !!n)
    );
    setLoading(false);
  }, [txId]);

  useEffect(() => { fetchLinked(); }, [fetchLinked]);

  const fetchUnlinked = useCallback(async (q: string) => {
    setSearching(true);
    let query = supabase.from('review_notes')
      .select(NOTE_COLUMNS)
      .is('finance_transaction_id', null)
      .order('created_at', { ascending: false })
      .limit(20);
    const term = q.trim();
    if (term) query = query.or(`note_number.ilike.%${term}%,supplier_name.ilike.%${term}%`);
    const [{ data: candidates }, { data: junction }] = await Promise.all([
      query,
      supabase.from('finance_transaction_notes').select('note_id'),
    ]);
    const linkedIds = new Set((junction ?? []).map((r: any) => r.note_id as string));
    const selectedIds = new Set(notes.map(n => n.id));
    setResults(
      ((candidates ?? []) as any[] as LinkedNoteLite[])
        .filter(n => !linkedIds.has(n.id) && !selectedIds.has(n.id))
    );
    setSearching(false);
  }, [notes]);

  useEffect(() => {
    if (!pickerOpen) return;
    const t = setTimeout(() => fetchUnlinked(search), 250);
    return () => clearTimeout(t);
  }, [pickerOpen, search, fetchUnlinked]);

  const handlePick = async (note: LinkedNoteLite) => {
    if (isCreate) {
      onPendingChange?.([...(pendingNotes ?? []), note]);
      setResults(prev => prev.filter(n => n.id !== note.id));
      return;
    }
    setBusyNoteId(note.id);
    // Se a movimentação faz parte de um parcelamento, vincula a nota a todas as parcelas
    // irmãs de uma vez — não só à parcela sendo vista.
    const targets = siblingTxs && siblingTxs.length > 0
      ? siblingTxs
      : [{ id: txId!, favorecido: txMeta?.favorecido ?? '', valor_final: txMeta?.valor_final ?? 0 }];
    await linkNotesToTransactions(targets, [note.id]);
    setLinkedNotes(prev => [...prev, note]);
    setResults(prev => prev.filter(n => n.id !== note.id));
    setBusyNoteId(null);
  };

  const handleRemove = async (note: LinkedNoteLite) => {
    if (isCreate) {
      onPendingChange?.((pendingNotes ?? []).filter(n => n.id !== note.id));
      return;
    }
    setBusyNoteId(note.id);
    await unlinkNoteFromTransaction(txId!, note.id);
    setLinkedNotes(prev => prev.filter(n => n.id !== note.id));
    setBusyNoteId(null);
  };

  // ── Styles per variant ───────────────────────────────────────────────────
  const labelCls = isDesktop
    ? 'text-[10px] font-bold uppercase tracking-widest text-on-surface/40'
    : 'text-[9px] font-black uppercase tracking-[0.14em] text-[rgba(26,26,10,0.40)] dark:text-white/28 mb-1 block';
  const itemCls = isDesktop
    ? 'flex items-center gap-2.5 bg-surface-container rounded-xl px-3 py-2.5 border border-on-surface/5'
    : 'flex items-center gap-2.5 bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl px-3 py-2.5';
  const titleCls = isDesktop
    ? 'text-sm font-semibold text-on-surface truncate'
    : 'text-sm font-bold text-[#1A1A0E] dark:text-[#F2F0E3] truncate';
  const subCls = isDesktop
    ? 'text-xs text-on-surface/40 truncate'
    : 'text-[11px] text-[rgba(26,26,10,0.45)] dark:text-white/35 truncate';
  const iconCls = isDesktop
    ? 'shrink-0 text-on-surface/30'
    : 'shrink-0 text-[rgba(26,26,10,0.30)] dark:text-white/25';
  const emptyCls = isDesktop
    ? 'text-xs text-on-surface/30 italic'
    : 'text-xs text-[rgba(26,26,10,0.30)] dark:text-white/25 italic';
  const linkBtnCls = isDesktop
    ? 'flex items-center gap-1.5 self-start px-3 py-1.5 rounded-lg text-xs font-bold bg-on-surface/10 text-on-surface/60 hover:bg-primary/10 hover:text-primary transition-colors'
    : 'flex items-center gap-1.5 self-start px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider border-[1.5px] bg-[rgba(216,30,30,0.08)] border-[rgba(216,30,30,0.22)] text-[#D81E1E] active:scale-95 transition-transform';
  const removeBtnCls = isDesktop
    ? 'shrink-0 w-7 h-7 rounded-lg hover:bg-on-surface/5 flex items-center justify-center text-on-surface/40 hover:text-primary transition-colors'
    : 'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[rgba(26,26,10,0.35)] dark:text-white/30 active:scale-90 transition-transform';
  const pickerCls = isDesktop
    ? 'mt-2 flex flex-col gap-2 bg-on-surface/3 rounded-xl p-3'
    : 'mt-2 flex flex-col gap-2 bg-[rgba(26,26,10,0.04)] dark:bg-white/[0.04] rounded-xl p-3';
  const searchInputCls = isDesktop
    ? 'w-full pl-8 pr-3 py-2 bg-surface-container rounded-xl text-sm text-on-surface border border-on-surface/5 focus:outline-none focus:border-primary/50 placeholder:text-on-surface/30'
    : 'w-full pl-8 pr-3 py-2 bg-[#FDFAF0] dark:bg-[#252520] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl text-sm text-[#1A1A0E] dark:text-[#F2F0E3] focus:outline-none focus:border-[#D81E1E]';
  const resultItemCls = isDesktop
    ? 'w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-primary/5 transition-colors'
    : 'w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left active:bg-[rgba(216,30,30,0.06)] transition-colors';

  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelCls}>Notas Fiscais</span>

      {loading ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 size={13} className={cn('animate-spin', iconCls)} />
          <span className={emptyCls}>Carregando notas...</span>
        </div>
      ) : notes.length === 0 && !editable ? (
        <div className={itemCls}>
          <span className={emptyCls}>Nenhuma nota vinculada</span>
        </div>
      ) : (
        notes.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {notes.map(n => (
              <div key={n.id} className={itemCls}>
                <FileText size={15} className={iconCls} />
                <div className="min-w-0 flex-1">
                  <p className={titleCls}>{noteLabel(n)}</p>
                  <p className={subCls}>
                    {n.supplier_name || 'Fornecedor não informado'}
                    {n.timestamp_label ? ` · ${n.timestamp_label}` : ''}
                  </p>
                </div>
                {editable && (
                  <button type="button" onClick={() => handleRemove(n)} disabled={busyNoteId === n.id} className={removeBtnCls} title="Remover vínculo">
                    {busyNoteId === n.id ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {editable && (
        <button
          type="button"
          onClick={() => { setPickerOpen(o => !o); setSearch(''); }}
          className={linkBtnCls}
        >
          {pickerOpen ? <X size={13} /> : <Link2 size={13} />}
          {pickerOpen ? 'Fechar' : 'Vincular nota'}
        </button>
      )}

      {editable && pickerOpen && (
        <div className={pickerCls}>
          <div className="relative">
            <Search size={13} className={cn('absolute left-2.5 top-1/2 -translate-y-1/2', iconCls)} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por número ou fornecedor..."
              className={searchInputCls}
              autoComplete="off"
            />
          </div>
          <div className="max-h-44 overflow-y-auto flex flex-col gap-0.5">
            {searching ? (
              <div className="flex items-center gap-2 px-3 py-2">
                <Loader2 size={13} className={cn('animate-spin', iconCls)} />
                <span className={emptyCls}>Buscando...</span>
              </div>
            ) : results.length === 0 ? (
              <span className={cn(emptyCls, 'px-3 py-2')}>Nenhuma nota disponível</span>
            ) : (
              results.map(n => (
                <button key={n.id} type="button" onClick={() => handlePick(n)} disabled={busyNoteId === n.id} className={resultItemCls}>
                  {busyNoteId === n.id
                    ? <Loader2 size={15} className={cn('animate-spin', iconCls)} />
                    : <Plus size={15} className={iconCls} />}
                  <div className="min-w-0 flex-1">
                    <p className={titleCls}>{noteLabel(n)}</p>
                    <p className={subCls}>
                      {n.supplier_name || 'Fornecedor não informado'}
                      {n.timestamp_label ? ` · ${n.timestamp_label}` : ''}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
