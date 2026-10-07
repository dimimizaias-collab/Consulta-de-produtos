'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Search, Package, Plus, Check, AlertTriangle, Star, DollarSign, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

// "Vincular ao Dicionário" / "Criar Novo Produto" no padrão quadrado — usado no manifesto de
// distribuição para resolver itens que vieram da nota sem produto do cadastro. Mesmo fluxo do
// modal da nota: buscar → escolher (tradução permanente + preço de venda) → vincular, ou criar
// um produto novo já vinculado. Também vincula a linha da nota de origem, se pedido.

export interface ItemParaVincular {
  /** Descrição do item como veio na nota. */
  descricao: string;
  ean: string | null;
  qtd: number;
  custo: number;
  /** Código do produto no fornecedor (para a tradução permanente). */
  supplierCode: string | null;
  /** Nº da linha na nota (1-based), se conhecida. */
  linhaNota: number | null;
}

export interface ProdutoVinculado { id: string; name: string; sku: string | null; ean: string | null }

interface Props {
  item: ItemParaVincular;
  /** Ex.: "Manifesto · Castelo Real". */
  contexto: string;
  /** Loja cujo preço de venda é informado aqui (loja destino do manifesto). */
  lojaPreco: string;
  pendencia?: { pos: number; total: number; onPular?: () => void };
  supplierId: string | null;
  notaNumero: string | null;
  /** Mostra a opção de vincular também a linha da nota de origem. */
  podeVincularNota: boolean;
  onClose: () => void;
  /** Chamado depois de criar/escolher o produto (a tradução já foi salva aqui, se pedida). */
  onVincular: (p: ProdutoVinculado, precoVenda: number | null, vincularNota: boolean) => Promise<void>;
}

type Hit = ProdutoVinculado & { price: number };

const FIELD = 'h-[34px] w-full px-2.5 bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10] text-[13px] font-semibold text-on-surface outline-none caret-[#D81E1E] hover:border-[#CFC4A2] dark:hover:border-white/[0.20] focus:!border-[#D81E1E] focus:shadow-[0_0_0_2px_rgba(216,30,30,0.12)] placeholder:text-on-surface/25 placeholder:font-medium transition-[border-color,box-shadow]';
const LABEL = 'block text-[9px] font-black uppercase tracking-[0.1em] text-[#1A1A0E]/[0.58] dark:text-[#F2F0E3]/55 pl-px mb-1';
const SEC = 'bg-[#F1EAD3] dark:bg-[#181814] border border-[#E0D8BF] dark:border-white/[0.10]';
const SEC_HEAD = 'h-7 flex items-center gap-2 px-2.5 bg-[#FFEC4D] border-b-[1.5px] border-[#8F7E10]';
const SEC_TITLE = 'text-[9px] font-black uppercase tracking-[0.1em] text-[rgba(26,26,10,0.55)]';
const BTN = 'h-9 px-4 border text-[11.5px] font-extrabold uppercase tracking-[0.04em] whitespace-nowrap active:scale-[0.97] transition-all';
const BTN_GHOST = cn(BTN, 'border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-on-surface hover:bg-on-surface/[0.05]');
const BTN_PRI = cn(BTN, 'border-[#D81E1E] bg-[#D81E1E] hover:bg-[#B91818] text-white flex items-center gap-2 disabled:opacity-50');

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const parsePreco = (s: string): number | null => { const t = s.trim(); if (!t) return null; const n = parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return Number.isFinite(n) ? n : null; };

