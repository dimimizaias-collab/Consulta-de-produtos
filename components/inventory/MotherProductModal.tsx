'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X, Package, Link as LinkIcon, Info, Image as ImageIcon, Keyboard, Delete } from 'lucide-react';
import { cn, getDirectImageUrl } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { EanCodesEditor, type EanCodeEntry } from '@/components/shared/EanCodesEditor';
import { useViewMode } from '@/lib/view-mode';

export interface MotherPackage {
  id: string;
  child_product_id: string;
  supplier_id: string | null;
  sku: string | null;
  name: string;
  ean: string | null;
  image: string | null;
  location: string | null;
  category: string | null;
  subcategory: string | null;
  units_per_child: number;
  suppliers?: { nome_fantasia?: string; name?: string } | null;
}

interface Supplier {
  id: string;
  name?: string;
  nome_fantasia?: string;
}

interface MotherProductModalProps {
  open: boolean;
  onClose: () => void;
  childProductId: string;
  childProductName: string;
  editingPackage: MotherPackage | null;
  suppliers: Supplier[];
  onSaved: () => void;
}

const sectionCls = 'bg-surface border border-black/[0.07] dark:border-white/[0.06] shadow-sm rounded-2xl p-5 space-y-4';
const sectionHeadCls = 'flex items-center gap-2';
const sectionTitleCls = 'text-xs font-extrabold uppercase tracking-wide text-on-surface';
const fieldGridCls = 'grid grid-cols-1 md:grid-cols-2 gap-3.5';
const labelCls = 'text-[10px] font-extrabold uppercase tracking-wide text-secondary/80';
const inputCls = 'w-full bg-black/[0.035] dark:bg-white/[0.05] border border-black/[0.10] dark:border-white/[0.10] rounded-xl px-3.5 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all';

// Mobile fullscreen — mesmos tokens de card/linha usados na aba "Dados" da janela
// "Editar Produto" (app/page.tsx), pra manter consistência entre as duas telas.
const mCardCls = 'bg-white dark:bg-[#252520] border border-black/[0.10] dark:border-white/[0.07] rounded-2xl overflow-hidden shadow-sm';
const mSectionLabelCls = 'flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mx-1 mb-2';
const mFieldRowCls = 'px-3.5 py-3 border-b border-black/[0.06] dark:border-white/[0.06] last:border-b-0';
const mFieldLabelCls = 'block text-[9.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-1.5';

// Teclado virtual de texto (Sufixo) — mesmo padrão do teclado usado em MobileNoteView.tsx /
// MobileBulkTable.tsx, ancorado no rodapé da tela (só existe na versão fullscreen mobile).
const SUFFIX_KBD: Record<string, string[][]> = {
  abc: [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['SHIFT','z','x','c','v','b','n','m','⌫'],
    ['123','SPACE','↵'],
  ],
  '123': [
    ['1','2','3','4','5','6','7','8','9','0'],
    ['-','/',':', ';','(',')', '$','&','@','"'],
    ['#+=','.',',','?','!','\'','⌫'],
    ['ABC','SPACE','↵'],
  ],
  '#+=': [
    ['[',']','{','}','#','%','^','*','+','='],
    ['_','\\','|','~','<','>','€','£','¥','•'],
    ['123','.',',','?','!','\'','⌫'],
    ['ABC','SPACE','↵'],
  ],
};

const UNITS_KEYS = ['1','2','3','4','5','6','7','8','9','CLEAR','0','BACK'];

