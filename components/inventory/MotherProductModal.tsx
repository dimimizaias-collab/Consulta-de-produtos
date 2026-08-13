'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X, Package, Link as LinkIcon, Info, Image as ImageIcon } from 'lucide-react';
import { cn, getDirectImageUrl } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { EanCodesEditor, type EanCodeEntry } from '@/components/shared/EanCodesEditor';

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

export function MotherProductModal({ open, onClose, childProductId, childProductName, editingPackage, suppliers, onSaved }: MotherProductModalProps) {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [ean, setEan] = useState('');
  const [extraEans, setExtraEans] = useState<EanCodeEntry[]>([]);
  const [unitsPerChild, setUnitsPerChild] = useState(1);
  const [supplierId, setSupplierId] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [image, setImage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (editingPackage) {
      setSku(editingPackage.sku || '');
      setName(editingPackage.name || '');
      setEan(editingPackage.ean || '');
      setUnitsPerChild(editingPackage.units_per_child || 1);
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
      setSku(''); setName(''); setEan(''); setExtraEans([]);
      setUnitsPerChild(1); setSupplierId(''); setLocation(''); setCategory(''); setSubcategory(''); setImage('');
    }
    setError('');
  }, [open, editingPackage]);

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
    setSaving(true);
    setError('');
    try {
      const payload = {
        child_product_id: childProductId,
        supplier_id: supplierId || null,
        sku: sku.trim() || null,
        name: name.trim(),
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
          .eq('unit_name', name.trim())
          .maybeSingle();
        if (existingUnit) {
          await supabase.from('supplier_units').update({ multiplier: unitsPerChild || 1 }).eq('id', existingUnit.id);
        } else {
          await supabase.from('supplier_units').insert({
            product_id: childProductId,
            supplier_id: supplierId,
            unit_name: name.trim(),
            multiplier: unitsPerChild || 1,
          });
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

  // Renderizado via portal, fora da árvore do <form> da modal Editar/Adicionar Produto —
  // sem isso, Enter num campo de texto aqui dentro submete o formulário do produto (pai)
  // em vez de não fazer nada, fechando a modal de Editar Produto por engano.
  return createPortal(
    <AnimatePresence>
      {open && (
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
                  {editingPackage ? 'Editar Produto Mãe' : 'Novo Produto Mãe'}
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
                    <label className={labelCls}>SKU (opcional)</label>
                    <input type="text" value={sku} onChange={e => setSku(e.target.value)} className={inputCls} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelCls}>Nome da Embalagem</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="Ex: Caixa Fechada 24un" />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className={labelCls}>Código EAN Principal</label>
                    <div className="flex gap-2">
                      <input type="text" value={ean} onChange={e => setEan(e.target.value)} className={cn(inputCls, 'flex-1 min-w-0')} placeholder="Código de barras da caixa..." />
                      <EanCodesEditor entries={extraEans} onChange={setExtraEans} />
                    </div>
                    <p className="text-[10px] font-medium text-secondary/60">Use os EANs extras se o fabricante já trocou o código de barras da caixa alguma vez.</p>
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
                      value={unitsPerChild}
                      onChange={e => setUnitsPerChild(parseInt(e.target.value || '1') || 1)}
                      className={inputCls}
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
      )}
    </AnimatePresence>,
    document.body
  );
}
