'use client';

import { useCallback, useEffect, useState } from 'react';
import { Package, Plus, Edit2, Barcode } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { MotherProductModal, type MotherPackage } from './MotherProductModal';

interface Supplier {
  id: string;
  name?: string;
  nome_fantasia?: string;
}

interface MotherProductsTabProps {
  childProductId: string | null;
  childProductName: string;
}

export function MotherProductsTab({ childProductId, childProductName }: MotherProductsTabProps) {
  const [packages, setPackages] = useState<MotherPackage[]>([]);
  const [extraEanCounts, setExtraEanCounts] = useState<Record<string, number>>({});
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState<MotherPackage | null>(null);

  const fetchPackages = useCallback(async () => {
    if (!childProductId) return;
    setLoading(true);
    const { data } = await supabase
      .from('product_mother_packages')
      .select('*, suppliers(name, nome_fantasia)')
      .eq('child_product_id', childProductId)
      .order('created_at', { ascending: true });
    const list = (data || []) as MotherPackage[];
    setPackages(list);

    if (list.length > 0) {
      const { data: eanRows } = await supabase
        .from('product_mother_package_ean_codes')
        .select('mother_package_id')
        .in('mother_package_id', list.map(p => p.id));
      const counts: Record<string, number> = {};
      (eanRows || []).forEach((r: any) => { counts[r.mother_package_id] = (counts[r.mother_package_id] || 0) + 1; });
      setExtraEanCounts(counts);
    } else {
      setExtraEanCounts({});
    }
    setLoading(false);
  }, [childProductId]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  useEffect(() => {
    supabase.from('suppliers').select('id, name, nome_fantasia').then(({ data }) => setSuppliers((data || []) as Supplier[]));
  }, []);

  function openCreate() {
    setEditingPackage(null);
    setShowModal(true);
  }

  function openEdit(pkg: MotherPackage) {
    setEditingPackage(pkg);
    setShowModal(true);
  }

  if (!childProductId) {
    return (
      <div className="bg-surface border border-black/[0.07] dark:border-white/[0.06] rounded-2xl p-6 text-center">
        <Package size={22} className="mx-auto text-secondary/30 mb-2" />
        <p className="text-xs font-bold text-secondary/60">Salve o produto primeiro para cadastrar os Produtos Mãe (embalagens) vinculados a ele.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.07] dark:border-white/[0.06] rounded-xl px-4 py-3">
        <p className="text-[11.5px] font-semibold text-secondary/75 leading-relaxed">
          Cadastre aqui as embalagens (caixas, fardos, pacotes) em que este produto costuma chegar do fornecedor. Ao identificar o código de barras da embalagem numa nota, o sistema converte automaticamente para as unidades deste produto.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {packages.map(pkg => (
          <div key={pkg.id} className="bg-surface border border-black/[0.11] dark:border-white/[0.08] shadow-sm rounded-2xl p-3.5 flex flex-col gap-2.5 relative">
            {(pkg.suppliers?.nome_fantasia || pkg.suppliers?.name) && (
              <span className="absolute top-2.5 right-2.5 text-[8.5px] font-extrabold uppercase tracking-wide text-secondary/50 bg-black/[0.05] dark:bg-white/[0.06] rounded-md px-1.5 py-0.5">
                {pkg.suppliers.nome_fantasia || pkg.suppliers.name}
              </span>
            )}
            <div className="w-full h-[88px] rounded-xl bg-surface-container border border-black/[0.07] dark:border-white/[0.06] flex items-center justify-center text-secondary/20">
              <Package size={26} strokeWidth={1.6} />
            </div>
            <p className="text-[13px] font-extrabold text-on-surface leading-tight">{pkg.name}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {pkg.ean && (
                <span className="flex items-center gap-1 bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.06] rounded-lg px-2 py-[3px] text-[9.5px] font-bold text-secondary/50 font-mono">
                  <Barcode size={10} className="text-primary/70" />{pkg.ean}
                </span>
              )}
              {!!extraEanCounts[pkg.id] && (
                <span className="bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.06] rounded-lg px-2 py-[3px] text-[9.5px] font-bold text-secondary/50 font-mono">
                  +{extraEanCounts[pkg.id]} EAN
                </span>
              )}
            </div>
            <div className="flex items-center justify-between pt-2 mt-0.5 border-t border-dashed border-black/[0.10] dark:border-white/[0.08]">
              <span className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-full px-2.5 py-1 text-[10.5px] font-black">
                1 emb. = {pkg.units_per_child} un
              </span>
              <button
                onClick={() => openEdit(pkg)}
                className="w-[26px] h-[26px] rounded-[9px] bg-black/[0.06] dark:bg-white/[0.07] flex items-center justify-center text-secondary/60 hover:bg-primary hover:text-white transition-colors"
                title="Editar Produto Mãe"
              >
                <Edit2 size={12} />
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={openCreate}
          className="border-2 border-dashed border-black/[0.15] dark:border-white/[0.15] rounded-2xl min-h-[190px] flex flex-col items-center justify-center gap-2 text-secondary/40 hover:border-primary/40 hover:text-primary transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <Plus size={18} />
          </div>
          <span className="text-[11px] font-extrabold uppercase tracking-wide">Novo Produto Mãe</span>
        </button>
      </div>

      {!loading && packages.length === 0 && (
        <p className="text-center text-[10.5px] font-bold text-secondary/40 uppercase tracking-wide">Nenhum Produto Mãe cadastrado ainda</p>
      )}

      <MotherProductModal
        open={showModal}
        onClose={() => setShowModal(false)}
        childProductId={childProductId}
        childProductName={childProductName}
        editingPackage={editingPackage}
        suppliers={suppliers}
        onSaved={fetchPackages}
      />
    </div>
  );
}