export function MotherProductModal({ open, onClose, childProductId, childProductName, editingPackage, suppliers, onSaved }: MotherProductModalProps) {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [suffix, setSuffix] = useState('');
  const [ean, setEan] = useState('');
  const [extraEans, setExtraEans] = useState<EanCodeEntry[]>([]);
  const [unitsPerChild, setUnitsPerChild] = useState<number | ''>('');
  const [supplierId, setSupplierId] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [image, setImage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { isMobileView } = useViewMode();
  const [showUnitsKbd, setShowUnitsKbd] = useState(false);
  const [showSuffixKbd, setShowSuffixKbd] = useState(false);
  const [suffixKbdMode, setSuffixKbdMode] = useState<'abc' | '123' | '#+='>('abc');
  const [suffixKbdShift, setSuffixKbdShift] = useState(true);

  function closeKeyboards() {
    setShowUnitsKbd(false);
    setShowSuffixKbd(false);
    setSuffixKbdMode('abc');
    setSuffixKbdShift(true);
  }

  function handleUnitsKey(key: string) {
    const cur = unitsPerChild === '' ? '' : String(unitsPerChild);
    if (key === 'BACK') {
      const next = cur.slice(0, -1);
      setUnitsPerChild(next === '' ? '' : parseInt(next) || '');
      return;
    }
    if (key === 'CLEAR') { setUnitsPerChild(''); return; }
    const next = cur + key;
    setUnitsPerChild(parseInt(next) || '');
  }

  function handleSuffixKey(key: string) {
    if (key === '⌫') { setSuffix(v => v.slice(0, -1)); return; }
    if (key === 'SHIFT') { setSuffixKbdShift(v => !v); return; }
    if (key === 'SPACE') { setSuffix(v => v + ' '); return; }
    if (key === '↵') { setShowSuffixKbd(false); return; }
    if (key === '123') { setSuffixKbdMode('123'); return; }
    if (key === 'ABC') { setSuffixKbdMode('abc'); return; }
    if (key === '#+=') { setSuffixKbdMode('#+='); return; }
    const char = suffixKbdMode === 'abc' ? (suffixKbdShift ? key.toUpperCase() : key) : key;
    setSuffix(v => v + char);
    if (suffixKbdMode === 'abc' && suffixKbdShift) setSuffixKbdShift(false);
  }

  useEffect(() => {
    if (!open) return;
    closeKeyboards();
    if (editingPackage) {
      setSku(editingPackage.sku || '');
      setName(editingPackage.name || '');
      setSuffix('');
      setEan(editingPackage.ean || '');
      setUnitsPerChild(editingPackage.units_per_child || '');
      setSupplierId(editingPackage.supplier_id || '');
      setLocation(editingPackage.location || '');
      setCategory(editingPackage.category || '');
      setSubcategory(editingPackage.subcategory || '');
      setImage(editingPackage.image || '');
      supabase
        .from('product_mother_package_ean_codes')
        .select('ean, description')
        .eq('mother_package_id', editingPackage.id)
        .then(({ data }) => setExtraEans((data || []) as EanCodeEntry[]));
    } else {
      setSku(''); setName(childProductName || ''); setSuffix(''); setEan(''); setExtraEans([]);
      setUnitsPerChild(''); setSupplierId(''); setLocation(''); setCategory(''); setSubcategory(''); setImage('');
    }
    setError('');
  }, [open, editingPackage, childProductName]);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Selecione apenas arquivos de imagem (JPG, PNG, etc).');
      if (e.target) e.target.value = '';
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details ? `${errorData.error}: ${errorData.details}` : (errorData.error || 'Falha no upload'));
      }
      const data = await response.json();
      setImage(data.url);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar imagem.');
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  }

  async function handleSave() {
    if (!name.trim()) { setError('Informe o nome da embalagem.'); return; }
    if (!unitsPerChild || unitsPerChild <= 0) { setError('Informe as unidades por embalagem.'); return; }
    const finalName = suffix.trim() ? `${name.trim()} ${suffix.trim()}` : name.trim();
    setSaving(true);
    setError('');
    try {
      const payload = {
        child_product_id: childProductId,
        supplier_id: supplierId || null,
        sku: sku.trim() || null,
        name: finalName,
        ean: ean.trim() || null,
        location: location.trim() || null,
        category: category.trim() || null,
        subcategory: subcategory.trim() || null,
        image: image.trim() || null,
        units_per_child: unitsPerChild || 1,
        updated_at: new Date().toISOString(),
      };

      let motherPackageId = editingPackage?.id;
      if (motherPackageId) {
        const { error: updErr } = await supabase.from('product_mother_packages').update(payload).eq('id', motherPackageId);
        if (updErr) throw updErr;
      } else {
        const { data, error: insErr } = await supabase.from('product_mother_packages').insert(payload).select('id').single();
        if (insErr) throw insErr;
        motherPackageId = data.id;
      }

      // Sincroniza EANs extras (multi-código, ex: fabricante trocou o código de barras da caixa)
      await supabase.from('product_mother_package_ean_codes').delete().eq('mother_package_id', motherPackageId);
      const validExtraEans = extraEans.filter(e => e.ean.trim());
      if (validExtraEans.length > 0) {
        await supabase.from('product_mother_package_ean_codes').insert(
          validExtraEans.map(e => ({ mother_package_id: motherPackageId, ean: e.ean.trim(), description: e.description || null }))
        );
      }

      // Sincroniza com supplier_units — mesmo motor de conversão de quantidade usado no import de notas.
      if (supplierId) {
        const { data: existingUnit } = await supabase
          .from('supplier_units')
          .select('id')
          .eq('product_id', childProductId)
          .eq('supplier_id', supplierId)
          .eq('unit_name', finalName)
          .maybeSingle();
        if (existingUnit) {
          await supabase.from('supplier_units').update({ multiplier: unitsPerChild || 1 }).eq('id', existingUnit.id);
        } else {
          await supabase.from('supplier_units').insert({
            product_id: childProductId,
            supplier_id: supplierId,
            unit_name: finalName,
            multiplier: unitsPerChild || 1,
          });
        }
      }

      // Auto-redireciona a tradução do Dicionário para este Produto Mãe — só quando for
      // inequívoco (exatamente 1 mapeamento desse fornecedor para este produto). Havendo mais
      // de um (ex: caixa e unidade avulsa cadastradas separadamente), não mexe sozinho — fica
      // como sugestão manual na aba "Produtos Mãe" do Dicionário, pra evitar redirecionar a
      // tradução errada.
      if (supplierId) {
        const { data: candidateMappings } = await supabase
          .from('supplier_mappings')
          .select('id')
          .eq('supplier_id', supplierId)
          .eq('internal_product_id', childProductId);
        if (candidateMappings && candidateMappings.length === 1) {
          await supabase
            .from('supplier_mappings')
            .update({ mother_package_id: motherPackageId, internal_product_id: null })
            .eq('id', candidateMappings[0].id);
        }
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar Produto Mãe.');
    } finally {
      setSaving(false);
    }
  }

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  const modalTitle = editingPackage ? 'Editar Produto Mãe' : 'Novo Produto Mãe';

  const suffixKeyboard = (
    <AnimatePresence>
      {showSuffixKbd && (
        <motion.div
          key="suffix-keyboard"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          className="absolute bottom-0 left-0 right-0 z-50 bg-[#CDD0D6] dark:bg-[#1C1C1E] select-none"
        >
          <div className="flex items-center justify-between px-3.5 pt-2.5 pb-1.5">
            <p className="text-[9px] font-black text-[#1A1A0E]/45 dark:text-white/40 uppercase tracking-wider">Sufixo</p>
            <button
              type="button"
              onClick={() => setShowSuffixKbd(false)}
              className="w-[26px] h-[26px] flex items-center justify-center rounded-full bg-black/[0.09] dark:bg-white/[0.08] text-[#1A1A0E]/55 dark:text-white/55"
            >
              <X size={12} />
            </button>
          </div>
          <div className="pt-1 pb-2 px-0.5 space-y-[6px]">
            {SUFFIX_KBD[suffixKbdMode].map((row, ri) => (
              <div key={ri} className={cn('flex gap-[6px] justify-center', ri === 1 ? 'px-[18px]' : 'px-0.5')}>
                {row.map(key => {
                  const isShiftKey = key === 'SHIFT';
                  const isDelete = key === '⌫';
                  const isSpace = key === 'SPACE';
                  const isModeKey = ['123', 'ABC', '#+='].includes(key);
                  const isReturn = key === '↵';
                  const isSpecial = isShiftKey || isDelete || isSpace || isModeKey || isReturn;
                  const displayKey = suffixKbdMode === 'abc' && !isSpecial
                    ? (suffixKbdShift ? key.toUpperCase() : key)
                    : key;
                  return (
                    <motion.button
                      key={key + ri}
                      type="button"
                      onPointerDown={e => { e.preventDefault(); handleSuffixKey(key); }}
                      whileTap={{ scale: isSpecial ? 0.88 : 0.82 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                      className={cn(
                        'h-[42px] rounded-[9px] flex items-center justify-center',
                        'shadow-[0_1px_0_rgba(0,0,0,0.28)] dark:shadow-[0_1px_0_rgba(0,0,0,0.55)]',
                        isSpace ? 'flex-1 text-sm font-medium' :
                        isModeKey ? 'w-10 text-[10px] font-bold' :
                        isReturn ? 'w-10 text-sm' :
                        (isShiftKey || isDelete) ? 'w-10' : 'flex-1 text-[16px] font-normal',
                        (isShiftKey && suffixKbdShift)
                          ? 'bg-primary text-white'
                          : isReturn
                            ? 'bg-primary text-white'
                            : isSpecial
                              ? 'bg-[#AEB3BB] dark:bg-[#2E2E2E] text-[#1A1A0E] dark:text-[#F2F0E3]'
                              : 'bg-white dark:bg-[#3D3D3D] text-[#1A1A0E] dark:text-[#F2F0E3]',
                      )}
                    >
                      {isShiftKey
                        ? <span className={cn('text-lg leading-none', suffixKbdShift ? 'font-black' : 'font-light')}>⇧</span>
                        : isDelete ? <Delete size={14} />
                        : isSpace ? 'espaço'
                        : isReturn ? '↵'
                        : displayKey
                      }
                    </motion.button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="h-[26px] bg-[#FFE500] dark:bg-[#252520] border-t border-[#D4C000] dark:border-white/[0.07]" />
        </motion.div>
      )}
    </AnimatePresence>
  );

  const unitsKeyboard = (
    <AnimatePresence>
      {showUnitsKbd && (
        <motion.div
          key="units-keyboard"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          className="absolute bottom-0 left-0 right-0 z-50 bg-[#CDD0D6] dark:bg-[#1C1C1E] select-none"
        >
          <div className="flex items-center justify-between px-3.5 pt-2.5 pb-1.5">
            <p className="text-[9px] font-black text-[#1A1A0E]/45 dark:text-white/40 uppercase tracking-wider">Unidades por Embalagem</p>
            <button
              type="button"
              onClick={() => setShowUnitsKbd(false)}
              className="w-[26px] h-[26px] flex items-center justify-center rounded-full bg-black/[0.09] dark:bg-white/[0.08] text-[#1A1A0E]/55 dark:text-white/55"
            >
              <X size={12} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 px-3.5 pt-1 pb-2">
            {UNITS_KEYS.map(key => (
              <motion.button
                key={key}
                type="button"
                onPointerDown={e => { e.preventDefault(); handleUnitsKey(key); }}
                whileTap={{ scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                className={cn(
                  'h-[50px] rounded-xl flex items-center justify-center font-[\'DM_Mono\',monospace] text-lg font-bold',
                  'shadow-[0_1px_0_rgba(0,0,0,0.25)] dark:shadow-[0_1px_0_rgba(0,0,0,0.5)]',
                  key === 'CLEAR'
                    ? 'bg-red-500/15 text-red-600 dark:text-red-400 font-sans text-[11px] font-extrabold uppercase tracking-wide'
                    : key === 'BACK'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                      : 'bg-white dark:bg-[#3D3D3D] text-[#1A1A0E] dark:text-[#F2F0E3]'
                )}
              >
                {key === 'BACK' ? <Delete size={18} /> : key === 'CLEAR' ? 'Limpar' : key}
              </motion.button>
            ))}
          </div>
          <div className="h-[22px] bg-[#FFE500] dark:bg-[#252520] border-t border-[#D4C000] dark:border-white/[0.07]" />
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Renderizado via portal, fora da árvore do <form> da modal Editar/Adicionar Produto —
  // sem isso, Enter num campo de texto aqui dentro submete o formulário do produto (pai)
  // em vez de não fazer nada, fechando a modal de Editar Produto por engano.
  return createPortal(
    <AnimatePresence>
      {open && (
        isMobileView ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[220] flex flex-col bg-[#EFE8D4] dark:bg-[#1E1E18]"
          >
            {/* Header — tela cheia estilo iOS, igual ao padrão de Editar Produto */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3.5 border-b border-black/[0.09] dark:border-white/[0.07]">
              <div className="flex-1 min-w-0">
                <h2 className="text-[15px] font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3] tracking-tight truncate">{modalTitle}</h2>
                <p className="text-[10.5px] font-bold text-secondary/55 truncate">Embalagem vinculada a &quot;{childProductName}&quot;</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-[38px] h-[38px] rounded-full flex items-center justify-center shrink-0 bg-black/[0.06] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.08] text-[#1A1A0E] dark:text-[#F2F0E3] active:scale-95 transition-transform"
              >
                <X size={17} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-6 space-y-5">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm font-bold">
                  {error}
                </div>
              )}

              <div>
                <div className={mSectionLabelCls}><Package size={12} className="text-primary" />Identificação</div>
                <div className={mCardCls}>
                  <div className={mFieldRowCls}>
                    <label className={mFieldLabelCls}>Nome da Embalagem</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="Ex: Papel Higiênico Fofinho" />
                  </div>
                  <div className={mFieldRowCls}>
                    <label className={mFieldLabelCls}>Sufixo (opcional)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode={showSuffixKbd ? 'none' : undefined}
                        value={suffix}
                        onChange={e => setSuffix(e.target.value)}
                        className={cn(inputCls, 'flex-1 min-w-0')}
                        placeholder="Ex: Caixa, Pacote, Fardo..."
                      />
                      <button
                        type="button"
                        onClick={() => { setShowSuffixKbd(v => !v); setShowUnitsKbd(false); setSuffixKbdMode('abc'); }}
                        title="Teclado de texto"
                        className={cn(
                          'w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-all active:scale-95',
                          showSuffixKbd
                            ? 'bg-primary text-white border-primary'
                            : 'bg-black/[0.035] dark:bg-white/[0.05] border-black/[0.10] dark:border-white/[0.10] text-secondary/60'
                        )}
                      >
                        <Keyboard size={18} />
                      </button>
                    </div>
                  </div>
                  <div className={mFieldRowCls}>
                    <label className={mFieldLabelCls}>Código EAN Principal</label>
                    <div className="flex gap-2">
                      <input type="text" value={ean} onChange={e => setEan(e.target.value)} className={cn(inputCls, 'flex-1 min-w-0')} placeholder="Código de barras da caixa..." />
                      <EanCodesEditor entries={extraEans} onChange={setExtraEans} />
                    </div>
                    <p className="text-[10px] font-medium text-secondary/60 mt-1.5">Use os EANs extras se o fabricante já trocou o código de barras da caixa alguma vez.</p>
                  </div>
                  <div className={mFieldRowCls}>
                    <label className={mFieldLabelCls}>SKU (opcional)</label>
                    <input type="text" value={sku} onChange={e => setSku(e.target.value)} className={inputCls} />
                  </div>
                </div>
              </div>

              <div>
                <div className={mSectionLabelCls}><LinkIcon size={12} className="text-primary" />Estoque &amp; Conversão</div>
                <div className={mCardCls}>
                  <div className={mFieldRowCls}>
                    <label className={mFieldLabelCls}>Unidades por Embalagem</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        required
                        min={1}
                        inputMode={showUnitsKbd ? 'none' : undefined}
                        value={unitsPerChild}
                        onChange={e => setUnitsPerChild(e.target.value === '' ? '' : parseInt(e.target.value) || '')}
                        onWheel={e => e.currentTarget.blur()}
                        placeholder="Ex.: 12"
                        className={cn(inputCls, 'flex-1 min-w-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')}
                      />
                      <button
                        type="button"
                        onClick={() => { setShowUnitsKbd(v => !v); setShowSuffixKbd(false); }}
                        title="Teclado numérico"
                        className={cn(
                          'w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 transition-all active:scale-95',
                          showUnitsKbd
                            ? 'bg-primary text-white border-primary'
                            : 'bg-black/[0.035] dark:bg-white/[0.05] border-black/[0.10] dark:border-white/[0.10] text-secondary/60'
                        )}
                      >
                        <Keyboard size={18} />
                      </button>
                    </div>
                  </div>
                  <div className={mFieldRowCls}>
                    <label className={mFieldLabelCls}>Fornecedor (opcional)</label>
                    <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className={cn(inputCls, 'cursor-pointer')}>
                      <option value="">Sem fornecedor específico</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.nome_fantasia || s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className={mFieldRowCls}>
                    <label className={mFieldLabelCls}>Localização (opcional)</label>
                    <input type="text" value={location} onChange={e => setLocation(e.target.value)} className={inputCls} placeholder="Onde as caixas fechadas ficam..." />
                  </div>
                  <div className={mFieldRowCls}>
                    <label className={mFieldLabelCls}>Categoria (opcional)</label>
                    <input type="text" value={category} onChange={e => setCategory(e.target.value)} className={inputCls} />
                  </div>
                  <div className={mFieldRowCls}>
                    <label className={mFieldLabelCls}>Subcategoria (opcional)</label>
                    <input type="text" value={subcategory} onChange={e => setSubcategory(e.target.value)} className={inputCls} />
                  </div>
                </div>
              </div>

              <div>
                <div className={mSectionLabelCls}><ImageIcon size={12} className="text-primary" />Imagem</div>
                <div className={cn(mCardCls, 'p-3.5')}>
                  <div className="flex gap-3 items-center">
                    <div className="w-14 h-14 rounded-xl bg-surface-container border border-black/[0.10] dark:border-white/[0.10] shrink-0 overflow-hidden flex items-center justify-center text-secondary/40">
                      {image ? (
                        <img src={getDirectImageUrl(image) || image} alt={name || 'Produto Mãe'} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon size={20} />
                      )}
                    </div>
                    <div className="flex-1 flex gap-2 min-w-0">
                      <input
                        type="text"
                        value={image}
                        onChange={e => setImage(e.target.value)}
                        className={cn(inputCls, 'flex-1 min-w-0')}
                        placeholder="https://..."
                      />
                      <input
                        type="file"
                        ref={imageInputRef}
                        onChange={handleImageUpload}
                        className="hidden"
                        accept="image/*"
                      />
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        disabled={uploading}
                        className="px-4 rounded-xl text-secondary shrink-0 flex items-center justify-center transition-all bg-black/[0.035] dark:bg-white/[0.05] border border-black/[0.10] dark:border-white/[0.10]"
                        title="Upload do computador"
                      >
                        {uploading ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <ImageIcon size={18} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 bg-black/[0.03] dark:bg-white/[0.04] border border-dashed border-black/[0.14] dark:border-white/[0.14] rounded-xl px-3.5 py-2.5">
                <Info size={14} className="text-secondary/50 shrink-0" />
                <p className="text-[10.5px] font-semibold text-secondary/70 leading-relaxed">
                  Sem Empresa, Preço, Marca ou Detalhes — o Produto Mãe é global (compartilhado entre empresas) e não é vendido diretamente.
                </p>
              </div>
            </div>

            <div className="shrink-0 border-t border-black/[0.09] dark:border-white/[0.07] bg-[#EFE8D4]/95 dark:bg-[#1E1E18]/95 backdrop-blur-xl px-4 py-3.5 flex gap-2.5">
              <button type="button" onClick={onClose} className="flex-[0_0_34%] bg-black/[0.06] dark:bg-white/[0.07] text-secondary font-extrabold text-[11.5px] uppercase tracking-wide py-3.5 rounded-2xl">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-primary text-white font-extrabold text-[12.5px] uppercase tracking-wide py-3.5 rounded-2xl shadow-lg shadow-primary/30 disabled:opacity-50 transition-opacity"
              >
                {saving ? 'Salvando...' : 'Salvar Produto Mãe'}
              </button>
            </div>

            {suffixKeyboard}
            {unitsKeyboard}
          </motion.div>
        ) : (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="relative bg-[#F0E7CC] dark:bg-[#1E1E18] rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-black/10 dark:border-white/[0.08]"
          >
            <div className="px-6 py-5 flex items-center gap-3.5 bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800]">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-black/[0.09] text-[#1A1A0E]">
                <Package size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-manrope font-extrabold text-[#1A1A0E] leading-tight">
                  {modalTitle}
                </h2>
                <p className="text-xs font-bold text-[#1A1A0E]/55 mt-0.5 truncate">Embalagem vinculada a &quot;{childProductName}&quot;</p>
              </div>
              <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-black/[0.08] border border-black/10 text-black/50 hover:bg-black/[0.14] transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm font-bold">
                  {error}
                </div>
              )}

              <div className={sectionCls}>
                <div className={sectionHeadCls}>
                  <Package size={15} className="text-primary shrink-0" />
                  <span className={sectionTitleCls}>Identificação</span>
                </div>
                <div className={fieldGridCls}>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Nome da Embalagem</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="Ex: Papel Higiênico Fofinho" />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Sufixo (opcional)</label>
                    <input type="text" value={suffix} onChange={e => setSuffix(e.target.value)} className={inputCls} placeholder="Ex: Caixa, Pacote, Fardo..." />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Código EAN Principal</label>
                    <div className="flex gap-2">
                      <input type="text" value={ean} onChange={e => setEan(e.target.value)} className={cn(inputCls, 'flex-1 min-w-0')} placeholder="Código de barras da caixa..." />
                      <EanCodesEditor entries={extraEans} onChange={setExtraEans} />
                    </div>
                    <p className="text-[10px] font-medium text-secondary/60">Use os EANs extras se o fabricante já trocou o código de barras da caixa alguma vez.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>SKU (opcional)</label>
                    <input type="text" value={sku} onChange={e => setSku(e.target.value)} className={inputCls} />
                  </div>
                </div>
              </div>

              <div className={sectionCls}>
                <div className={sectionHeadCls}>
                  <LinkIcon size={15} className="text-primary shrink-0" />
                  <span className={sectionTitleCls}>Estoque &amp; Conversão</span>
                </div>
                <div className={fieldGridCls}>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Unidades por Embalagem</label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={unitsPerChild}
                      onChange={e => setUnitsPerChild(e.target.value === '' ? '' : parseInt(e.target.value) || '')}
                      onWheel={e => e.currentTarget.blur()}
                      placeholder="Ex.: 12"
                      className={cn(inputCls, '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Fornecedor (opcional)</label>
                    <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className={cn(inputCls, 'cursor-pointer')}>
                      <option value="">Sem fornecedor específico</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.nome_fantasia || s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Localização (opcional)</label>
                    <input type="text" value={location} onChange={e => setLocation(e.target.value)} className={inputCls} placeholder="Onde as caixas fechadas ficam..." />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Categoria (opcional)</label>
                    <input type="text" value={category} onChange={e => setCategory(e.target.value)} className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Subcategoria (opcional)</label>
                    <input type="text" value={subcategory} onChange={e => setSubcategory(e.target.value)} className={inputCls} />
                  </div>
                </div>
              </div>

              <div className={sectionCls}>
                <div className={sectionHeadCls}>
                  <ImageIcon size={15} className="text-primary shrink-0" />
                  <span className={sectionTitleCls}>Imagem</span>
                </div>
                <div className="flex gap-3 items-center">
                  <div className="w-14 h-14 rounded-xl bg-surface-container border border-black/[0.10] dark:border-white/[0.10] shrink-0 overflow-hidden flex items-center justify-center text-secondary/40">
                    {image ? (
                      <img src={getDirectImageUrl(image) || image} alt={name || 'Produto Mãe'} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon size={20} />
                    )}
                  </div>
                  <div className="flex-1 flex gap-2 min-w-0">
                    <input
                      type="text"
                      value={image}
                      onChange={e => setImage(e.target.value)}
                      className={cn(inputCls, 'flex-1 min-w-0')}
                      placeholder="https://..."
                    />
                    <input
                      type="file"
                      ref={imageInputRef}
                      onChange={handleImageUpload}
                      className="hidden"
                      accept="image/*"
                    />
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={uploading}
                      className="px-4 rounded-xl text-secondary shrink-0 flex items-center justify-center transition-all bg-black/[0.035] dark:bg-white/[0.05] border border-black/[0.10] dark:border-white/[0.10] hover:border-black/20 dark:hover:border-white/20"
                      title="Upload do computador"
                    >
                      {uploading ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <ImageIcon size={18} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 bg-black/[0.03] dark:bg-white/[0.04] border border-dashed border-black/[0.14] dark:border-white/[0.14] rounded-xl px-3.5 py-2.5">
                <Info size={14} className="text-secondary/50 shrink-0" />
                <p className="text-[10.5px] font-semibold text-secondary/70 leading-relaxed">
                  Sem Empresa, Preço, Marca ou Detalhes — o Produto Mãe é global (compartilhado entre empresas) e não é vendido diretamente.
                </p>
              </div>
            </div>

            <div className="px-6 pb-6 pt-2 flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 bg-black/[0.06] dark:bg-white/[0.07] text-secondary font-bold py-3 rounded-xl hover:bg-black/[0.10] dark:hover:bg-white/[0.11] transition-colors">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-primary text-white font-bold py-3 rounded-xl hover:opacity-90 transition-colors shadow-lg shadow-primary/30 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar Produto Mãe'}
              </button>
            </div>
          </motion.div>
        </div>
        )
      )}
    </AnimatePresence>,
    document.body
  );
}
