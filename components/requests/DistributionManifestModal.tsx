'use client';

import { useState, useRef, useEffect } from 'react';
import { Package, X, CheckCircle2, RefreshCw, Search, Zap, AlertTriangle, Trash2, Pencil, Info, ArrowDown, ArrowUp, Check, Download, FileText, Ban, Plus, ArrowRight, Lock, ListChecks } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { jsPDF } from 'jspdf';
import { VincularProdutoModal, type ProdutoVinculado } from '@/components/products/VincularProdutoModal';
import autoTable from 'jspdf-autotable';

const MANIFEST_LOCK_TTL_MS = 2 * 60 * 1000;

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const blockWheelChange =(e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur();

// Estilo "molde da nota" — mesma barra de cabeçalho amarela contínua + chip por coluna,
// e célula em duas camadas (td fino + div arredondado) usada na tabela de revisão da nota
// (app/page.tsx, thBar/lbl/cell). Reaproveitado aqui via classes utilitárias fixas porque
// este componente não compartilha os `--rn-*` CSS vars do editor de nota.
const thBarCls = 'bg-[#FFE500] dark:bg-[#FFE500] px-2 h-9 align-middle border-b border-[#D4C000] dark:border-[#C8B800]';
const thLblCls = 'inline-flex items-center justify-center gap-1 text-[9px] font-black uppercase tracking-widest text-[#1A1A0E]/55 whitespace-nowrap bg-black/[0.06] border-[1.5px] border-black/10 rounded-full px-3 py-[5px] w-full';
const tdCls = 'p-[3px] border-b border-[#E0D8BF] dark:border-white/[0.08]';
const cellCls = 'rounded-[9px] border-[1.5px] border-[#E0D8BF] dark:border-white/[0.08] h-9 flex items-center px-2.5 overflow-hidden text-[12px] font-semibold text-[#1A1A0E] dark:text-[#F2F0E3] bg-white dark:bg-[#252520]';
const cellInputCls = 'bg-transparent border-none outline-none w-full h-full font-inherit text-inherit';

export interface DistributionManifestDraft {
  id: string;
  isExisting: boolean;
  manifestNumber: string;
  originCompanyId: string | null;
  status: 'registro' | 'pedido_enviado' | 'aprovado';
}

interface Company { id: string; nome_fantasia: string }

interface ProductHit { id: string; name: string; sku: string | null; ean: string | null }

interface SelectedProduct extends ProductHit { costPrice: number; salePriceOrigin: number }

// Divergência de recebimento — mesmo formato usado no "Falta/Sobra" da nota
// (app/page.tsx, DiscrepancyData), registrada pelo mesmo modal/fluxo aqui no manifesto.
type DiscrepancyData = { type: 'falta' | 'sobra'; qty: number; missingAll: boolean; obs: string; disregarded?: boolean } | null;

interface ManifestItem {
  id: string;
  // null = "pendente de vínculo": veio da nota sem produto do cadastro (Não Encontrado) e
  // precisa ser vinculado/criado aqui antes da aprovação do recebimento.
  productId: string | null;
  // Linha da nota de origem (review_notes.items[idx]) — EAN atual e vínculo da linha da nota.
  sourceIdx: number | null;
  productName: string;
  sku: string | null;
  ean: string | null;
  qty: number;
  measure: string;
  costPrice: number;
  salePriceOrigin: number;
  // Preenchidos pela loja destino após o envio (decisão 3-B do plano de Distribuição). O
  // preço de venda já chega preenchido quando foi lançado na nota de origem pelo botão
  // "Precificar para outra empresa" (pricingByCompany).
  salePriceDestination: number | null;
  // Quando o preço acima foi salvo (aqui ou na nota de origem) — "vale o último salvo".
  salePriceDestinationAt: string | null;
  verified: boolean;
  // Divergência registrada pela loja destino via botão na coluna Qtd. Env. — substitui o
  // antigo campo solto "Qtd. Receb." (qty_received): agora o Falta/Sobra é explícito e vem
  // com observação, igual ao fluxo da nota.
  discrepancy: DiscrepancyData;
}

// Ajuste de VALOR do toggle "Confirmar divergência" — subtrai (falta) ou soma (sobra) o
// Preço de Custo × quantidade divergente do Valor Total do item. A quantidade (Qtd. Env.
// exibida e o estoque lançado na aprovação, ver getEffectiveReceivedQty) já é ajustada
// sempre que a Falta/Sobra é salva, independente deste toggle.
const getDiscrepancyValueAdjustment = (it: ManifestItem): number => {
  const d = it.discrepancy;
  if (!d || !d.disregarded) return 0;
  const qty = d.type === 'falta' ? (d.missingAll ? it.qty : (d.qty || 0)) : (d.qty || 0);
  const value = qty * it.costPrice;
  return d.type === 'falta' ? -value : value;
};

interface DistributionManifestModalProps {
  manifest: DistributionManifestDraft;
  companies: Company[];
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
  onClose: () => void;
  onSaved: () => void;
  setNotification: (notif: { type: 'success' | 'error', message: string } | null) => void;
}

export function DistributionManifestModal({
  manifest,
  companies,
  colaboradorId,
  colaboradorNome,
  onClose,
  onSaved,
  setNotification,
}: DistributionManifestModalProps) {
  const [originCompanyId, setOriginCompanyId] = useState(manifest.originCompanyId || '');
  const [originQuery, setOriginQuery] = useState(companies.find(c => c.id === manifest.originCompanyId)?.nome_fantasia || '');
  const [originOpen, setOriginOpen] = useState(false);
  // Modo exibição/edição do campo Empresa Origem — mesmo padrão do combobox de Fornecedor
  // na Nota (título estático + lápis, vira input só ao clicar em editar).
  const [editingOrigin, setEditingOrigin] = useState(!manifest.originCompanyId);
  const originRef = useRef<HTMLDivElement>(null);
  // Linha da tabela de itens "em uso" (célula com foco) — fundo cinza discreto + número do
  // item em vermelho, mesmo sinal visual usado na tabela de revisão da nota.
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'produtos' | 'recebimento'>('produtos');
  const [saving, setSaving] = useState(false);

  const [checkingLock, setCheckingLock] = useState(false);
  const [lockBlockedBy, setLockBlockedBy] = useState<{ name: string; at: string | null } | null>(null);

  // isExisting/status viram estado local (não só prop) porque o primeiro "Salvar Rascunho"
  // faz o manifesto passar a existir no banco, e "Confirmar Envio" muda o status em tempo
  // real dentro da mesma sessão do modal, sem precisar fechar e reabrir.
  const [isExistingState, setIsExistingState] = useState(manifest.isExisting);
  const [status, setStatus] = useState(manifest.status);
  const editable = status === 'registro';
  // Pedido Enviado: loja destino confere quantidades/preço/Ok, mas ainda não aprovou.
  const receiving = status === 'pedido_enviado';
  const approved = status === 'aprovado';

  // ── Aba Recebimento ──────────────────────────────────────────────────────
  const [destinationCompanyId, setDestinationCompanyId] = useState('');
  const [shippingDate, setShippingDate] = useState('');
  const [createdByName, setCreatedByName] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [sentByName, setSentByName] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [approvedByName, setApprovedByName] = useState<string | null>(null);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Modal de Falta/Sobra — mesmo fluxo do modal de divergência da nota (app/page.tsx),
  // acionado pelo botão na coluna Qtd. Env. da tabela de itens.
  const [discrepancyModalItemId, setDiscrepancyModalItemId] = useState<string | null>(null);
  const [discrepancyTab, setDiscrepancyTab] = useState<'falta' | 'sobra'>('falta');
  const [discrepancyQty, setDiscrepancyQty] = useState('');
  const [discrepancyMissingAll, setDiscrepancyMissingAll] = useState(false);
  const [discrepancyObs, setDiscrepancyObs] = useState('');
  const [discrepancyDisregarded, setDiscrepancyDisregarded] = useState(false);

  useEffect(() => {
    if (!manifest.isExisting) return;
    (async () => {
      const { data } = await supabase
        .from('distribution_manifests')
        .select('destination_company_id, shipping_date, created_by_name, created_at, sent_by_name, sent_at, approved_by_name, approved_at, status, source_note_id')
        .eq('id', manifest.id)
        .maybeSingle();
      if (!data) return;
      // destination_company_id pode estar com o placeholder gravado pela Fase 5/6 (mesma
      // empresa da origem, antes de existir campo de destino de verdade) — trata como vazio.
      setDestinationCompanyId(data.destination_company_id && data.destination_company_id !== manifest.originCompanyId ? data.destination_company_id : '');
      setShippingDate(data.shipping_date || '');
      setCreatedByName(data.created_by_name || null);
      setCreatedAt(data.created_at || null);
      setSentByName(data.sent_by_name || null);
      setSentAt(data.sent_at || null);
      setApprovedByName(data.approved_by_name || null);
      setApprovedAt(data.approved_at || null);
      setStatus(data.status);
      setSourceNoteId(data.source_note_id || null);
    })();
  }, [manifest.id, manifest.isExisting]);

  // Nota de origem (manifestos gerados pela "Distribuição Enviada"): EAN atual das linhas,
  // fornecedor (tradução permanente) e vínculo da linha da nota junto com o do manifesto.
  const [sourceNoteId, setSourceNoteId] = useState<string | null>(null);
  const [sourceNote, setSourceNote] = useState<{ id: string; numero: string | null; supplierId: string | null; items: any[] } | null>(null);
  useEffect(() => {
    if (!sourceNoteId) return;
    (async () => {
      const { data } = await supabase.from('review_notes').select('id, note_number, supplier_id, items').eq('id', sourceNoteId).maybeSingle();
      if (data) setSourceNote({ id: data.id, numero: data.note_number ?? null, supplierId: data.supplier_id ?? null, items: (data.items as any[]) ?? [] });
    })();
  }, [sourceNoteId]);

  const fmtDateTimeBR = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR') : '—';

  // ── Aba Produtos ─────────────────────────────────────────────────────────
  const [items, setItems] = useState<ManifestItem[]>([]);
  const itemsDirtyRef = useRef(false);
  const [loadingItems, setLoadingItems] = useState(manifest.isExisting);
  const [descQuery, setDescQuery] = useState('');
  const [eanQuery, setEanQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProductHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<SelectedProduct | null>(null);
  const [qtyInput, setQtyInput] = useState('');
  const [creatingProduct, setCreatingProduct] = useState(false);
  // Painel "Criar e Vincular" — mesmo formato do painel de criação da nota (Identificação +
  // Preço), aberto em vez de criar o produto direto: o usuário preenche tudo (nome, SKU, EAN,
  // custo, venda) antes de o produto ser gravado e cair pronto pra quantidade + confirmar.
  const [creatingFormOpen, setCreatingFormOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newEan, setNewEan] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newSale, setNewSale] = useState('');
  // Duplicidade (produto já está na lista): mescla automática (soma qty), mas só depois de
  // o usuário confirmar — EAN do card em vermelho + ícone de alerta, ver Etapa 6 do plano.
  const [duplicatePendingQty, setDuplicatePendingQty] = useState<number | null>(null);

  const isDuplicateOfSelected = duplicatePendingQty !== null && selectedProduct
    ? items.some(it => it.productId === selectedProduct.id)
    : false;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (originRef.current && !originRef.current.contains(e.target as Node)) setOriginOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Manifesto novo (ainda sem linha no banco) não precisa de lock — não há o que travar
  // até o primeiro "Salvar Rascunho". Mesmo comportamento de handleCreateManifestNote.
  const acquireLock = async () => {
    if (!isExistingState || !colaboradorId) return;
    setCheckingLock(true);
    try {
      const ttlCutoff = new Date(Date.now() - MANIFEST_LOCK_TTL_MS).toISOString();
      const { data: claimed } = await supabase
        .from('distribution_manifests')
        .update({ locked_by_id: colaboradorId, locked_by_name: colaboradorNome, locked_at: new Date().toISOString() })
        .eq('id', manifest.id)
        .or(`locked_at.is.null,locked_at.lt.${ttlCutoff},locked_by_id.eq.${colaboradorId}`)
        .select('id')
        .maybeSingle();
      if (!claimed) {
        // Re-checa o dono atual do lock antes de bloquear — se a leitura falhar (RLS/rede
        // instável) ou o dono já for eu mesmo (lock meu que não foi pego pela condição acima
        // por alguma falha transitória), não é um conflito real: libera a edição em vez de
        // travar com um aviso genérico "outra pessoa" sem nome nenhum.
        const { data: fresh } = await supabase.from('distribution_manifests').select('locked_by_id, locked_by_name, locked_at').eq('id', manifest.id).maybeSingle();
        if (!fresh?.locked_by_id || fresh.locked_by_id === colaboradorId) {
          setLockBlockedBy(null);
        } else {
          setLockBlockedBy({ name: fresh.locked_by_name || 'outra pessoa', at: fresh.locked_at || null });
        }
      } else {
        setLockBlockedBy(null);
      }
    } finally {
      setCheckingLock(false);
    }
  };

  useEffect(() => { acquireLock(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega os itens já salvos deste manifesto (edição de um manifesto existente).
  // itemsDirtyRef evita que essa resposta assíncrona sobrescreva itens que o usuário já
  // começou a adicionar localmente enquanto o fetch ainda estava em voo — sem essa guarda,
  // adicionar produtos rápido demais ao reabrir um manifesto existente fazia o fetch (mais
  // lento) chegar depois e apagar silenciosamente tudo que tinha sido adicionado, voltando
  // a lista para o que já estava salvo no banco.
  useEffect(() => {
    if (!manifest.isExisting) return;
    (async () => {
      const COLS = 'id, product_id, product_name, sku, ean, qty, measure, cost_price, sale_price_origin, sale_price_destination, sale_price_destination_at, verified, discrepancy';
      let { data, error }: { data: any[] | null; error: unknown } = await supabase.from('distribution_manifest_items').select(`${COLS}, source_note_item_idx`).eq('manifest_id', manifest.id);
      // SQL add_distribution_pending_link.sql ainda não rodado: carrega sem a coluna nova
      if (error) ({ data, error } = await supabase.from('distribution_manifest_items').select(COLS).eq('manifest_id', manifest.id));
      if (itemsDirtyRef.current) { setLoadingItems(false); return; }
      setItems((data || []).map((r: any) => ({
        id: r.id,
        productId: r.product_id ?? null,
        sourceIdx: r.source_note_item_idx ?? null,
        productName: r.product_name,
        sku: r.sku,
        ean: r.ean,
        qty: parseFloat(r.qty) || 0,
        measure: r.measure || 'UN',
        costPrice: parseFloat(r.cost_price) || 0,
        salePriceOrigin: parseFloat(r.sale_price_origin) || 0,
        salePriceDestination: r.sale_price_destination !== null ? parseFloat(r.sale_price_destination) : null,
        salePriceDestinationAt: r.sale_price_destination_at ?? null,
        verified: !!r.verified,
        discrepancy: r.discrepancy ?? null,
      })));
      setLoadingItems(false);
    })();
  }, [manifest.id, manifest.isExisting]);

  // EAN atual de cada produto vinculado — o manifesto guarda uma cópia do EAN no envio, e o
  // produto pode ganhar EAN depois (ex.: na aprovação da nota). Mostra sempre o atual.
  const [productEans, setProductEans] = useState<Record<string, string | null>>({});
  const linkedIdsKey = [...new Set(items.map(it => it.productId).filter((id): id is string => !!id))].sort().join('|');
  useEffect(() => {
    if (!linkedIdsKey) return;
    (async () => {
      const { data } = await supabase.from('products').select('id, ean').in('id', linkedIdsKey.split('|'));
      setProductEans(Object.fromEntries((data ?? []).map((r: any) => [r.id, r.ean ?? null])));
    })();
  }, [linkedIdsKey]);

  const linhaDaNota = (it: ManifestItem) => (it.sourceIdx != null && sourceNote ? sourceNote.items[it.sourceIdx] : undefined);
  /** EAN mostrado: o atual do produto (vinculado) ou o atual da linha da nota (pendente). */
  const eanAtual = (it: ManifestItem): { ean: string | null; daNota: boolean } => {
    if (it.productId) return { ean: productEans[it.productId] ?? it.ean, daNota: false };
    const notaEan = linhaDaNota(it)?.ean || null;
    return notaEan && notaEan !== it.ean ? { ean: notaEan, daNota: true } : { ean: it.ean, daNota: false };
  };

  // ── Pendências de vínculo ───────────────────────────────────────────────
  const pendentes = items.filter(it => !it.productId);
  const [vincItemId, setVincItemId] = useState<string | null>(null);
  const [manifestBusca, setManifestBusca] = useState('');

  const proximaPendente = (depoisDe: string | null, lista = pendentes) => {
    if (lista.length === 0) return null;
    const i = depoisDe ? lista.findIndex(x => x.id === depoisDe) : -1;
    return (lista[i + 1] ?? lista.find(x => x.id !== depoisDe) ?? null)?.id ?? null;
  };

  const handleVinculado = async (it: ManifestItem, p: ProdutoVinculado, precoVenda: number | null, vincularNota: boolean) => {
    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = { product_id: p.id, product_name: p.name, sku: p.sku, ean: p.ean ?? it.ean };
    if (precoVenda !== null && precoVenda > 0) { patch.sale_price_destination = precoVenda; patch.sale_price_destination_at = nowIso; }
    const { error } = await supabase.from('distribution_manifest_items').update(patch).eq('id', it.id);
    if (error) throw new Error(error.message);
    if (precoVenda !== null && precoVenda > 0 && destinationCompanyId) {
      await supabase.from('product_company_stock').upsert({
        product_id: p.id, company_id: destinationCompanyId, price: precoVenda, price_received_date: nowIso.slice(0, 10), updated_at: nowIso,
      }, { onConflict: 'product_id,company_id' });
    }
    // Linha da nota de origem — só se ela ainda estiver sem produto (não sobrescreve outro vínculo)
    if (vincularNota && sourceNoteId && it.sourceIdx != null) {
      const { data: nota } = await supabase.from('review_notes').select('items').eq('id', sourceNoteId).maybeSingle();
      const notaItens = [...((nota?.items as any[]) ?? [])];
      const linha = notaItens[it.sourceIdx];
      if (linha && !linha.product_id) {
        notaItens[it.sourceIdx] = { ...linha, product_id: p.id, name: p.name, sku: p.sku || linha.sku, ean: p.ean || linha.ean, status_translation: 'Identificado (SKU/EAN)' };
        await supabase.from('review_notes').update({ items: notaItens }).eq('id', sourceNoteId);
        setSourceNote(prev => prev ? { ...prev, items: notaItens } : prev);
      }
    }
    const atualizado: ManifestItem = {
      ...it, productId: p.id, productName: p.name, sku: p.sku, ean: p.ean ?? it.ean,
      ...(precoVenda !== null && precoVenda > 0 ? { salePriceDestination: precoVenda, salePriceDestinationAt: nowIso } : {}),
    };
    const novaLista = items.map(x => x.id === it.id ? atualizado : x);
    setItems(novaLista);
    if (p.ean) setProductEans(prev => ({ ...prev, [p.id]: p.ean }));
    const restantes = novaLista.filter(x => !x.productId);
    setVincItemId(proximaPendente(it.id, restantes));
    setNotification({ type: 'success', message: restantes.length ? `Vinculado: ${p.name}. Faltam ${restantes.length}.` : 'Todas as pendências de vínculo foram resolvidas.' });
    onSaved();
  };

  // Busca por descrição ou EAN — mesmo padrão .or() ilike usado em app/page.tsx.
  useEffect(() => {
    if (!originCompanyId) { setSearchResults([]); return; }
    const desc = descQuery.trim();
    const ean = eanQuery.trim();
    if (!desc && !ean) { setSearchResults([]); return; }
    let cancelled = false;
    setSearchLoading(true);
    const run = async () => {
      let query = supabase.from('products').select('id, name, sku, ean').limit(8);
      query = ean ? query.ilike('ean', `%${ean}%`) : query.ilike('name', `%${desc}%`);
      const { data } = await query;
      if (!cancelled) setSearchResults((data || []) as ProductHit[]);
      if (!cancelled) setSearchLoading(false);
    };
    const t = setTimeout(run, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [descQuery, eanQuery, originCompanyId]);

  const selectProduct = async (p: ProductHit) => {
    const { data: stock } = await supabase
      .from('product_company_stock')
      .select('cost_price, price')
      .eq('product_id', p.id)
      .eq('company_id', originCompanyId)
      .maybeSingle();
    setSelectedProduct({ ...p, costPrice: parseFloat(stock?.cost_price) || 0, salePriceOrigin: parseFloat(stock?.price) || 0 });
    setDescQuery('');
    setEanQuery('');
    setSearchResults([]);
    setQtyInput('');
    setDuplicatePendingQty(null);
  };

  // Abre o painel de criação (molde do "Criar e Vincular" da nota) em vez de criar o produto
  // na hora — o usuário preenche Nome/SKU/EAN/Custo/Venda ali antes de qualquer gravação.
  const openCreateForm = () => {
    setNewName(descQuery.trim() || eanQuery.trim());
    setNewSku('');
    setNewEan(eanQuery.trim());
    setNewCost('');
    setNewSale('');
    setCreatingFormOpen(true);
  };

  const handleSubmitCreateForm = async () => {
    const name = newName.trim();
    if (!name) {
      setNotification({ type: 'error', message: 'Informe o nome do produto.' });
      return;
    }
    setCreatingProduct(true);
    try {
      const costPrice = parseFloat(newCost.replace(',', '.')) || 0;
      const salePriceOrigin = parseFloat(newSale.replace(',', '.')) || 0;
      const { data: created, error } = await supabase
        .from('products')
        .insert({ name, sku: newSku.trim() || null, ean: newEan.trim() || null, count: 0, is_low: true, status: 'Fora de Estoque', price: 0 })
        .select('id, name, sku, ean')
        .single();
      if (error) throw error;
      await supabase.from('product_company_stock').upsert({
        product_id: created.id,
        company_id: originCompanyId,
        cost_price: costPrice,
        price: salePriceOrigin,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'product_id,company_id' });
      setSelectedProduct({ ...(created as ProductHit), costPrice, salePriceOrigin });
      setDescQuery('');
      setEanQuery('');
      setSearchResults([]);
      setQtyInput('');
      setDuplicatePendingQty(null);
      setCreatingFormOpen(false);
      setNotification({ type: 'success', message: 'Produto criado e vinculado.' });
    } catch (err: any) {
      const msg = err?.message || '';
      setNotification({ type: 'error', message: msg.includes('ean') ? 'Este EAN já está cadastrado em outro produto.' : (msg || 'Erro ao criar produto.') });
    } finally {
      setCreatingProduct(false);
    }
  };

  const addItem = (p: SelectedProduct, qty: number) => {
    itemsDirtyRef.current = true;
    setItems(prev => [...prev, {
      id: crypto.randomUUID(),
      productId: p.id,
      sourceIdx: null,
      productName: p.name,
      sku: p.sku,
      ean: p.ean,
      qty,
      measure: 'UN',
      costPrice: p.costPrice,
      salePriceOrigin: p.salePriceOrigin,
      salePriceDestination: null,
      salePriceDestinationAt: null,
      verified: false,
      discrepancy: null,
    }]);
    setSelectedProduct(null);
    setQtyInput('');
    setDuplicatePendingQty(null);
  };

  // Edição inline de campos do item em Registro (Qtd./Medida) — tabela no molde da nota.
  const updateItemField = (id: string, patch: Partial<Pick<ManifestItem, 'qty' | 'measure'>>) => {
    itemsDirtyRef.current = true;
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  };

  const handleConfirmAddItem = () => {
    if (!selectedProduct) return;
    const qty = parseFloat(qtyInput.replace(',', '.'));
    if (!qty || qty <= 0) {
      setNotification({ type: 'error', message: 'Informe uma quantidade válida.' });
      return;
    }
    const alreadyInList = items.some(it => it.productId === selectedProduct.id);
    if (alreadyInList) {
      setDuplicatePendingQty(qty);
      return;
    }
    addItem(selectedProduct, qty);
  };

  const confirmDuplicateMerge = () => {
    if (!selectedProduct || duplicatePendingQty === null) return;
    itemsDirtyRef.current = true;
    setItems(prev => prev.map(it => it.productId === selectedProduct.id ? { ...it, qty: it.qty + duplicatePendingQty } : it));
    setSelectedProduct(null);
    setQtyInput('');
    setDuplicatePendingQty(null);
  };

  const cancelDuplicateMerge = () => setDuplicatePendingQty(null);

  const removeItem = (id: string) => {
    itemsDirtyRef.current = true;
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const itemsTotal = items.reduce((acc, it) => acc + it.qty * it.costPrice + getDiscrepancyValueAdjustment(it), 0);

  const releaseLock = () => {
    if (!isExistingState || !colaboradorId) return;
    supabase.from('distribution_manifests')
      .update({ locked_by_id: null, locked_by_name: null, locked_at: null })
      .eq('id', manifest.id)
      .eq('locked_by_id', colaboradorId)
      .then(() => {});
  };

  const handleClose = () => {
    releaseLock();
    onClose();
  };

  // Compartilhada por "Salvar Rascunho" e "Confirmar Envio" — grava cabeçalho + resincroniza
  // itens. `send` decide se o status vira 'pedido_enviado' (irreversível, ver Etapa 5/7).
  const persistManifest = async (send: boolean): Promise<boolean> => {
    if (!originCompanyId) {
      setNotification({ type: 'error', message: 'Selecione a Empresa Origem antes de salvar.' });
      return false;
    }
    if (send) {
      if (!destinationCompanyId) {
        setNotification({ type: 'error', message: 'Selecione a Empresa Destino antes de enviar.' });
        return false;
      }
      if (items.length === 0) {
        setNotification({ type: 'error', message: 'Adicione ao menos 1 produto antes de enviar.' });
        return false;
      }
    }
    try {
      const nowIso = new Date().toISOString();
      const effectiveShippingDate = send ? (shippingDate || nowIso.slice(0, 10)) : (shippingDate || null);
      const payload: any = {
        id: manifest.id,
        manifest_number: manifest.manifestNumber,
        origin_company_id: originCompanyId,
        // destination_company_id é NOT NULL no schema — antes do usuário escolher, gravamos
        // a própria origem como placeholder (Fase 5/6); some assim que o campo for preenchido.
        destination_company_id: destinationCompanyId || originCompanyId,
        shipping_date: effectiveShippingDate,
        status: send ? 'pedido_enviado' : status,
      };
      if (!isExistingState) {
        payload.created_by_id = colaboradorId || null;
        payload.created_by_name = colaboradorNome || null;
      }
      if (send) {
        payload.sent_by_id = colaboradorId || null;
        payload.sent_by_name = colaboradorNome || null;
        payload.sent_at = nowIso;
      }
      const { error } = await supabase.from('distribution_manifests').upsert(payload, { onConflict: 'id' });
      if (error) throw error;

      // Sincroniza itens: apaga tudo e regrava a lista atual — simples e seguro nesta fase,
      // já que o manifesto fica travado por lock enquanto um usuário edita por vez.
      await supabase.from('distribution_manifest_items').delete().eq('manifest_id', manifest.id);
      if (items.length > 0) {
        const { error: itemsError } = await supabase.from('distribution_manifest_items').insert(
          items.map(it => ({
            manifest_id: manifest.id,
            product_id: it.productId,
            product_name: it.productName,
            sku: it.sku,
            ean: it.ean,
            qty: it.qty,
            measure: it.measure,
            cost_price: it.costPrice,
            sale_price_origin: it.salePriceOrigin,
            sale_price_destination: it.salePriceDestination,
            sale_price_destination_at: it.salePriceDestinationAt,
            verified: it.verified,
            discrepancy: it.discrepancy,
          }))
        );
        if (itemsError) throw itemsError;
      }

      setIsExistingState(true);
      if (!createdByName) { setCreatedByName(colaboradorNome || null); setCreatedAt(nowIso); }
      if (send) { setStatus('pedido_enviado'); setSentByName(colaboradorNome || null); setSentAt(nowIso); }
      onSaved();
      return true;
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Erro ao salvar manifesto.' });
      return false;
    }
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    const ok = await persistManifest(false);
    setSaving(false);
    if (ok) {
      setNotification({ type: 'success', message: 'Manifesto salvo.' });
      handleClose();
    }
  };

  const handleConfirmSend = async () => {
    setSending(true);
    const ok = await persistManifest(true);
    setSending(false);
    setConfirmSendOpen(false);
    if (ok) {
      setNotification({ type: 'success', message: 'Pedido enviado com sucesso.' });
      handleClose();
    }
  };

  // Preço de venda / Ok do item — preenchido pela loja destino depois do envio (decisão 3-B).
  // Salva direto (fora do fluxo de "Salvar Rascunho", que fica desabilitado pós-envio) e já
  // propaga o preço pro Estoque & Preço da loja destino.
  // O preço também pode vir da nota de origem (botão "Precificar para outra empresa") — vale o
  // último salvo entre os dois, por isso o horário só muda quando o preço muda de fato (marcar
  // o Ok não conta como nova precificação).
  const updateItemPricing = async (itemId: string, productId: string, salePrice: number | null, verified: boolean) => {
    const priceChanged = items.find(it => it.id === itemId)?.salePriceDestination !== salePrice;
    const nowIso = new Date().toISOString();
    setItems(prev => prev.map(it => it.id === itemId ? {
      ...it, salePriceDestination: salePrice, verified,
      ...(priceChanged ? { salePriceDestinationAt: salePrice !== null ? nowIso : null } : {}),
    } : it));
    await supabase.from('distribution_manifest_items').update({
      sale_price_destination: salePrice,
      verified,
      verified_at: verified ? nowIso : null,
      ...(priceChanged ? { sale_price_destination_at: salePrice !== null ? nowIso : null } : {}),
    }).eq('id', itemId);
    if (destinationCompanyId && salePrice !== null && salePrice > 0) {
      await supabase.from('product_company_stock').upsert({
        product_id: productId,
        company_id: destinationCompanyId,
        price: salePrice,
        price_received_date: nowIso.slice(0, 10),
        updated_at: nowIso,
      }, { onConflict: 'product_id,company_id' });
    }
  };

  // Falta/Sobra — registrado pela loja destino via botão na coluna Qtd. Env., mesmo modal/
  // fluxo da nota. Salva direto (fora do "Salvar Rascunho", desabilitado pós-envio).
  const openDiscrepancyModal = (it: ManifestItem) => {
    const existing = it.discrepancy;
    setDiscrepancyTab(existing?.type ?? 'falta');
    setDiscrepancyQty(existing && !existing.missingAll ? String(existing.qty || '') : '');
    setDiscrepancyMissingAll(existing?.missingAll ?? false);
    setDiscrepancyObs(existing?.obs ?? '');
    setDiscrepancyDisregarded(existing?.disregarded ?? false);
    setDiscrepancyModalItemId(it.id);
  };

  const persistDiscrepancy = async (itemId: string, data: DiscrepancyData) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, discrepancy: data } : it));
    await supabase.from('distribution_manifest_items').update({ discrepancy: data }).eq('id', itemId);
    setDiscrepancyModalItemId(null);
  };

  // Quantidade efetiva recebida — Qtd. Env. ajustada pela Falta/Sobra registrada, usada pra
  // alimentar o estoque da Empresa Destino na aprovação. Aplicada sempre que a divergência é
  // salva, independente do toggle "Confirmar divergência" (que agora só ajusta o Valor Total,
  // ver getDiscrepancyValueAdjustment). Diferente da nota (getEffectiveQty): aqui "sobra" soma
  // à quantidade, não subtrai — faz sentido pro contexto de recebimento (chegou mais do que
  // foi enviado).
  const getEffectiveReceivedQty = (it: ManifestItem): number => {
    const d = it.discrepancy;
    if (!d) return it.qty;
    if (d.type === 'falta') return d.missingAll ? 0 : Math.max(0, it.qty - (d.qty || 0));
    return it.qty + (d.qty || 0);
  };

  const canSend = editable && !!destinationCompanyId && items.length > 0;
  const canApprove = receiving && items.length > 0 && pendentes.length === 0;

  // Gera o PDF da nota de distribuição — mesmo padrão jsPDF + autoTable usado no PDF de
  // Pedido de Compra (components/orders/PurchaseOrderManager.tsx), adaptado pro cabeçalho e
  // colunas do manifesto (origem/destino, status, preço de venda destino quando já preenchido).
  const generateManifestPdf = () => {
    if (items.length === 0) return;
    setGeneratingPdf(true);
    try {
      const originName = companies.find(c => c.id === originCompanyId)?.nome_fantasia || 'Não definida';
      const destinationName = companies.find(c => c.id === destinationCompanyId)?.nome_fantasia || 'Não definida';
      const statusLabel = approved ? 'Aprovado' : receiving ? 'Pedido Enviado' : 'Registro';

      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text('Nota de Distribuição', 14, 20);
      doc.setFontSize(10);
      doc.text(`Manifesto: ${manifest.manifestNumber}`, 14, 28);
      doc.text(`Status: ${statusLabel}`, 14, 33);
      doc.text(`Empresa Origem: ${originName}`, 14, 40);
      doc.text(`Empresa Destino: ${destinationName}`, 14, 45);
      if (shippingDate) doc.text(`Data de Envio: ${new Date(shippingDate + 'T00:00:00').toLocaleDateString('pt-BR')}`, 120, 40);
      if (sentAt) doc.text(`Enviado em: ${fmtDateTimeBR(sentAt)}`, 120, 45);

      const showDestinationCols = receiving || approved;
      const headers = ['Descrição', 'EAN', 'Medida', 'Qtd. Env.', 'Preço Custo', 'Preço Venda Orig.'];
      if (showDestinationCols) headers.push('Preço Venda Dest.', 'Falta/Sobra');

      const discrepancyLabel = (it: ManifestItem) => {
        const d = it.discrepancy;
        if (!d) return '-';
        if (d.type === 'falta') return d.missingAll ? 'Falta (não veio)' : `Falta ${d.qty}`;
        return `Sobra ${d.qty}`;
      };

      const tableData = items.map(it => {
        const row: any[] = [it.productName, it.ean || '-', it.measure, it.qty, fmtBRL(it.costPrice), fmtBRL(it.salePriceOrigin)];
        if (showDestinationCols) row.push(it.salePriceDestination !== null ? fmtBRL(it.salePriceDestination) : '-', discrepancyLabel(it));
        return row;
      });

      autoTable(doc, {
        startY: 52,
        head: [headers],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [216, 30, 30], textColor: [255, 255, 255] },
        styles: { fontSize: 8 },
      });

      const finalY = (doc as any).lastAutoTable?.finalY || 52;
      doc.setFontSize(10);
      doc.text(`Valor Total (Custo): ${fmtBRL(itemsTotal)}`, 14, finalY + 8);

      doc.save(`Distribuicao_${manifest.manifestNumber}.pdf`);
      setPdfModalOpen(false);
    } catch (err) {
      console.error('Erro ao gerar PDF da distribuição:', err);
      setNotification({ type: 'error', message: 'Erro ao gerar arquivo PDF.' });
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Confirmar recebimento — trava definitivamente o manifesto e lança a quantidade recebida
  // (ou a enviada, se a loja destino não corrigiu) no estoque da Empresa Destino. É a "fase
  // futura" que distribuicao.sql deixou em aberto: até aqui, product_company_stock.count
  // nunca era tocado pelo fluxo de Distribuição.
  const handleApprove = async () => {
    if (!canApprove || !destinationCompanyId) return;
    setApproving(true);
    try {
      const { data: currentStock } = await supabase
        .from('product_company_stock')
        .select('product_id, count')
        .eq('company_id', destinationCompanyId)
        .in('product_id', items.map(it => it.productId).filter((id): id is string => !!id));
      const countByProduct: Record<string, number> = {};
      (currentStock || []).forEach((r: any) => { countByProduct[r.product_id] = parseFloat(r.count) || 0; });

      const nowIso = new Date().toISOString();
      await Promise.all(items.map(it => {
        const receivedQty = getEffectiveReceivedQty(it);
        const nextCount = (countByProduct[it.productId!] || 0) + receivedQty;
        const payload: any = {
          product_id: it.productId,
          company_id: destinationCompanyId,
          count: nextCount,
          cost_price: it.costPrice,
          price_received_date: nowIso.slice(0, 10),
          updated_at: nowIso,
        };
        if (it.salePriceDestination !== null) payload.price = it.salePriceDestination;
        return supabase.from('product_company_stock').upsert(payload, { onConflict: 'product_id,company_id' });
      }));

      const { error } = await supabase.from('distribution_manifests').update({
        status: 'aprovado',
        approved_by_id: colaboradorId || null,
        approved_by_name: colaboradorNome || null,
        approved_at: nowIso,
      }).eq('id', manifest.id);
      if (error) throw error;

      setStatus('aprovado');
      setApprovedByName(colaboradorNome || null);
      setApprovedAt(nowIso);
      setConfirmApproveOpen(false);
      setNotification({ type: 'success', message: 'Recebimento aprovado — estoque atualizado.' });
      onSaved();
      handleClose();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Erro ao aprovar recebimento.' });
    } finally {
      setApproving(false);
    }
  };

  const filteredCompanies = companies.filter(c => !originQuery || c.nome_fantasia.toLowerCase().includes(originQuery.toLowerCase()));

  // ── Estilos no formato da janela da nota (barra de título, abas Excel, faixa de ferramentas)
  const tbLabel = 'pl-px text-[9px] leading-none font-extrabold uppercase tracking-[0.1em] text-on-surface/25 whitespace-nowrap';
  const tbField = 'h-[30px] flex items-center px-2.5 border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-[13px] font-extrabold text-on-surface whitespace-nowrap';
  const ribGroup = 'self-stretch flex flex-col justify-end gap-1 px-3 border-r border-[#EFE8D2] dark:border-white/[0.05] last:border-r-0';
  const sqInput = 'h-8 w-full px-2.5 bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10] text-[13px] font-semibold text-on-surface outline-none caret-[#D81E1E] hover:border-[#CFC4A2] dark:hover:border-white/[0.20] focus:!border-[#D81E1E] focus:shadow-[0_0_0_2px_rgba(216,30,30,0.12)] placeholder:text-on-surface/25 placeholder:font-medium transition-[border-color,box-shadow] disabled:opacity-60';
  const thSq = 'sticky top-0 z-[1] h-[34px] px-2.5 bg-[#FFEC4D] text-left text-[9px] font-black uppercase tracking-[0.10em] text-[rgba(26,26,10,0.55)] whitespace-nowrap shadow-[inset_-1px_0_0_#B8A31F,inset_0_-1.5px_0_#8F7E10]';
  const tdSq = 'h-[38px] px-2.5 border-r border-b border-[#A8A290] dark:border-white/20 last:border-r-0 text-[12.5px] whitespace-nowrap overflow-hidden text-ellipsis';
  const cellIn = 'w-full h-[28px] px-2 bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10] font-mono text-[12px] text-on-surface outline-none caret-[#D81E1E] focus:!border-[#D81E1E] focus:shadow-[0_0_0_2px_rgba(216,30,30,0.12)] transition-[border-color,box-shadow]';
  const destinoNome = companies.find(c => c.id === destinationCompanyId)?.nome_fantasia || '';
  const statusBadge = approved
    ? { label: 'Aprovado', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25' }
    : receiving
      ? { label: 'Pedido enviado', cls: 'bg-[#0A7A55]/10 text-[#0A7A55] dark:text-[#34D399] border-[#0A7A55]/25' }
      : { label: 'Registro', cls: 'bg-amber-500/10 text-amber-700 dark:text-[#FCD34D] border-amber-500/30' };
  const buscaNorm = manifestBusca.trim().toLowerCase();
  const itensVisiveis = buscaNorm
    ? items.filter(it => it.productName.toLowerCase().includes(buscaNorm) || (it.sku || '').toLowerCase().includes(buscaNorm) || (eanAtual(it).ean || '').includes(buscaNorm))
    : items;
  const vincItem = vincItemId ? items.find(it => it.id === vincItemId && !it.productId) ?? null : null;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-[10px]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-md"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        className="relative w-full h-full bg-white dark:bg-[#1e1e18] rounded-none shadow-2xl overflow-hidden flex flex-col border border-line/60 dark:border-white/[0.06]"
      >
        {lockBlockedBy && (
          <div className="absolute inset-0 z-[250] flex items-center justify-center bg-black/45 backdrop-blur-[6px]">
            <div className="w-full max-w-[380px] mx-4 bg-white dark:bg-[#252520] border border-line dark:border-white/[0.08] shadow-2xl p-8 pb-7 text-center">
              <div className="w-14 h-14 bg-[#D81E1E]/10 dark:bg-[#D81E1E]/20 text-[#D81E1E] dark:text-[#FF6B6B] flex items-center justify-center mx-auto mb-4">
                <Lock size={24} />
              </div>
              <div className="text-[15px] font-black text-on-surface mb-1.5">Sendo editado agora</div>
              <div className="text-[12px] font-bold text-on-surface/55 mb-5">{lockBlockedBy.name}</div>
              <div className="flex items-center gap-2">
                <button onClick={handleClose} className="flex-1 h-10 border-[1.5px] border-on-surface/15 text-on-surface/55 text-[12.5px] font-bold hover:bg-on-surface/[0.04] transition-colors">
                  Fechar
                </button>
                <button
                  onClick={() => { setLockBlockedBy(null); acquireLock(); }}
                  disabled={checkingLock}
                  className="flex-1 h-10 bg-[#D81E1E] text-white text-[12.5px] font-black flex items-center justify-center gap-1.5 hover:bg-[#B91818] active:scale-[0.97] transition-all disabled:opacity-60"
                >
                  <RefreshCw size={13} className={checkingLock ? 'animate-spin' : ''} />
                  Verificar novamente
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── ① Barra de título: campos quadrados com rótulo em cima (como a da nota) ── */}
        <div className="flex items-end gap-3 pl-3.5 pr-4 pt-[9px] pb-2.5 bg-surface-container dark:bg-[#252520] shrink-0">
          <div className="w-[30px] h-[30px] bg-[#0A7A55]/10 text-[#0A7A55] dark:text-[#34D399] flex items-center justify-center shrink-0">
            <Package size={15} />
          </div>
          <div className="flex flex-col items-start gap-[3px] shrink-0">
            <span className={tbLabel}>Manifesto</span>
            <div className={cn(tbField, 'font-mono text-[12.5px] font-medium')}>{manifest.manifestNumber}</div>
          </div>
          <div className="flex flex-col items-start gap-[3px] shrink-0" ref={originRef}>
            <span className={tbLabel}>Origem</span>
            {editable && editingOrigin ? (
              <div className="relative">
                <div className={cn(tbField, 'w-[240px] px-0 focus-within:!border-[#D81E1E] focus-within:shadow-[0_0_0_2px_rgba(216,30,30,0.12)]')}>
                  <input
                    autoFocus
                    value={originQuery}
                    onChange={e => { setOriginQuery(e.target.value); setOriginOpen(true); if (!e.target.value) setOriginCompanyId(''); }}
                    onFocus={() => setOriginOpen(true)}
                    placeholder="Selecionar empresa origem…"
                    autoComplete="off"
                    className="flex-1 min-w-0 h-full px-2.5 bg-transparent border-none outline-none text-[13px] font-extrabold text-on-surface placeholder:font-medium placeholder:text-on-surface/25 caret-[#D81E1E]"
                  />
                  {originCompanyId && (
                    <button onClick={() => { setEditingOrigin(false); setOriginOpen(false); }} title="Confirmar"
                      className="w-[26px] h-full shrink-0 flex items-center justify-center border-l border-[#E0D8BF] dark:border-white/[0.10] text-[#D81E1E] hover:bg-on-surface/[0.06]">
                      <Check size={13} strokeWidth={3} />
                    </button>
                  )}
                </div>
                <AnimatePresence>
                  {originOpen && (
                    <motion.ul
                      initial={{ opacity: 0, y: -4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.13, ease: [0.23, 1, 0.32, 1] }}
                      className="absolute -left-px -right-px top-full mt-0.5 z-50 bg-white dark:bg-[#2E2E28] border border-[#E0D8BF] dark:border-white/10 shadow-[0_16px_36px_-10px_rgba(0,0,0,0.28)] max-h-56 overflow-y-auto"
                    >
                      {filteredCompanies.map(c => (
                        <li key={c.id} onMouseDown={() => { setOriginCompanyId(c.id); setOriginQuery(c.nome_fantasia); setOriginOpen(false); }}
                          className="flex items-center gap-2 px-2.5 py-2 text-[12.5px] font-semibold text-on-surface hover:bg-[#FFF8D0] dark:hover:bg-[#FFE500]/[0.08] cursor-pointer transition-colors">
                          <span className="truncate">{c.nome_fantasia}</span>
                          {c.id === originCompanyId && <Check size={13} className="text-[#D81E1E] shrink-0 ml-auto" />}
                        </li>
                      ))}
                      {filteredCompanies.length === 0 && <li className="px-2.5 py-2 text-[12.5px] text-on-surface/35 italic">Nenhuma loja encontrada</li>}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className={cn(tbField, 'gap-2', !editable && 'bg-transparent text-on-surface/60')}>
                {companies.find(c => c.id === originCompanyId)?.nome_fantasia || <span className="text-on-surface/30 font-medium">Selecionar…</span>}
                {editable && (
                  <button onClick={() => { setEditingOrigin(true); setOriginQuery(companies.find(c => c.id === originCompanyId)?.nome_fantasia || ''); }}
                    className="text-on-surface/30 hover:text-on-surface/70" title="Editar empresa origem"><Pencil size={12} /></button>
                )}
              </div>
            )}
          </div>
          <ArrowRight size={14} className="self-end mb-2 text-on-surface/25 shrink-0" />
          <div className="flex flex-col items-start gap-[3px] shrink-0">
            <span className={tbLabel}>Destino{editable && <span className="text-[#D81E1E]"> *</span>}</span>
            {editable ? (
              <select value={destinationCompanyId} onChange={e => setDestinationCompanyId(e.target.value)}
                className={cn(tbField, 'min-w-[180px] cursor-pointer outline-none focus:!border-[#D81E1E]', !destinationCompanyId && '!border-[#D81E1E]/55 !bg-[#D81E1E]/[0.05] text-[#D81E1E]')}>
                <option value="">Selecionar…</option>
                {companies.filter(c => c.id !== originCompanyId).map(c => <option key={c.id} value={c.id}>{c.nome_fantasia}</option>)}
              </select>
            ) : (
              <div className={tbField}>{destinoNome || '—'}</div>
            )}
          </div>
          {sourceNote && (
            <div className="flex flex-col items-start gap-[3px] shrink-0">
              <span className={tbLabel}>Nota de origem</span>
              <div className={cn(tbField, 'font-mono text-[12.5px] font-medium bg-transparent text-on-surface/60')}>NF {sourceNote.numero || '—'}</div>
            </div>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-2.5 self-center shrink-0">
            <span className={cn('h-[26px] px-[11px] flex items-center gap-1.5 rounded-full border text-[10px] font-black uppercase tracking-[0.08em]', statusBadge.cls)}>
              ● {statusBadge.label}
            </span>
            <button onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center border border-on-surface/[0.11] text-on-surface/40 hover:bg-[#D81E1E]/[0.09] hover:text-[#D81E1E] hover:border-[#D81E1E]/25 active:scale-[0.93] transition-all duration-[130ms]">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── ② Abas estilo Excel ── */}
        <div className="flex items-end gap-0.5 bg-surface-container dark:bg-[#252520] border-b border-line dark:border-white/[0.08] shrink-0">
          {([
            { key: 'produtos', label: 'Produtos', icon: <FileText size={13} /> },
            { key: 'recebimento', label: 'Situação', icon: <ListChecks size={13} /> },
          ] as const).map(t => {
            const on = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  'relative -mb-px h-[34px] px-4 flex items-center gap-[7px] whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.08em] border border-b-0 transition-colors duration-[130ms]',
                  on
                    ? 'bg-white dark:bg-[#1e1e18] text-on-surface border-line dark:border-white/[0.08] first:border-l-transparent before:absolute before:-left-px before:-right-px before:-top-px before:h-[3px] before:bg-[#FFE500] before:shadow-[inset_0_-1px_0_#D4C000]'
                    : 'border-transparent text-on-surface/40 hover:text-on-surface hover:bg-on-surface/[0.06]',
                )}
              >
                <span className="opacity-80">{t.icon}</span>
                {t.label}
                {t.key === 'produtos' && (
                  pendentes.length > 0
                    ? <span className="bg-amber-400/25 text-[#92400E] dark:text-[#FCD34D] text-[9.5px] font-black px-1.5 py-px rounded-full tracking-normal">{pendentes.length} pend.</span>
                    : <span className="bg-on-surface/[0.11] text-on-surface/60 text-[9.5px] font-black px-1.5 py-px rounded-full tracking-normal">{items.length}</span>
                )}
              </button>
            );
          })}
        </div>

        {activeTab === 'produtos' ? (<>
          {/* ── ③ Faixa de ferramentas ── */}
          <div className="flex items-end min-h-[62px] px-2.5 pt-[7px] pb-[9px] bg-white dark:bg-[#1e1e18] border-b border-line dark:border-white/[0.07] shrink-0">
            {editable ? (
              <div className={cn(ribGroup, 'flex-1 min-w-[280px]')}>
                <span className={tbLabel}>Adicionar produto</span>
                {originCompanyId ? (
                  <div className="grid grid-cols-2 gap-1.5 max-w-[620px]">
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface/30 pointer-events-none" />
                      <input value={descQuery} onChange={e => { setDescQuery(e.target.value); if (e.target.value) setEanQuery(''); }} placeholder="Buscar por descrição…" className={cn(sqInput, 'pl-8')} />
                    </div>
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface/30 pointer-events-none" />
                      <input value={eanQuery} onChange={e => { setEanQuery(e.target.value); if (e.target.value) setDescQuery(''); }} placeholder="Buscar por EAN…" className={cn(sqInput, 'pl-8 font-mono')} />
                    </div>
                  </div>
                ) : (
                  <div className="h-8 flex items-center text-[12px] font-semibold text-on-surface/40">Selecione a Empresa Origem para buscar produtos.</div>
                )}
              </div>
            ) : (
              <div className={cn(ribGroup, 'flex-1 min-w-[280px]')}>
                <span className={tbLabel}>Buscar no manifesto</span>
                <div className="relative max-w-[460px]">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface/30 pointer-events-none" />
                  <input value={manifestBusca} onChange={e => setManifestBusca(e.target.value)} placeholder="Produto, SKU ou EAN..." className={cn(sqInput, 'pl-8')} />
                </div>
              </div>
            )}
            {(pendentes.length > 0 || items.some(it => it.sourceIdx != null)) && !editable && (
              <div className={ribGroup}>
                <span className={tbLabel}>Pendências de vínculo</span>
                {pendentes.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setVincItemId(pendentes[0].id)}
                      disabled={approved}
                      className="h-8 px-[11px] flex items-center gap-1.5 border border-amber-400/60 bg-amber-400/[0.18] text-[#92400E] dark:text-[#FCD34D] text-[10.5px] font-extrabold uppercase tracking-[0.07em] whitespace-nowrap hover:bg-amber-400/[0.28] active:scale-[0.97] transition-all"
                    >
                      <Zap size={13} /> Resolver pendências ({pendentes.length})
                    </button>
                  </div>
                ) : (
                  <div className="h-8 px-[11px] flex items-center gap-1.5 border border-[#0A7A55]/25 bg-[#0A7A55]/[0.08] text-[#0A7A55] dark:text-[#34D399] text-[10.5px] font-extrabold uppercase tracking-[0.07em] whitespace-nowrap">
                    <Check size={13} strokeWidth={3} /> Todos vinculados
                  </div>
                )}
              </div>
            )}
            {items.length > 0 && (
              <div className={ribGroup}>
                <span className={tbLabel}>Arquivo</span>
                <button onClick={() => setPdfModalOpen(true)} title="Baixar PDF"
                  className="w-8 h-8 flex items-center justify-center bg-blue-500/10 text-blue-500 border border-blue-500/15 hover:bg-blue-500/[0.16] active:scale-95 transition-all">
                  <FileText size={15} />
                </button>
              </div>
            )}
          </div>

          {pendentes.length > 0 && (
            <div className="flex items-center gap-2.5 px-3.5 py-[7px] bg-amber-50 dark:bg-amber-400/[0.07] border-b border-amber-400/50 text-[11.5px] font-semibold text-[#92400E] dark:text-[#FCD34D] shrink-0">
              <Zap size={13} className="shrink-0" />
              <span className="shrink-0"><b className="font-black">{pendentes.length} {pendentes.length === 1 ? 'item veio' : 'itens vieram'} da nota sem produto do cadastro.</b> Vincule ou crie cada um (⚡ na linha ou &ldquo;Resolver pendências&rdquo;) para liberar a aprovação.</span>
              <span className="ml-auto flex gap-1 flex-wrap justify-end min-w-0">
                {pendentes.slice(0, 6).map(it => (
                  <button key={it.id} onClick={() => setVincItemId(it.id)}
                    className="text-[10px] font-extrabold px-1.5 leading-[18px] bg-white dark:bg-[#252520] border border-amber-400/55 text-on-surface truncate max-w-[180px] hover:border-[#D81E1E]">
                    {it.productName}
                  </button>
                ))}
                {pendentes.length > 6 && <span className="text-[10px] font-black">+{pendentes.length - 6}</span>}
              </span>
            </div>
          )}

          {/* Corpo da aba Produtos */}
          <div className="flex-1 overflow-auto">
            {editable && originCompanyId && (creatingFormOpen || selectedProduct || descQuery || eanQuery) && (
              <div className="p-3.5 pb-0 space-y-2.5 max-w-3xl">
                {!creatingFormOpen && (descQuery || eanQuery) && !selectedProduct && (
                  <div className="bg-white dark:bg-[#1E1E18] border border-[#E0D8BF] dark:border-white/[0.10]">
                    {searchLoading ? (
                      <div className="px-3 py-2.5 text-xs font-bold text-on-surface/35">Buscando…</div>
                    ) : searchResults.length > 0 ? (
                      searchResults.map((p, i) => (
                        <button key={p.id} onClick={() => selectProduct(p)}
                          className={cn('w-full text-left h-[34px] px-3 flex items-center justify-between gap-2 border-b last:border-b-0 border-[#EFE8D2] dark:border-white/[0.06] hover:bg-[#FFF8D0] dark:hover:bg-[#FFE500]/[0.06] transition-colors', i % 2 && 'bg-[#FAF7EE] dark:bg-[#1A1A15]')}>
                          <span className="text-[12.5px] font-extrabold text-on-surface truncate">{p.name}</span>
                          <span className="font-mono text-[11px] text-on-surface/40 shrink-0">{p.sku || p.ean || '—'}</span>
                        </button>
                      ))
                    ) : (
                      <button onClick={openCreateForm} className="w-full h-[34px] flex items-center justify-center gap-2 text-[#D81E1E] text-[12px] font-black hover:bg-[#D81E1E]/5 transition-colors">
                        <Zap size={13} /> {`Criar e Vincular "${(descQuery || eanQuery).trim()}"`}
                      </button>
                    )}
                  </div>
                )}

                {creatingFormOpen && (
                  <div className="bg-[#F1EAD3] dark:bg-[#181814] border border-[#E0D8BF] dark:border-white/[0.10]">
                    <div className="h-7 flex items-center gap-2 px-2.5 bg-[#FFEC4D] border-b-[1.5px] border-[#8F7E10]">
                      <Package size={13} className="text-[#D81E1E]" />
                      <span className="text-[9px] font-black uppercase tracking-[0.1em] text-[rgba(26,26,10,0.55)]">Criar novo produto</span>
                      <button onClick={() => setCreatingFormOpen(false)} className="ml-auto text-[10px] font-black uppercase tracking-[0.05em] text-[rgba(26,26,10,0.55)] hover:text-[#D81E1E]">← Voltar para busca</button>
                    </div>
                    <div className="m-2.5 grid grid-cols-2 gap-2.5">
                      <div className="col-span-2">
                        <label className="block text-[9px] font-black uppercase tracking-[0.1em] text-on-surface/55 mb-1">Nome do Produto</label>
                        <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} className={sqInput} placeholder="Nome do produto" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-[0.1em] text-on-surface/55 mb-1">SKU (Código Interno)</label>
                        <input value={newSku} onChange={e => setNewSku(e.target.value)} className={sqInput} placeholder="Opcional" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-[0.1em] text-on-surface/55 mb-1">Código EAN</label>
                        <input value={newEan} onChange={e => setNewEan(e.target.value)} className={cn(sqInput, 'font-mono')} placeholder="Opcional" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-[0.1em] text-on-surface/55 mb-1">Preço de Custo (Origem)</label>
                        <input value={newCost} onChange={e => setNewCost(e.target.value)} className={cn(sqInput, 'font-mono text-right')} placeholder="0,00" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-[0.1em] text-on-surface/55 mb-1">Preço de Venda (Origem)</label>
                        <input value={newSale} onChange={e => setNewSale(e.target.value)} className={cn(sqInput, 'font-mono text-right')} placeholder="0,00" />
                      </div>
                      <button onClick={handleSubmitCreateForm} disabled={creatingProduct || !newName.trim()}
                        className="col-span-2 h-9 bg-[#D81E1E] text-white text-[11.5px] font-extrabold uppercase tracking-[0.04em] flex items-center justify-center gap-2 hover:bg-[#B91818] active:scale-[0.99] transition-all disabled:opacity-40">
                        {creatingProduct ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-r-transparent" /> : <Plus size={14} strokeWidth={3} />}
                        {creatingProduct ? 'Criando…' : 'Criar e Vincular'}
                      </button>
                    </div>
                  </div>
                )}

                {!creatingFormOpen && selectedProduct && (
                  <div className={cn('bg-white dark:bg-[#1E1E18] border p-3', isDuplicateOfSelected ? 'border-[#D81E1E]/50' : 'border-[#E0D8BF] dark:border-white/[0.10]')}>
                    <div className="grid grid-cols-4 gap-px bg-[#E0D8BF] dark:bg-white/[0.10] border border-[#E0D8BF] dark:border-white/[0.10] mb-2.5">
                      {[
                        ['Descrição', selectedProduct.name, 'col-span-4'],
                        ['EAN', selectedProduct.ean || '—', isDuplicateOfSelected ? 'text-[#D81E1E]' : ''],
                        ['SKU', selectedProduct.sku || '—', ''],
                        ['Custo (Origem)', fmtBRL(selectedProduct.costPrice), ''],
                        ['Venda (Origem)', fmtBRL(selectedProduct.salePriceOrigin), 'text-on-surface/55'],
                      ].map(([l, v, c]) => (
                        <div key={l} className={cn('bg-white dark:bg-[#1E1E18] px-2.5 py-1.5 min-w-0', c.includes('col-span') && c)}>
                          <div className="text-[8px] font-black uppercase tracking-wider text-on-surface/40">{l}</div>
                          <div className={cn('text-[12.5px] font-bold truncate', l !== 'Descrição' && 'font-mono', !c.includes('col-span') && c)}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {isDuplicateOfSelected ? (
                      <div className="flex items-center gap-2 border border-[#D81E1E]/30 bg-[#D81E1E]/[0.06] px-2.5 py-2">
                        <AlertTriangle size={14} className="text-[#D81E1E] shrink-0" />
                        <p className="flex-1 text-[12px] font-bold text-[#D81E1E]">Este produto já está na lista. Somar {duplicatePendingQty} un. à quantidade existente?</p>
                        <button onClick={cancelDuplicateMerge} className="h-8 px-3 border border-[#E0D8BF] dark:border-white/[0.10] text-[11px] font-extrabold uppercase">Cancelar</button>
                        <button onClick={confirmDuplicateMerge} className="h-8 px-3 bg-[#D81E1E] text-white text-[11px] font-extrabold uppercase">Sim, somar</button>
                      </div>
                    ) : (
                      <div className="flex gap-2 items-end">
                        <div className="w-40">
                          <div className="text-[9px] font-black uppercase tracking-[0.1em] text-on-surface/55 mb-1">Quantidade a enviar</div>
                          <input autoFocus value={qtyInput} onChange={e => setQtyInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleConfirmAddItem(); }} placeholder="0" className={cn(sqInput, 'font-mono text-right')} />
                        </div>
                        <button onClick={handleConfirmAddItem} className="h-8 px-4 bg-[#D81E1E] text-white text-[11px] font-extrabold uppercase tracking-[0.04em] flex items-center gap-1.5 hover:bg-[#B91818] active:scale-[0.97] transition-all">
                          <CheckCircle2 size={13} /> Confirmar
                        </button>
                        <button onClick={() => { setSelectedProduct(null); setQtyInput(''); }} className="h-8 px-3 border border-[#E0D8BF] dark:border-white/[0.10] text-[11px] font-extrabold uppercase text-on-surface/55 hover:bg-on-surface/[0.05]">
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {loadingItems ? (
              <p className="text-xs font-bold text-on-surface/30 py-10 text-center">Carregando produtos…</p>
            ) : items.length === 0 ? (
              <p className="text-xs font-bold text-on-surface/30 py-10 text-center">Nenhum produto adicionado ainda.</p>
            ) : (
              <div className={cn(editable && (creatingFormOpen || selectedProduct || descQuery || eanQuery) && 'mt-3.5 border-t border-[#E0D8BF] dark:border-white/[0.10]')}>
                <table className="w-full min-w-[1100px] table-fixed border-collapse">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col />
                    <col style={{ width: 170 }} />
                    <col style={{ width: 76 }} />
                    <col style={{ width: editable ? 100 : 170 }} />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 120 }} />
                    {!editable && <col style={{ width: 120 }} />}
                    <col style={{ width: 86 }} />
                    {editable && <col style={{ width: 48 }} />}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className={cn(thSq, 'text-center')}>#</th>
                      <th className={thSq}>Produto</th>
                      <th className={thSq}>EAN</th>
                      <th className={thSq}>Medida</th>
                      <th className={cn(thSq, 'text-right')}>Qtd. Env.</th>
                      <th className={cn(thSq, 'text-right')}>Preço Custo</th>
                      <th className={cn(thSq, 'text-right')}>Valor Total</th>
                      {!editable && <th className={cn(thSq, 'text-right')}>Preço Venda</th>}
                      <th className={cn(thSq, 'text-right', !editable && 'shadow-[inset_0_-1.5px_0_#8F7E10]')}>Markup</th>
                      {editable && <th className={cn(thSq, 'shadow-[inset_0_-1.5px_0_#8F7E10]')} />}
                    </tr>
                  </thead>
                  <tbody>
                    {itensVisiveis.map(it => {
                      const idx = items.indexOf(it);
                      const pendente = !it.productId;
                      const total = it.qty * it.costPrice + getDiscrepancyValueAdjustment(it);
                      const markup = it.costPrice > 0 && it.salePriceDestination !== null
                        ? ((it.salePriceDestination - it.costPrice) / it.costPrice) * 100
                        : null;
                      const effQty = getEffectiveReceivedQty(it);
                      const showRecalc = !editable && !!it.discrepancy && effQty !== it.qty;
                      const isRowFocused = focusedItemId === it.id;
                      const { ean, daNota } = eanAtual(it);
                      return (
                        <tr
                          key={it.id}
                          className={cn(
                            'transition-colors',
                            pendente ? 'bg-amber-50 dark:bg-amber-400/[0.06]' : idx % 2 === 0 ? 'bg-white dark:bg-[#252520]' : 'bg-[#FAF7EE] dark:bg-[#1E1E18]',
                            !pendente && 'hover:bg-[#FFF8D0] dark:hover:bg-white/[0.03]',
                            isRowFocused && '!bg-on-surface/[0.075] dark:!bg-white/[0.065]',
                          )}
                          onFocus={() => setFocusedItemId(it.id)}
                          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocusedItemId(null); }}
                        >
                          <td className={cn(tdSq, 'text-center text-[10px] font-black', isRowFocused ? 'text-[#D81E1E]' : 'text-on-surface/30')}>{idx + 1}</td>
                          <td className={tdSq}>
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="flex-1 min-w-0">
                                <div className="text-[12.5px] font-extrabold text-on-surface truncate" title={it.productName}>{it.productName}</div>
                                {pendente ? (
                                  <div className="text-[10.5px] font-semibold text-on-surface/45 truncate">
                                    <span className="font-extrabold text-[#92400E] dark:text-[#FCD34D]">Não Encontrado</span>
                                    {it.sourceIdx != null && ` · linha ${it.sourceIdx + 1} da nota`}
                                  </div>
                                ) : it.sku ? (
                                  <div className="text-[10.5px] font-semibold text-on-surface/35 truncate">SKU {it.sku}</div>
                                ) : null}
                              </div>
                              {pendente && !approved && (
                                <div className="relative group shrink-0">
                                  <button
                                    onClick={() => setVincItemId(it.id)}
                                    className="w-[26px] h-[26px] flex items-center justify-center border border-dashed border-[#E0D8BF] dark:border-white/[0.15] bg-white dark:bg-[#1E1E18] text-on-surface/40 hover:bg-primary/10 hover:border-primary/40 hover:text-primary active:scale-90 transition-all"
                                  >
                                    <Zap size={12} />
                                  </button>
                                  <span className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 scale-95 opacity-0 group-hover:opacity-100 group-hover:scale-100 transition-all bg-[#1A1A0E] text-[#F2F0E3] text-[10px] font-bold px-[7px] py-[3px] whitespace-nowrap z-10">
                                    Criar e Vincular
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className={cn(tdSq, 'font-mono text-[11.5px] text-on-surface/55')}>
                            {ean || <span className="text-on-surface/25">—</span>}
                            {daNota && <span className="ml-1.5 text-[8.5px] font-black uppercase tracking-[0.04em] text-[#2563EB] dark:text-[#60A5FA]" title="EAN preenchido na nota depois do envio">↻ da nota</span>}
                          </td>
                          <td className={tdSq}>
                            {editable ? (
                              <input value={it.measure} onChange={e => updateItemField(it.id, { measure: e.target.value.toUpperCase().slice(0, 6) })} className={cn(cellIn, 'text-center font-sans font-bold')} placeholder="UN" />
                            ) : <span className="font-bold text-on-surface/70">{it.measure}</span>}
                          </td>
                          <td className={tdSq}>
                            {editable ? (
                              <input type="number" min="0" value={it.qty} onChange={e => updateItemField(it.id, { qty: parseFloat(e.target.value) || 0 })} className={cn(cellIn, 'text-right')} />
                            ) : (
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <button
                                    onClick={() => openDiscrepancyModal(it)}
                                    title={it.discrepancy
                                      ? (it.discrepancy.type === 'falta'
                                          ? (it.discrepancy.missingAll ? 'Falta — não veio (clique para editar)' : `Falta ${it.discrepancy.qty} (clique para editar)`)
                                          : `Sobra ${it.discrepancy.qty} (clique para editar)`)
                                      : 'Registrar Falta/Sobra'}
                                    className={cn(
                                      'flex items-center justify-center w-5 h-5 border-[1.5px] transition-colors shrink-0',
                                      it.discrepancy?.type === 'falta'
                                        ? 'text-[#D81E1E] border-[#D81E1E]/40 bg-[#D81E1E]/10 hover:bg-[#D81E1E]/20'
                                        : it.discrepancy?.type === 'sobra'
                                          ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20'
                                          : 'text-on-surface/30 border-on-surface/20 hover:text-on-surface/55 hover:border-on-surface/35'
                                    )}
                                  >
                                    {it.discrepancy?.type === 'falta' ? <ArrowDown size={11} /> : it.discrepancy?.type === 'sobra' ? <ArrowUp size={11} /> : <Plus size={11} />}
                                  </button>
                                  <span className={cn('font-mono font-black', showRecalc ? (it.discrepancy!.type === 'falta' ? 'text-[#D81E1E]' : 'text-emerald-600 dark:text-emerald-400') : '')}>{effQty}</span>
                                  {showRecalc && <span className="text-[9px] font-bold text-on-surface/30 line-through shrink-0">{it.qty}</span>}
                                </div>
                                {!it.discrepancy && !pendente && (
                                  <label className="flex items-center gap-1 cursor-pointer shrink-0" title="Sem divergência — confirmar item">
                                    <input type="checkbox" checked={it.verified} disabled={!receiving}
                                      onChange={e => updateItemPricing(it.id, it.productId!, it.salePriceDestination, e.target.checked)}
                                      className="w-3.5 h-3.5 accent-emerald-600 cursor-pointer disabled:cursor-not-allowed" />
                                    {it.verified && <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400">OK</span>}
                                  </label>
                                )}
                              </div>
                            )}
                          </td>
                          <td className={cn(tdSq, 'text-right font-mono text-on-surface/70')}>{fmtBRL(it.costPrice)}</td>
                          <td className={cn(tdSq, 'text-right font-mono font-black')}>{fmtBRL(total)}</td>
                          {!editable && (
                            <td className={cn(tdSq, 'text-right')}>
                              {pendente ? <span className="text-on-surface/25">—</span> : receiving ? (
                                <input type="text" inputMode="decimal"
                                  defaultValue={it.salePriceDestination !== null ? it.salePriceDestination.toFixed(2).replace('.', ',') : ''}
                                  placeholder="0,00"
                                  onBlur={e => { const n = parseFloat(e.target.value.replace(',', '.')); updateItemPricing(it.id, it.productId!, isNaN(n) ? null : n, it.verified); }}
                                  className={cn(cellIn, 'text-right')} />
                              ) : <span className="font-mono">{it.salePriceDestination !== null ? fmtBRL(it.salePriceDestination) : '—'}</span>}
                            </td>
                          )}
                          <td className={cn(tdSq, 'text-right font-mono font-black', markup === null ? 'text-on-surface/30' : markup >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#D81E1E]')}>
                            {markup === null ? '—' : `${markup >= 0 ? '+' : ''}${markup.toFixed(1)}%`}
                          </td>
                          {editable && (
                            <td className={cn(tdSq, 'text-center')}>
                              <button onClick={() => removeItem(it.id)} className="w-7 h-7 inline-flex items-center justify-center text-on-surface/40 hover:bg-[#D81E1E]/10 hover:text-[#D81E1E] transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {itensVisiveis.length === 0 && (
                      <tr><td colSpan={10} className="py-8 text-center text-[12px] italic text-on-surface/35">Nenhum produto encontrado para &ldquo;{manifestBusca}&rdquo;.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>) : (<>
          {/* ── Aba Situação ── */}
          <div className="flex items-end min-h-[62px] px-2.5 pt-[7px] pb-[9px] bg-white dark:bg-[#1e1e18] border-b border-line dark:border-white/[0.07] shrink-0">
            <div className={ribGroup}>
              <span className={tbLabel}>Data de envio</span>
              <input type="date" value={shippingDate} disabled={!editable} onChange={e => setShippingDate(e.target.value)} className={cn(sqInput, 'w-[160px] font-mono')} />
            </div>
            {createdByName && (
              <div className={ribGroup}>
                <span className={tbLabel}>Criado por</span>
                <div className="h-8 flex items-center text-[12px] font-bold text-on-surface/60 whitespace-nowrap">{createdByName} · {fmtDateTimeBR(createdAt)}</div>
              </div>
            )}
            {sentByName && (
              <div className={ribGroup}>
                <span className={tbLabel}>Enviado por</span>
                <div className="h-8 flex items-center text-[12px] font-bold text-on-surface/60 whitespace-nowrap">{sentByName} · {fmtDateTimeBR(sentAt)}</div>
              </div>
            )}
            {approvedByName && (
              <div className={ribGroup}>
                <span className={tbLabel}>Aprovado por</span>
                <div className="h-8 flex items-center text-[12px] font-bold text-on-surface/60 whitespace-nowrap">{approvedByName} · {fmtDateTimeBR(approvedAt)}</div>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-auto px-4 pt-[18px] pb-[22px] flex flex-col gap-3">
            <span className="pl-px text-[9px] font-extrabold uppercase tracking-[0.1em] text-on-surface/25">Situação do manifesto</span>
            <div className="grid grid-cols-3 gap-2 max-w-[820px]">
              {/* Registro */}
              <div className={cn('relative flex items-center gap-2.5 px-3 py-[11px] border bg-white dark:bg-[#1E1E18]',
                status === 'registro' ? 'border-amber-500/40 text-amber-700 dark:text-[#FCD34D] before:absolute before:-left-px before:-right-px before:-top-px before:h-[3px] before:bg-current' : 'border-[#E0D8BF] dark:border-white/[0.10] text-[#0A7A55] dark:text-[#34D399]')}>
                <span className={cn('w-7 h-7 grid place-items-center shrink-0', status === 'registro' ? 'bg-amber-500/15' : 'bg-[#0A7A55]/10')}>{status === 'registro' ? <Pencil size={13} /> : <Check size={14} strokeWidth={3} />}</span>
                <span><b className="block text-[11.5px] font-black">Registro</b><small className="block text-[10px] font-semibold opacity-80">{status === 'registro' ? 'Editável' : 'Concluído'}</small></span>
              </div>
              {/* Pedido Enviado */}
              <button
                onClick={() => canSend && setConfirmSendOpen(true)}
                disabled={!canSend}
                className={cn('relative flex items-center gap-2.5 px-3 py-[11px] border bg-white dark:bg-[#1E1E18] text-left transition-colors',
                  status === 'pedido_enviado' ? 'border-amber-500/40 text-amber-700 dark:text-[#FCD34D] before:absolute before:-left-px before:-right-px before:-top-px before:h-[3px] before:bg-current'
                  : status === 'aprovado' ? 'border-[#E0D8BF] dark:border-white/[0.10] text-[#0A7A55] dark:text-[#34D399]'
                  : canSend ? 'border-[#D81E1E]/40 text-[#D81E1E] hover:bg-[#D81E1E]/[0.05] cursor-pointer'
                  : 'border-[#E0D8BF] dark:border-white/[0.10] text-on-surface/35 cursor-not-allowed')}
              >
                <span className="w-7 h-7 grid place-items-center shrink-0 bg-on-surface/[0.06]">{status === 'aprovado' ? <Check size={14} strokeWidth={3} /> : <CheckCircle2 size={14} />}</span>
                <span><b className="block text-[11.5px] font-black">Pedido Enviado</b><small className="block text-[10px] font-semibold opacity-80">
                  {status === 'aprovado' ? 'Concluído' : status === 'pedido_enviado' ? 'Aguardando aprovação' : canSend ? 'Clique para confirmar' : 'Bloqueado'}
                </small></span>
              </button>
              {/* Aprovado */}
              <button
                onClick={() => canApprove && setConfirmApproveOpen(true)}
                disabled={!canApprove}
                className={cn('relative flex items-center gap-2.5 px-3 py-[11px] border bg-white dark:bg-[#1E1E18] text-left transition-colors',
                  status === 'aprovado' ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400 before:absolute before:-left-px before:-right-px before:-top-px before:h-[3px] before:bg-current'
                  : canApprove ? 'border-[#0A7A55] text-[#0A7A55] dark:text-[#34D399] bg-[#0A7A55]/[0.06] hover:bg-[#0A7A55]/[0.1] cursor-pointer before:absolute before:-left-px before:-right-px before:-top-px before:h-[3px] before:bg-current'
                  : 'border-[#E0D8BF] dark:border-white/[0.10] text-on-surface/40 cursor-not-allowed')}
              >
                <span className={cn('w-7 h-7 grid place-items-center shrink-0', canApprove ? 'bg-[#0A7A55] text-white' : 'bg-on-surface/[0.06]')}>
                  {status === 'aprovado' || canApprove ? <Check size={14} strokeWidth={3} /> : <Lock size={13} />}
                </span>
                <span><b className={cn('block text-[11.5px] font-black', !canApprove && status !== 'aprovado' && 'text-on-surface')}>Aprovado</b><small className={cn('block text-[10px] font-semibold', receiving && pendentes.length > 0 ? 'text-[#D81E1E]' : 'opacity-80')}>
                  {status === 'aprovado' ? 'Estoque atualizado'
                    : canApprove ? 'Clique para aprovar o recebimento'
                    : receiving && pendentes.length > 0 ? `Bloqueado · ${pendentes.length} ${pendentes.length === 1 ? 'item' : 'itens'} sem produto`
                    : 'Bloqueado'}
                </small></span>
              </button>
            </div>
            <div className="max-w-[820px] flex items-start gap-2 border border-[#E0D8BF] dark:border-white/[0.10] bg-[#FAF7EE] dark:bg-[#1A1A15] px-3 py-2.5">
              <Info size={13} className="text-on-surface/40 shrink-0 mt-0.5" />
              <p className="text-[11px] font-bold text-on-surface/55 leading-relaxed">
                {status === 'registro'
                  ? (canSend ? 'Confirmar o envio trava a lista de produtos — esta ação não pode ser desfeita.' : 'Adicione ao menos 1 produto e selecione a Empresa Destino para enviar.')
                  : status === 'pedido_enviado'
                    ? (pendentes.length > 0
                        ? `Antes de aprovar, vincule os ${pendentes.length} ${pendentes.length === 1 ? 'item pendente' : 'itens pendentes'} na aba Produtos (⚡ ou "Resolver pendências").`
                        : 'Confira o Falta/Sobra e o Preço de Venda item a item na aba Produtos. Aprovar atualiza o estoque da Empresa Destino e não pode ser desfeito.')
                    : 'Estoque da Empresa Destino atualizado com as quantidades recebidas.'}
              </p>
            </div>
          </div>
        </>)}

        {vincItem && (
          <VincularProdutoModal
            key={vincItem.id}
            item={{
              descricao: linhaDaNota(vincItem)?.original_description || vincItem.productName,
              ean: eanAtual(vincItem).ean,
              qtd: vincItem.qty,
              custo: vincItem.costPrice,
              supplierCode: linhaDaNota(vincItem)?.supplier_code ?? null,
              linhaNota: vincItem.sourceIdx != null ? vincItem.sourceIdx + 1 : null,
            }}
            contexto={`Manifesto · ${destinoNome || 'destino'}`}
            lojaPreco={destinoNome || 'Loja destino'}
            pendencia={{
              pos: pendentes.findIndex(p => p.id === vincItem.id) + 1,
              total: pendentes.length,
              onPular: () => setVincItemId(proximaPendente(vincItem.id)),
            }}
            supplierId={sourceNote?.supplierId ?? null}
            notaNumero={sourceNote?.numero ?? null}
            podeVincularNota={!!sourceNote && vincItem.sourceIdx != null && !linhaDaNota(vincItem)?.product_id}
            onClose={() => setVincItemId(null)}
            onVincular={(p, preco, vincNota) => handleVinculado(vincItem, p, preco, vincNota)}
          />
        )}

        {/* Confirmação de envio — irreversível, ver Etapa 5 do plano */}
        <AnimatePresence>
          {confirmSendOpen && (
            <div className="absolute inset-0 z-[220] flex items-center justify-center bg-black/45 backdrop-blur-[6px]">
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="w-full max-w-[380px] mx-4 bg-white dark:bg-[#252520] border border-line dark:border-white/[0.08] rounded-[22px] shadow-2xl p-8 pb-7 text-center"
              >
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={26} />
                </div>
                <div className="text-[15px] font-black text-on-surface mb-1.5">Confirmar envio?</div>
                <p className="text-[12px] font-bold text-on-surface/55 mb-5 leading-relaxed">
                  A lista de produtos será travada e esta ação não pode ser desfeita.
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setConfirmSendOpen(false)} className="flex-1 h-10 rounded-xl border-[1.5px] border-on-surface/15 text-on-surface/55 text-[12.5px] font-bold hover:bg-on-surface/[0.04] transition-colors">
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmSend}
                    disabled={sending}
                    className="flex-1 h-10 rounded-xl bg-emerald-600 text-white text-[12.5px] font-black flex items-center justify-center gap-1.5 hover:bg-emerald-700 active:scale-[0.97] transition-all disabled:opacity-60"
                  >
                    {sending ? 'Enviando…' : 'Confirmar Envio'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Confirmação de aprovação — atualiza estoque da Empresa Destino, irreversível */}
        <AnimatePresence>
          {confirmApproveOpen && (
            <div className="absolute inset-0 z-[220] flex items-center justify-center bg-black/45 backdrop-blur-[6px]">
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="w-full max-w-[380px] mx-4 bg-white dark:bg-[#252520] border border-line dark:border-white/[0.08] rounded-[22px] shadow-2xl p-8 pb-7 text-center"
              >
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
                  <Package size={26} />
                </div>
                <div className="text-[15px] font-black text-on-surface mb-1.5">Aprovar recebimento?</div>
                <p className="text-[12px] font-bold text-on-surface/55 mb-5 leading-relaxed">
                  O estoque da Empresa Destino será atualizado com as quantidades recebidas e o manifesto ficará travado. Esta ação não pode ser desfeita.
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setConfirmApproveOpen(false)} className="flex-1 h-10 rounded-xl border-[1.5px] border-on-surface/15 text-on-surface/55 text-[12.5px] font-bold hover:bg-on-surface/[0.04] transition-colors">
                    Cancelar
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={approving}
                    className="flex-1 h-10 rounded-xl bg-emerald-600 text-white text-[12.5px] font-black flex items-center justify-center gap-1.5 hover:bg-emerald-700 active:scale-[0.97] transition-all disabled:opacity-60"
                  >
                    {approving ? 'Aprovando…' : 'Aprovar Recebimento'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Modal Falta/Sobra — mesmo fluxo/layout do modal de divergência da nota (app/page.tsx) */}
        <AnimatePresence>
          {discrepancyModalItemId !== null && (() => {
            const item = items.find(it => it.id === discrepancyModalItemId);
            if (!item) return null;
            const isFalta = discrepancyTab === 'falta';
            const accentRing = isFalta ? 'focus:ring-red-400/40' : 'focus:ring-emerald-400/40';

            const handleSaveDiscrepancy = () => {
              const qty = discrepancyMissingAll ? 0 : (parseFloat(discrepancyQty) || 0);
              persistDiscrepancy(item.id, {
                type: discrepancyTab,
                qty,
                missingAll: isFalta && discrepancyMissingAll,
                obs: discrepancyObs.trim(),
                disregarded: discrepancyDisregarded,
              });
            };

            const handleClearDiscrepancy = () => persistDiscrepancy(item.id, null);

            return (
              <motion.div
                key="discrepancy-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 z-[220] flex items-center justify-center bg-black/45 backdrop-blur-[6px]"
                onClick={() => setDiscrepancyModalItemId(null)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                  className="bg-[#F0E7CC] dark:bg-[#1E1E18] border border-black/10 dark:border-white/[0.08] rounded-3xl shadow-2xl w-full max-w-[520px] mx-4 overflow-hidden"
                  onClick={e => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="px-6 py-5 flex items-center gap-3.5 bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800]">
                    <span className={cn(
                      'w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-black/[0.09]',
                      isFalta ? 'dark:bg-[#D81E1E]/[0.16] dark:text-[#D81E1E] text-[#D81E1E]' : 'dark:bg-emerald-500/[0.16] dark:text-emerald-500 text-emerald-600'
                    )}>
                      <AlertTriangle size={20} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#1A1A0E]/45">Divergência</p>
                      <h2 className="text-lg font-extrabold text-[#1A1A0E] leading-tight truncate mt-0.5">{item.productName}</h2>
                    </div>
                    <button
                      onClick={() => setDiscrepancyModalItemId(null)}
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-black/[0.08] border border-black/10 text-black/50 hover:bg-black/[0.14] transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Tab switcher */}
                  <div className="px-6 pt-5 pb-0 flex gap-2">
                    <button
                      onClick={() => setDiscrepancyTab('falta')}
                      className={cn(
                        'flex-1 py-2.5 rounded-xl text-sm font-black transition-all',
                        isFalta
                          ? 'bg-red-500/10 dark:bg-red-500/15 text-red-500 dark:text-red-400 border border-red-500/30'
                          : 'bg-black/[0.04] dark:bg-white/[0.04] text-black/35 dark:text-white/35 border border-black/[0.08] dark:border-white/[0.06] hover:bg-black/[0.07] dark:hover:bg-white/[0.08] hover:text-black/55 dark:hover:text-white/55'
                      )}
                    >
                      Falta
                    </button>
                    <button
                      onClick={() => setDiscrepancyTab('sobra')}
                      className={cn(
                        'flex-1 py-2.5 rounded-xl text-sm font-black transition-all',
                        !isFalta
                          ? 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          : 'bg-black/[0.04] dark:bg-white/[0.04] text-black/35 dark:text-white/35 border border-black/[0.08] dark:border-white/[0.06] hover:bg-black/[0.07] dark:hover:bg-white/[0.08] hover:text-black/55 dark:hover:text-white/55'
                      )}
                    >
                      Sobra
                    </button>
                  </div>

                  {/* Body */}
                  <div className="px-6 py-5 space-y-4">
                    <AnimatePresence mode="wait">
                      {isFalta ? (
                        <motion.div
                          key="falta"
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 6 }}
                          transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
                          className="bg-white dark:bg-[#252520] border border-black/[0.07] dark:border-white/[0.07] rounded-2xl p-4 flex items-center gap-5"
                        >
                          <button
                            type="button"
                            onClick={() => setDiscrepancyMissingAll(v => !v)}
                            className="flex-1 flex items-center gap-3 text-left"
                          >
                            <div className={cn(
                              'w-9 h-5 rounded-full relative shrink-0 transition-colors',
                              discrepancyMissingAll ? 'bg-red-500' : 'bg-black/[0.14] dark:bg-white/[0.12]'
                            )}>
                              <span className={cn(
                                'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
                                discrepancyMissingAll ? 'left-4' : 'left-0.5'
                              )} />
                            </div>
                            <span className="text-sm font-semibold text-black/70 dark:text-white/70">Produto não veio</span>
                          </button>

                          <AnimatePresence>
                            {!discrepancyMissingAll && (
                              <motion.div
                                initial={{ opacity: 0, width: 0 }}
                                animate={{ opacity: 1, width: 'auto' }}
                                exit={{ opacity: 0, width: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden flex items-stretch gap-5 flex-1"
                              >
                                <div className="w-px self-stretch bg-black/[0.08] dark:bg-white/[0.08] shrink-0" />
                                <div className="flex-1 min-w-[140px]">
                                  <label className="block text-[10px] font-extrabold uppercase tracking-wide text-black/45 dark:text-white/35 mb-1.5">
                                    Qtd. faltando
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={discrepancyQty}
                                    onChange={e => setDiscrepancyQty(e.target.value)}
                                    autoFocus
                                    placeholder="0"
                                    onWheel={blockWheelChange}
                                    className={cn(
                                      'w-full bg-black/[0.035] dark:bg-white/[0.05] border rounded-xl px-3.5 py-2.5 text-sm font-bold text-[#1A1A0E] dark:text-[#f2f0e3] focus:outline-none focus:ring-2 transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden',
                                      'border-black/[0.10] dark:border-white/[0.10]', accentRing
                                    )}
                                  />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="sobra"
                          initial={{ opacity: 0, x: 6 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -6 }}
                          transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
                          className="bg-white dark:bg-[#252520] border border-black/[0.07] dark:border-white/[0.07] rounded-2xl p-4"
                        >
                          <label className="block text-[10px] font-extrabold uppercase tracking-wide text-black/45 dark:text-white/35 mb-1.5">
                            Qtd. sobrando
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={discrepancyQty}
                            onChange={e => setDiscrepancyQty(e.target.value)}
                            autoFocus
                            placeholder="0"
                            onWheel={blockWheelChange}
                            className={cn(
                              'w-full bg-black/[0.035] dark:bg-white/[0.05] border rounded-xl px-3.5 py-2.5 text-sm font-bold text-[#1A1A0E] dark:text-[#f2f0e3] focus:outline-none focus:ring-2 transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden',
                              'border-black/[0.10] dark:border-white/[0.10]', accentRing
                            )}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Desconsiderar produto */}
                    <div className={cn(
                      'rounded-2xl border-[1.5px] border-dashed px-4 py-3.5 transition-colors',
                      discrepancyDisregarded
                        ? 'border-[#DDD000] dark:border-amber-400/30 bg-[#FFE500]/[0.14] dark:bg-amber-400/[0.07]'
                        : 'border-black/15 dark:border-white/[0.10] bg-black/[0.02] dark:bg-white/[0.02]'
                    )}>
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-[9px] bg-[#92400E]/[0.12] dark:bg-amber-400/[0.14] text-[#92400E] dark:text-amber-300 flex items-center justify-center shrink-0">
                          <Ban size={14} strokeWidth={2.3} />
                        </span>
                        <span className="text-[12.5px] font-black text-[#92400E] dark:text-amber-300 flex-1">Confirmar divergência</span>
                        <button
                          type="button"
                          onClick={() => setDiscrepancyDisregarded(v => !v)}
                          className={cn(
                            'w-9 h-5 rounded-full relative shrink-0 transition-colors',
                            discrepancyDisregarded ? 'bg-amber-500' : 'bg-[#92400E]/20 dark:bg-amber-400/20'
                          )}
                        >
                          <span className={cn(
                            'absolute top-0.5 w-4 h-4 rounded-full shadow transition-all bg-white dark:bg-[#1A1A0E]',
                            discrepancyDisregarded ? 'left-4' : 'left-0.5'
                          )} />
                        </button>
                      </div>
                      <p className="text-[11px] font-semibold leading-[1.45] text-[#92400E]/85 dark:text-amber-300/75 mt-1.5">
                        Ajusta o valor: subtrai (Falta) ou soma (Sobra) o Preço de Custo × quantidade divergente do Valor Total.
                      </p>
                    </div>

                    {/* Observations */}
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wide text-black/45 dark:text-white/35 mb-1.5">
                        Observações
                      </label>
                      <textarea
                        value={discrepancyObs}
                        onChange={e => setDiscrepancyObs(e.target.value)}
                        placeholder="Detalhes adicionais sobre a divergência..."
                        rows={2}
                        className="w-full bg-black/[0.035] dark:bg-white/[0.05] border border-black/[0.10] dark:border-white/[0.10] rounded-xl px-3.5 py-2.5 text-sm text-[#1A1A0E] dark:text-[#f2f0e3] placeholder:text-black/25 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/20 resize-none transition-all"
                      />
                    </div>
                  </div>

                  {/* Footer actions */}
                  <div className="px-6 pb-6 flex gap-2.5">
                    <button
                      onClick={handleClearDiscrepancy}
                      disabled={approved}
                      className="flex-1 py-3 rounded-xl bg-black/[0.08] dark:bg-white/[0.04] border border-black/[0.14] dark:border-white/[0.07] text-sm font-bold text-black/55 dark:text-white/45 hover:bg-black/[0.13] dark:hover:bg-white/[0.08] hover:text-black/70 dark:hover:text-white/65 transition-all active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none"
                    >
                      Limpar
                    </button>
                    <button
                      onClick={handleSaveDiscrepancy}
                      disabled={approved}
                      className={cn(
                        'flex-1 py-3 rounded-xl text-sm font-black text-white shadow-lg transition-all active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none',
                        isFalta ? 'bg-red-500 hover:bg-red-600 shadow-red-500/25' : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/25'
                      )}
                    >
                      Salvar
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Baixar PDF da nota de distribuição */}
        <AnimatePresence>
          {pdfModalOpen && (
            <div className="absolute inset-0 z-[220] flex items-center justify-center bg-black/45 backdrop-blur-[6px]">
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="w-full max-w-[380px] mx-4 bg-white dark:bg-[#252520] border border-line dark:border-white/[0.08] rounded-[22px] shadow-2xl p-8 pb-7 text-center"
              >
                <div className="w-14 h-14 rounded-2xl bg-[#D81E1E]/10 dark:bg-[#D81E1E]/20 text-[#D81E1E] dark:text-[#FF6B6B] flex items-center justify-center mx-auto mb-4">
                  <FileText size={26} />
                </div>
                <div className="text-[15px] font-black text-on-surface mb-1.5">Baixar PDF da nota</div>
                <p className="text-[12px] font-bold text-on-surface/55 mb-5 leading-relaxed">
                  Gera o PDF com os dados do manifesto {manifest.manifestNumber} e a lista de produtos atual.
                </p>
                <div className="text-left space-y-1.5 mb-5 bg-on-surface/[0.03] border border-on-surface/[0.08] rounded-xl px-3.5 py-3">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-bold text-on-surface/50">Origem</span>
                    <span className="font-black text-on-surface truncate ml-2">{companies.find(c => c.id === originCompanyId)?.nome_fantasia || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-bold text-on-surface/50">Destino</span>
                    <span className="font-black text-on-surface truncate ml-2">{companies.find(c => c.id === destinationCompanyId)?.nome_fantasia || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-bold text-on-surface/50">Itens</span>
                    <span className="font-black text-on-surface">{items.length}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPdfModalOpen(false)} className="flex-1 h-10 rounded-xl border-[1.5px] border-on-surface/15 text-on-surface/55 text-[12.5px] font-bold hover:bg-on-surface/[0.04] transition-colors">
                    Cancelar
                  </button>
                  <button
                    onClick={generateManifestPdf}
                    disabled={generatingPdf}
                    className="flex-1 h-10 rounded-xl bg-[#D81E1E] text-white text-[12.5px] font-black flex items-center justify-center gap-1.5 hover:bg-[#B91818] active:scale-[0.97] transition-all disabled:opacity-60"
                  >
                    <Download size={13} />
                    {generatingPdf ? 'Gerando…' : 'Baixar PDF'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="border-t border-[#DDD2B0] dark:border-white/[0.08] bg-[#EFE7CD] dark:bg-[#181814] px-4 py-2.5 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-7">
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-[#1A1A0E]/45 dark:text-white/35">Itens</div>
              <div className="font-mono text-[22px] leading-tight font-black text-[#1A1A0E] dark:text-[#F2F0E3]">{items.length}</div>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-[#1A1A0E]/45 dark:text-white/35">Valor Total</div>
              <div className="font-mono text-[22px] leading-tight font-black text-[#1A1A0E] dark:text-[#F2F0E3]">{fmtBRL(itemsTotal)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="h-9 px-[18px] text-[12px] font-extrabold uppercase tracking-[0.04em] bg-white dark:bg-[#1E1E18] text-on-surface border border-[#E0D8BF] dark:border-white/[0.10] hover:bg-on-surface/[0.05] active:scale-[0.97] transition-all"
            >
              {editable ? 'Cancelar' : 'Fechar'}
            </button>
            {editable && (
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="h-9 px-[18px] text-[12px] font-extrabold uppercase tracking-[0.04em] bg-[#D81E1E] hover:bg-[#B91818] text-white active:scale-[0.97] transition-all disabled:opacity-60 flex items-center gap-1.5"
              >
                <CheckCircle2 size={14} />
                Salvar Rascunho
              </button>
            )}
            {receiving && pendentes.length > 0 && (
              <span className="text-[11.5px] font-bold text-[#92400E] dark:text-[#FCD34D] mr-1">Vincule {pendentes.length} {pendentes.length === 1 ? 'item pendente' : 'itens pendentes'} para aprovar</span>
            )}
            {receiving && (
              <button
                onClick={() => canApprove && setConfirmApproveOpen(true)}
                disabled={!canApprove}
                className="h-9 px-[18px] text-[12px] font-extrabold uppercase tracking-[0.04em] bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.97] transition-all disabled:opacity-40 flex items-center gap-1.5"
              >
                <Package size={14} />
                Aprovar Recebimento
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