function Secao({ icon, titulo, children }: { icon: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <div className={SEC}>
      <div className={SEC_HEAD}><span className="text-[#D81E1E] flex">{icon}</span><span className={SEC_TITLE}>{titulo}</span></div>
      <div className="m-2.5 flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

/** Salva a tradução permanente fornecedor → produto (mesma regra da nota). */
async function salvarTraducao(supplierId: string, supplierCode: string | null, descricao: string, productId: string) {
  const norm = (s: string | null | undefined) => (s || '').toLowerCase().trim();
  const { data: rows, error: findErr } = await supabase.from('supplier_mappings')
    .select('id, supplier_sku, supplier_description').eq('supplier_id', supplierId);
  if (findErr) throw new Error(findErr.message);
  const ids = (rows || []).filter((m: { id: string; supplier_sku: string | null; supplier_description: string | null }) =>
    (supplierCode && m.supplier_sku === supplierCode) || (descricao && m.supplier_description && norm(m.supplier_description) === norm(descricao))).map(m => m.id);
  if (ids.length > 0) {
    const { error } = await supabase.from('supplier_mappings').update({ internal_product_id: productId, mother_package_id: null }).in('id', ids);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('supplier_mappings')
      .insert({ supplier_id: supplierId, supplier_description: descricao || null, supplier_sku: supplierCode, internal_product_id: productId });
    if (error) throw new Error(error.message);
  }
}

export function VincularProdutoModal({ item, contexto, lojaPreco, pendencia, supplierId, notaNumero, podeVincularNota, onClose, onVincular }: Props) {
  const [modo, setModo] = useState<'busca' | 'criar'>('busca');
  const [query, setQuery] = useState(() => item.ean || semAcento(item.descricao).toLowerCase());
  const [hits, setHits] = useState<Hit[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sel, setSel] = useState<Hit | null>(null);
  const [preco, setPreco] = useState('');
  const podeTraduzir = !!supplierId && !!(item.supplierCode || item.descricao);
  const [traducao, setTraducao] = useState(podeTraduzir);
  const [vincNota, setVincNota] = useState(podeVincularNota);
  const [novoNome, setNovoNome] = useState(() => semAcento(item.descricao).toLowerCase());
  const [novoSku, setNovoSku] = useState('');
  const [novoEan, setNovoEan] = useState(item.ean || '');
  const [eanDup, setEanDup] = useState<Hit | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // Busca no dicionário (nome, SKU ou EAN, incluindo EANs adicionais)
  useEffect(() => {
    const q = query.trim();
    if (!q) { setHits([]); return; }
    let vivo = true;
    setBuscando(true);
    const t = setTimeout(async () => {
      const like = `%${q.replace(/[%_,]/g, ' ')}%`;
      const [{ data }, { data: extra }] = await Promise.all([
        supabase.from('products').select('id, name, sku, ean, price').or(`name.ilike.${like},sku.ilike.${like},ean.ilike.${like}`).limit(12),
        /^\d{6,14}$/.test(q) ? supabase.from('product_ean_codes').select('product_id').eq('ean', q).limit(5) : Promise.resolve({ data: [] as { product_id: string }[] }),
      ]);
      let lista = (data ?? []) as Hit[];
      const extraIds = (extra ?? []).map(e => e.product_id).filter(id => !lista.some(h => h.id === id));
      if (extraIds.length) {
        const { data: viaExtra } = await supabase.from('products').select('id, name, sku, ean, price').in('id', extraIds);
        lista = [...((viaExtra ?? []) as Hit[]), ...lista];
      }
      if (vivo) { setHits(lista); setBuscando(false); }
    }, 220);
    return () => { vivo = false; clearTimeout(t); };
  }, [query]);

  // EAN do produto novo já cadastrado em outro produto?
  useEffect(() => {
    const e = novoEan.trim();
    if (modo !== 'criar' || !e) { setEanDup(null); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      const { data } = await supabase.from('products').select('id, name, sku, ean, price').eq('ean', e).limit(1);
      if (vivo) setEanDup(((data ?? [])[0] as Hit) ?? null);
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [novoEan, modo]);

  const escolher = (h: Hit) => { setSel(h); setPreco(''); setErro(''); };

  const concluir = async (p: ProdutoVinculado) => {
    if (traducao && supplierId) await salvarTraducao(supplierId, item.supplierCode, item.descricao, p.id);
    await onVincular(p, parsePreco(preco), vincNota);
  };

  const vincular = async () => {
    if (!sel) return;
    setSalvando(true); setErro('');
    try { await concluir(sel); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setSalvando(false); }
  };

  const criarEVincular = async () => {
    if (!novoNome.trim()) return;
    setSalvando(true); setErro('');
    try {
      const { data: criado, error } = await supabase.from('products')
        .insert({ name: novoNome.trim(), sku: novoSku.trim() || null, ean: novoEan.trim() || null, count: 0, is_low: true, status: 'Fora de Estoque', image: null, price: 0 })
        .select('id, name, sku, ean').single();
      if (error) throw new Error(error.message.toLowerCase().includes('ean') ? 'Este EAN já está cadastrado em outro produto.' : error.message);
      await concluir(criado as ProdutoVinculado);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  const titulo = modo === 'criar' ? 'Criar Novo Produto' : 'Vincular ao Dicionário';
  const view = modo === 'criar' ? 'criar' : sel ? 'conf' : 'busca';

  const blocoTraducao = podeTraduzir && (
    <Secao icon={<Star size={13} />} titulo="Tradução permanente">
      <button
        type="button"
        onClick={() => setTraducao(v => !v)}
        className={cn('w-full flex items-center gap-2.5 px-2.5 py-2 border text-left transition-colors',
          traducao ? 'border-[#F59E0B] bg-[#FFFBEB] dark:bg-amber-400/[0.08]' : 'border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]')}
      >
        <span className={cn('w-4 h-4 grid place-items-center shrink-0', traducao ? 'bg-[#F59E0B] text-white' : 'border-2 border-on-surface/20')}>{traducao && <Check size={10} strokeWidth={3.5} />}</span>
        <span>
          <b className={cn('block text-[12px] font-extrabold', traducao ? 'text-[#B45309] dark:text-[#FCD34D]' : 'text-on-surface/60')}>Salvar como tradução permanente</b>
          <small className="block text-[10.5px] text-on-surface/45">Próximas notas deste fornecedor identificarão este item automaticamente</small>
        </span>
      </button>
      {traducao && (
        <div className="grid grid-cols-2 border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]">
          <div className="px-2.5 py-1.5 min-w-0"><small className="block text-[8.5px] font-black uppercase tracking-[0.1em] text-on-surface/40">Código</small><b className="block text-[12px] font-bold truncate">{item.supplierCode || '—'}</b></div>
          <div className="px-2.5 py-1.5 min-w-0 border-l border-[#E0D8BF] dark:border-white/[0.10]"><small className="block text-[8.5px] font-black uppercase tracking-[0.1em] text-on-surface/40">Produto na Nota</small><b className="block text-[12px] font-bold truncate">{item.descricao || '—'}</b></div>
        </div>
      )}
    </Secao>
  );

  const blocoPreco = (hint?: React.ReactNode) => (
    <Secao icon={<DollarSign size={13} />} titulo="Preço de Venda">
      <div className="flex items-center gap-2.5 pl-2.5 pr-1.5 py-1.5 bg-white dark:bg-[#1E1E18] border border-[#D81E1E]/25">
        <span className="w-1.5 h-1.5 bg-[#D81E1E] shrink-0" />
        <span className="flex-1 min-w-0">
          <b className="block text-[12.5px] font-extrabold truncate">{lojaPreco}</b>
          <small className="block text-[10.5px] font-semibold text-on-surface/45">loja destino deste manifesto</small>
        </span>
        <div className="relative w-[130px] shrink-0">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] font-bold text-on-surface/30">R$</span>
          <input value={preco} onChange={e => setPreco(e.target.value)} inputMode="decimal" placeholder="0,00" className={cn(FIELD, 'pl-8 text-right font-mono')} />
        </div>
      </div>
      {hint && <p className="text-[10.5px] text-on-surface/40">{hint}</p>}
    </Secao>
  );

  const blocoNota = podeVincularNota && (
    <label className="flex items-center gap-2 px-0.5 text-[12px] font-bold cursor-pointer select-none">
      <input type="checkbox" checked={vincNota} onChange={e => setVincNota(e.target.checked)} className="w-4 h-4 accent-[#D81E1E]" />
      Vincular também a linha da nota {notaNumero ? `NF ${notaNumero}` : 'de origem'} a este produto
    </label>
  );

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={salvando ? undefined : onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        className="relative w-full max-w-[700px] max-h-[90vh] flex flex-col bg-[#FDFAF0] dark:bg-[#1E1E18] border border-black/[0.12] dark:border-white/[0.08] shadow-2xl"
      >
        {/* Barra de título */}
        <div className="h-12 pl-3.5 pr-3 flex items-center gap-[11px] bg-[#FBF35E] dark:bg-[#252520] border-b border-[#D9CF45] dark:border-white/[0.08] shrink-0">
          <span className="w-[30px] h-[30px] grid place-items-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]"><Package size={15} strokeWidth={2.3} /></span>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight">{titulo}</h2>
            <p className="text-[11px] font-bold text-[#1A1A0E]/45 dark:text-white/35 truncate">{item.descricao}</p>
          </div>
          <span className="h-[22px] px-2 flex items-center border border-black/[0.14] dark:border-white/[0.10] text-[9.5px] font-black uppercase tracking-[0.06em] text-[#1A1A0E]/50 dark:text-white/40 whitespace-nowrap">{contexto}</span>
          <button onClick={onClose} disabled={salvando} className="w-[30px] h-[30px] grid place-items-center border border-black/[0.14] dark:border-white/[0.10] text-[#1A1A0E]/50 dark:text-white/40 hover:text-[#D81E1E] active:scale-[0.93] transition-[color,transform]"><X size={15} /></button>
        </div>

        {pendencia && (
          <div className="flex items-center gap-2.5 px-3.5 py-[7px] bg-amber-50 dark:bg-amber-400/[0.07] border-b border-amber-400/50 text-[11.5px] font-semibold text-[#92400E] dark:text-[#FCD34D] shrink-0">
            <Zap size={12} className="shrink-0" />
            <span className="min-w-0 truncate">
              Pendência <b>{pendencia.pos} de {pendencia.total}</b> deste manifesto · {item.qtd} un · custo {fmt(item.custo)}{item.linhaNota ? ` · linha ${item.linhaNota} da nota` : ''}
            </span>
            {pendencia.onPular && pendencia.total > 1 && (
              <button onClick={pendencia.onPular} disabled={salvando} className="ml-auto h-6 px-2 border border-current text-[9.5px] font-black uppercase tracking-[0.05em] shrink-0">Pular →</button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-3.5 py-3 flex flex-col gap-2.5">
          {erro && (
            <div className="flex items-center gap-2 px-2.5 py-2 border border-[#D81E1E]/35 bg-[#D81E1E]/[0.06] text-[12px] font-semibold text-[#D81E1E]"><AlertTriangle size={13} className="shrink-0" />{erro}</div>
          )}

          {view !== 'conf' && (
            <div className="flex border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]">
              <button type="button" className="flex-1 h-[30px] flex items-center justify-center gap-1.5 bg-[#D81E1E] text-white text-[10.5px] font-black uppercase tracking-[0.06em]"><Package size={12} />Produto</button>
              <button type="button" disabled title="Produto Mãe (caixa/fardo) é definido na nota" className="flex-1 h-[30px] border-l border-[#E0D8BF] dark:border-white/[0.10] text-[10.5px] font-black uppercase tracking-[0.06em] text-on-surface/25 cursor-not-allowed">Produto Mãe</button>
            </div>
          )}

          {view === 'busca' && (
            <Secao icon={<Search size={13} />} titulo="Buscar no dicionário">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface/30 pointer-events-none" />
                <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Nome, SKU ou EAN..." className={cn(FIELD, 'pl-8')} />
              </div>
              <div className="bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10]">
                <div className="grid grid-cols-[1fr_100px_130px_80px] h-7 bg-[#FFEC4D] shadow-[inset_0_-1.5px_0_#8F7E10] text-[8.5px] font-black uppercase tracking-[0.1em] text-[rgba(26,26,10,0.55)]">
                  <span className="px-2.5 flex items-center">Produto</span><span className="px-2.5 flex items-center border-l border-[#B8A31F]">SKU</span><span className="px-2.5 flex items-center border-l border-[#B8A31F]">EAN</span><span className="px-2.5 flex items-center justify-end border-l border-[#B8A31F]">Preço</span>
                </div>
                {buscando && hits.length === 0 ? (
                  <p className="py-5 text-center text-[12px] italic text-on-surface/35">Buscando…</p>
                ) : hits.length === 0 ? (
                  <p className="py-5 text-center text-[12px] italic text-on-surface/35">{query.trim() ? 'Nenhum produto encontrado' : 'Digite para buscar...'}</p>
                ) : hits.map((h, i) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => escolher(h)}
                    className={cn('group w-full grid grid-cols-[1fr_100px_130px_80px] h-[34px] text-left text-[12.5px] border-b last:border-b-0 border-[#A8A290]/60 dark:border-white/[0.12] transition-colors hover:bg-[#FFF8D0] dark:hover:bg-[#FFE500]/[0.06]',
                      i % 2 ? 'bg-[#FAF7EE] dark:bg-[#1A1A15]' : '')}
                  >
                    <span className="px-2.5 flex items-center gap-1.5 min-w-0">
                      <b className="font-extrabold truncate group-hover:text-[#D81E1E]">{h.name}</b>
                      {item.ean && h.ean === item.ean && <em className="not-italic shrink-0 text-[8.5px] font-black uppercase tracking-[0.05em] px-[5px] leading-[15px] border border-current text-[#0A7A55] dark:text-[#34D399]">EAN igual</em>}
                    </span>
                    <span className="px-2.5 flex items-center font-mono text-[11.5px] text-on-surface/45 border-l border-[#A8A290]/60 dark:border-white/[0.12] truncate">{h.sku || '—'}</span>
                    <span className="px-2.5 flex items-center font-mono text-[11.5px] text-on-surface/45 border-l border-[#A8A290]/60 dark:border-white/[0.12] truncate">{h.ean || '—'}</span>
                    <span className="px-2.5 flex items-center justify-end font-mono text-[11.5px] text-on-surface/45 border-l border-[#A8A290]/60 dark:border-white/[0.12]">{h.price > 0 ? fmt(h.price) : '—'}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => { setModo('criar'); setErro(''); }}
                className="h-[34px] flex items-center justify-center gap-1.5 border-[1.5px] border-dashed border-[rgba(26,26,10,0.22)] dark:border-white/[0.18] text-[11px] font-extrabold uppercase tracking-[0.05em] text-[rgba(26,26,10,0.35)] dark:text-white/30 hover:border-[#D81E1E] hover:text-[#D81E1E] transition-colors"
              ><Plus size={13} strokeWidth={3} /> Criar novo produto</button>
            </Secao>
          )}

          {view === 'conf' && sel && (<>
            <Secao icon={<Package size={13} />} titulo="Produto selecionado">
              <div className="flex items-center gap-2.5 px-2.5 py-2 bg-white dark:bg-[#1E1E18] border border-[#D81E1E]/25">
                <span className="w-[30px] h-[30px] grid place-items-center bg-[#D81E1E]/10 text-[#D81E1E] shrink-0"><Package size={14} /></span>
                <span className="flex-1 min-w-0"><b className="block text-[13px] font-extrabold truncate">{sel.name}</b><small className="block font-mono text-[11px] text-on-surface/45">{sel.sku || '—'} · {sel.ean || '—'}</small></span>
                <button type="button" onClick={() => setSel(null)} className="text-[10.5px] font-black uppercase tracking-[0.05em] text-[#D81E1E] underline">Trocar</button>
              </div>
            </Secao>
            {blocoTraducao}
            {blocoPreco(sel.price > 0 ? <>Preço cadastrado no dicionário: <b>R$ {fmt(sel.price)}</b> — vai para a coluna &ldquo;Preço Venda&rdquo; do manifesto</> : 'Opcional — dá para lançar depois na coluna "Preço Venda" do manifesto.')}
            {blocoNota}
          </>)}

          {view === 'criar' && (<>
            <Secao icon={<Package size={13} />} titulo="Identificação">
              <div><label className={LABEL}>Nome do Produto</label><input autoFocus value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome do produto" className={FIELD} /></div>
              <div className="grid grid-cols-2 gap-2.5">
                <div><label className={LABEL}>SKU (Código Interno)</label><input value={novoSku} onChange={e => setNovoSku(e.target.value)} placeholder="Opcional" className={FIELD} /></div>
                <div><label className={LABEL}>Código EAN</label><input value={novoEan} onChange={e => setNovoEan(e.target.value)} placeholder="Cód. barras" className={cn(FIELD, 'font-mono')} /></div>
              </div>
              {eanDup && (
                <div className="flex items-center gap-2 px-2.5 py-1.5 border border-[#D81E1E]/35 bg-[#D81E1E]/[0.06] text-[#D81E1E]">
                  <AlertTriangle size={13} className="shrink-0" />
                  <span className="flex-1 min-w-0"><b className="block text-[10px] font-black uppercase tracking-[0.05em]">EAN {eanDup.ean} já cadastrado — evite duplicar</b><small className="block text-[12px] font-bold truncate">{eanDup.name}</small></span>
                  <button type="button" onClick={() => { setModo('busca'); escolher(eanDup); }} className="text-[10.5px] font-black uppercase tracking-[0.05em] underline shrink-0">Usar este</button>
                </div>
              )}
            </Secao>
            {blocoPreco()}
            {blocoTraducao}
            {blocoNota}
          </>)}
        </div>

        {/* Rodapé */}
        <div className="px-3.5 py-2.5 flex items-center gap-2 bg-[#EFE7CD] dark:bg-[#181814] border-t border-[#DDD2B0] dark:border-white/[0.08] shrink-0">
          {view === 'busca' && (<>
            <span className="text-[11.5px] font-semibold text-on-surface/45">Escolha um produto do dicionário ou crie um novo</span>
            <button onClick={onClose} className={cn(BTN_GHOST, 'ml-auto')}>Cancelar</button>
          </>)}
          {view === 'conf' && (<>
            <button onClick={() => setSel(null)} disabled={salvando} className={BTN_GHOST}>← Voltar para busca</button>
            <button onClick={vincular} disabled={salvando} className={cn(BTN_PRI, 'ml-auto')}>
              {salvando ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-r-transparent" /> : <Check size={14} strokeWidth={3} />}
              Vincular com este preço
            </button>
          </>)}
          {view === 'criar' && (<>
            <button onClick={() => setModo('busca')} disabled={salvando} className={BTN_GHOST}>← Voltar para busca</button>
            <button onClick={criarEVincular} disabled={salvando || !novoNome.trim()} className={cn(BTN_PRI, 'ml-auto')}>
              {salvando ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-r-transparent" /> : <Plus size={14} strokeWidth={3} />}
              Criar e Vincular
            </button>
          </>)}
        </div>
      </motion.div>
    </div>
  );
}
