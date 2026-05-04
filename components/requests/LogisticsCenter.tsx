'use client';

import { useState, useRef, useEffect } from 'react';
import {
  FileUp,
  FileText,
  Users,
  Download,
  Plus,
  BookText,
  ClipboardList,
  Pencil,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  Search,
  X,
  Building2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { AddSupplierModal, type EditingSupplier } from '@/components/suppliers/AddSupplierModal';

export interface ReviewNote {
  id: string;
  timestamp: string;
  fileName: string;
  items: any[];
  itemCount: number;
  verifiedCount: number;
  approved?: boolean;
  noteNumber?: string;
  accessKey?: string;
  supplierName?: string;
}

interface LogisticsCenterProps {
  importing: boolean;
  onImportClick: () => void;
  onManualNoteClick: () => void;
  onSuppliersClick: () => void;
  reviewNotes: ReviewNote[];
  onViewReviewNote: (note: ReviewNote) => void;
  onApproveNote: (noteId: string) => void;
}

export function LogisticsCenter({
  importing,
  onImportClick,
  onManualNoteClick,
  onSuppliersClick,
  reviewNotes,
  onViewReviewNote,
  onApproveNote,
}: LogisticsCenterProps) {
  const [showAddSupplier, setShowAddSupplier]       = useState(false);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [pickerSuppliers, setPickerSuppliers]       = useState<EditingSupplier[]>([]);
  const [supplierSearch, setSupplierSearch]         = useState('');
  const [loadingPicker, setLoadingPicker]           = useState(false);
  const [editingSupplier, setEditingSupplier]       = useState<EditingSupplier | null>(null);
  const [activeSection, setActiveSection]            = useState<'revisoes' | 'aprovados'>('revisoes');
  const [showSectionDropdown, setShowSectionDropdown] = useState(false);
  const [confirmApproveId, setConfirmApproveId]      = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowSectionDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchPickerSuppliers = async () => {
    setLoadingPicker(true);
    const { data } = await supabase.from('suppliers').select('*').order('nome_fantasia,name');
    setPickerSuppliers((data || []) as EditingSupplier[]);
    setLoadingPicker(false);
  };

  const openSupplierPicker = () => {
    setShowSupplierPicker(true);
    setSupplierSearch('');
    fetchPickerSuppliers();
  };

  const filteredSuppliers = pickerSuppliers.filter(s => {
    if (!supplierSearch.trim()) return true;
    const q = supplierSearch.toLowerCase();
    return (s.nome_fantasia || s.name).toLowerCase().includes(q) ||
      (s.razao_social || '').toLowerCase().includes(q);
  });

  const pendingNotes   = reviewNotes.filter(n => !n.approved);
  const approvedNotes  = reviewNotes.filter(n => n.approved);
  const visibleNotes   = activeSection === 'revisoes' ? pendingNotes : approvedNotes;

  const sectionLabel   = activeSection === 'revisoes' ? 'Revisões' : 'Aprovados';
  const confirmNote    = confirmApproveId ? reviewNotes.find(n => n.id === confirmApproveId) : null;

  return (
    <div className="space-y-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-black text-on-surface tracking-tighter">Entrada de Mercadoria</h1>
        <p className="text-sm text-on-surface/40 font-medium uppercase tracking-[0.2em]">Logistics Orchestration & Inventory Feed</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Import Card */}
        <motion.div
          whileHover={{ y: -5 }}
          className="bg-surface-container-lowest p-10 rounded-[3rem] border border-on-surface/[0.03] shadow-xl shadow-on-surface/[0.02] flex flex-col items-center text-center group relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-primary transform -translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
          <div className="w-24 h-24 rounded-[2rem] bg-primary/5 text-primary flex items-center justify-center mb-8 group-hover:bg-primary group-hover:text-white transition-all transform group-hover:rotate-6 shadow-inner">
            <FileUp size={48} />
          </div>
          <h3 className="text-2xl font-black text-on-surface mb-3 tracking-tight">Import Protocol</h3>
          <p className="text-sm text-on-surface/40 mb-10 max-w-[240px] leading-relaxed">Automated bulk ingestion via Excel/CSV with supplier mapping support.</p>
          <button
            onClick={onImportClick}
            disabled={importing}
            className="bg-primary text-white px-8 py-4 rounded-2xl font-black text-sm hover:bg-on-surface transition-all shadow-xl shadow-primary/20 flex items-center gap-3 w-full justify-center uppercase tracking-widest disabled:opacity-50 active:scale-95"
          >
            {importing ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-solid border-white border-r-transparent" />
            ) : (
              <>
                <Download size={20} />
                Execute Import
              </>
            )}
          </button>
        </motion.div>

        {/* Manual Note Card */}
        <motion.div
          whileHover={{ y: -5 }}
          className="bg-surface-container-lowest p-10 rounded-[3rem] border border-on-surface/[0.03] shadow-xl shadow-on-surface/[0.02] flex flex-col items-center text-center group relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-on-surface transform -translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
          <div className="w-24 h-24 rounded-[2rem] bg-on-surface/5 text-on-surface flex items-center justify-center mb-8 group-hover:bg-on-surface group-hover:text-white transition-all transform group-hover:-rotate-6 shadow-inner">
            <FileText size={48} />
          </div>
          <h3 className="text-2xl font-black text-on-surface mb-3 tracking-tight">Manual Manifest</h3>
          <p className="text-sm text-on-surface/40 mb-10 max-w-[240px] leading-relaxed">Ad-hoc entry curation. Search and add specific units to the active session.</p>
          <button
            onClick={onManualNoteClick}
            className="bg-on-surface text-white px-8 py-4 rounded-2xl font-black text-sm hover:bg-primary transition-all shadow-xl shadow-on-surface/20 w-full justify-center flex items-center gap-3 uppercase tracking-widest active:scale-95"
          >
            <Plus size={20} />
            Create Manifest
          </button>
        </motion.div>

        {/* Suppliers Card */}
        <motion.div
          whileHover={{ y: -5 }}
          className="bg-surface-container-lowest p-10 rounded-[3rem] border border-on-surface/[0.03] shadow-xl shadow-on-surface/[0.02] flex flex-col items-center text-center group relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-500 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
          <div className="w-24 h-24 rounded-[2rem] bg-amber-500/10 text-amber-600 flex items-center justify-center mb-8 group-hover:bg-amber-500 group-hover:text-white transition-all transform group-hover:rotate-12 shadow-inner">
            <Users size={48} />
          </div>
          <h3 className="text-2xl font-black text-on-surface mb-3 tracking-tight">Suppliers Lab</h3>
          <p className="text-sm text-on-surface/40 mb-8 max-w-[240px] leading-relaxed">Configure the dictionary to synchronize external identifiers with internal SKU.</p>
          <div className="w-full flex flex-col gap-3">
            <button
              onClick={onSuppliersClick}
              className="bg-amber-600 text-white px-8 py-4 rounded-2xl font-black text-sm hover:bg-on-surface transition-all shadow-xl shadow-amber-600/20 w-full justify-center flex items-center gap-3 uppercase tracking-widest active:scale-95"
            >
              <BookText size={20} />
              Open Dictionary
            </button>
            <button
              onClick={openSupplierPicker}
              className="border-2 border-amber-500/40 text-amber-600 px-8 py-4 rounded-2xl font-black text-sm hover:bg-amber-500/10 transition-all w-full justify-center flex items-center gap-3 uppercase tracking-widest active:scale-95"
            >
              <Users size={20} />
              Gerenciar Fornecedores
            </button>
          </div>
        </motion.div>
      </div>

      {/* ── Revisões / Aprovados Section ──────────────────────────────────── */}
      <div className="space-y-6">

        {/* Section header with dropdown */}
        <div className="flex items-center gap-3">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowSectionDropdown(v => !v)}
              className="flex items-center gap-2 text-lg font-black text-on-surface uppercase tracking-[0.1em] hover:text-primary transition-colors"
            >
              {sectionLabel}
              <ChevronDown
                size={18}
                className={cn('transition-transform duration-200 mt-0.5', showSectionDropdown && 'rotate-180')}
              />
            </button>

            <AnimatePresence>
              {showSectionDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full mt-2 w-48 bg-surface-container-lowest border border-on-surface/[0.06] rounded-2xl shadow-xl z-30 overflow-hidden"
                >
                  {([
                    { key: 'revisoes',  label: 'Revisões',  count: pendingNotes.length },
                    { key: 'aprovados', label: 'Aprovados', count: approvedNotes.length },
                  ] as const).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => { setActiveSection(opt.key); setShowSectionDropdown(false); }}
                      className={cn(
                        'flex items-center justify-between w-full px-4 py-3 text-sm font-bold transition-colors text-left',
                        activeSection === opt.key
                          ? 'bg-primary/10 text-primary'
                          : 'text-on-surface hover:bg-on-surface/5'
                      )}
                    >
                      <span>{opt.label}</span>
                      {opt.count > 0 && (
                        <span className={cn(
                          'text-[10px] font-black px-2 py-0.5 rounded-full',
                          activeSection === opt.key
                            ? 'bg-primary/20 text-primary'
                            : 'bg-on-surface/10 text-on-surface/50'
                        )}>
                          {opt.count}
                        </span>
                      )}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {visibleNotes.length > 0 && (
            <span className={cn(
              'px-2.5 py-0.5 text-xs font-black rounded-full',
              activeSection === 'revisoes'
                ? 'bg-primary/10 text-primary'
                : 'bg-emerald-500/10 text-emerald-600'
            )}>
              {visibleNotes.length}
            </span>
          )}
        </div>

        {/* Notes grid */}
        {visibleNotes.length === 0 ? (
          <div className="bg-surface-container-low/50 backdrop-blur-md rounded-[2.5rem] p-10 border border-on-surface/[0.03] flex items-center gap-8 shadow-sm">
            <div className="w-16 h-16 bg-on-surface/5 text-on-surface/20 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
              <ClipboardList size={32} />
            </div>
            <div>
              <h4 className="text-lg font-black text-on-surface leading-tight uppercase tracking-[0.1em]">
                {activeSection === 'revisoes' ? 'Sem Notas para Revisão' : 'Nenhuma Nota Aprovada'}
              </h4>
              <p className="text-sm text-on-surface/40 font-medium mt-1 leading-relaxed">
                {activeSection === 'revisoes'
                  ? 'Notas importadas e enviadas para aprovação aparecerão aqui.'
                  : 'Notas aprovadas serão listadas aqui após a confirmação.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleNotes.map((note) => (
              <div
                key={note.id}
                className="relative bg-surface-container-lowest rounded-3xl p-6 border border-on-surface/[0.03] shadow-md hover:shadow-lg transition-shadow flex flex-col gap-4"
              >
                {/* View button */}
                <button
                  onClick={() => onViewReviewNote(note)}
                  title="Ver nota digitalizada"
                  className="absolute top-4 right-4 w-9 h-9 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all flex items-center justify-center shadow-sm"
                >
                  <Pencil size={15} />
                </button>

                {/* Note info */}
                <div className="flex items-start gap-3 pr-10">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                    note.approved
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : 'bg-amber-500/10 text-amber-600'
                  )}>
                    {note.approved ? <CheckCircle2 size={20} /> : <FileText size={20} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-on-surface truncate">{note.fileName}</p>
                    <p className="text-xs text-on-surface/40 font-medium mt-0.5">{note.timestamp}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                        {note.verifiedCount} verificados
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-on-surface/5 text-on-surface/50 rounded-full">
                        {note.itemCount} total
                      </span>
                    </div>
                  </div>
                </div>

                {/* Approve button (only in revisoes section) */}
                {activeSection === 'revisoes' && (
                  <button
                    onClick={() => setConfirmApproveId(note.id)}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl bg-emerald-500/10 text-emerald-700 text-xs font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all active:scale-95"
                  >
                    <CheckCircle2 size={14} />
                    Aprovar
                  </button>
                )}

                {/* Approved badge */}
                {activeSection === 'aprovados' && (
                  <div className="flex items-center justify-center gap-2 w-full py-2 rounded-2xl bg-emerald-500/10 text-emerald-700 text-xs font-black uppercase tracking-widest">
                    <CheckCircle2 size={14} />
                    Aprovado
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Confirm Approve Dialog ─────────────────────────────────────────── */}
      <AnimatePresence>
        {confirmNote && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-on-surface/60 backdrop-blur-md"
              onClick={() => setConfirmApproveId(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16 }}
              className="relative bg-surface-container-lowest rounded-[2rem] p-8 max-w-sm w-full shadow-2xl ring-1 ring-on-surface/5"
            >
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <AlertTriangle size={28} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-on-surface tracking-tight">Aprovar esta nota?</h3>
                  <p className="text-sm text-on-surface/50 font-medium mt-1 leading-relaxed">
                    <span className="font-bold text-on-surface">{confirmNote.fileName}</span> será movida para
                    a seção <span className="font-bold text-emerald-600">Aprovados</span>. Essa ação não pode ser desfeita.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-7">
                <button
                  onClick={() => setConfirmApproveId(null)}
                  className="flex-1 py-3 rounded-2xl font-black text-on-surface/40 hover:bg-on-surface/5 transition-all text-sm uppercase tracking-widest"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    onApproveNote(confirmNote.id);
                    setConfirmApproveId(null);
                  }}
                  className="flex-[2] py-3 rounded-2xl bg-emerald-500 text-white font-black text-sm uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={16} />
                  Confirmar Aprovação
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Supplier Picker Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showSupplierPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowSupplierPicker(false)}
              className="absolute inset-0 bg-on-surface/50 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative bg-surface-container-lowest rounded-3xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[80vh]"
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-on-surface/[0.06] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                    <Users size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-on-surface leading-none">Fornecedores</h2>
                    <p className="text-xs text-on-surface/40 font-medium mt-0.5">{pickerSuppliers.length} cadastrado{pickerSuppliers.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <button onClick={() => setShowSupplierPicker(false)}
                  className="p-2 hover:bg-on-surface/5 rounded-xl transition-colors">
                  <X size={18} className="text-on-surface/40" />
                </button>
              </div>

              {/* Search + Add */}
              <div className="px-5 pt-4 pb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/30 pointer-events-none" />
                    <input
                      type="text"
                      value={supplierSearch}
                      onChange={e => setSupplierSearch(e.target.value)}
                      placeholder="Buscar fornecedor..."
                      className="w-full bg-surface-container border border-on-surface/[0.06] rounded-xl pl-9 pr-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 text-on-surface placeholder:text-on-surface/30"
                      autoFocus
                    />
                  </div>
                  <button
                    onClick={() => { setEditingSupplier(null); setShowAddSupplier(true); }}
                    className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center hover:bg-amber-600 transition-colors shrink-0 shadow-lg shadow-amber-500/20"
                    title="Cadastrar novo fornecedor"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-1.5">
                {loadingPicker ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="w-5 h-5 rounded-full border-2 border-amber-500 border-r-transparent animate-spin" />
                  </div>
                ) : filteredSuppliers.length === 0 ? (
                  <p className="text-sm text-on-surface/30 text-center py-10">
                    {supplierSearch ? 'Nenhum fornecedor encontrado.' : 'Nenhum fornecedor cadastrado.'}
                  </p>
                ) : filteredSuppliers.map(s => {
                  const displayName = s.nome_fantasia || s.name;
                  const subtitle = s.razao_social && s.razao_social !== displayName ? s.razao_social : null;
                  return (
                    <div key={s.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-on-surface/[0.06] bg-surface-container/50 hover:border-amber-500/20 hover:bg-amber-500/5 transition-all group">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                        <Building2 size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-on-surface truncate group-hover:text-amber-700 transition-colors">{displayName}</p>
                        {subtitle && <p className="text-[10px] text-on-surface/40 truncate">{subtitle}</p>}
                        {s.documento && <p className="text-[10px] text-on-surface/30 font-mono">{s.documento}</p>}
                      </div>
                      <button
                        onClick={() => { setEditingSupplier(s); setShowAddSupplier(true); }}
                        className="w-8 h-8 rounded-lg text-on-surface/20 hover:text-amber-600 hover:bg-amber-500/10 flex items-center justify-center transition-all shrink-0"
                        title="Editar fornecedor"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AddSupplierModal
        isOpen={showAddSupplier}
        onClose={() => { setShowAddSupplier(false); setEditingSupplier(null); }}
        editingSupplier={editingSupplier}
        onSuccess={() => { fetchPickerSuppliers(); }}
      />
    </div>
  );
}
