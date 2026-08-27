'use client';

import { useState, useRef, useEffect } from 'react';
import { Package, X, CheckCircle2, RefreshCw, Search, Zap, AlertTriangle, Trash2, Pencil, Info, ArrowDown, ArrowUp, Check, Download, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const MANIFEST_LOCK_TTL_MS = 2 * 60 * 1000;

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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

interface ManifestItem {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  ean: string | null;
  qty: number;
  measure: string;
  costPrice: number;
  salePriceOrigin: number;
  // Preenchidos pela loja destino após o envio — decisão 3-B do plano de Distribuição,
  // substitui o antigo "botão de preço" da nota (pricingByCompany, removido).
  salePriceDestination: number | null;
  verified: boolean;
  // Quantidade efetivamente recebida — alimenta o badge Falta/Sobra na aprovação.
  qtyReceived: number | null;
}

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
  const originRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!manifest.isExisting) return;
    (async () => {
      const { data } = await supabase
        .from('distribution_manifests')
        .select('destination_company_id, shipping_date, created_by_name, created_at, sent_by_name, sent_at, approved_by_name, approved_at, status')
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
    })();
  }, [manifest.id, manifest.isExisting]);

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
      const { data } = await supabase
        .from('distribution_manifest_items')
        .select('id, product_id, product_name, sku, ean, qty, measure, cost_price, sale_price_origin, sale_price_destination, verified, qty_received')
        .eq('manifest_id', manifest.id);
      if (itemsDirtyRef.current) { setLoadingItems(false); return; }
      setItems((data || []).map((r: any) => ({
        id: r.id,
        productId: r.product_id,
        productName: r.product_name,
        sku: r.sku,
        ean: r.ean,
        qty: parseFloat(r.qty) || 0,
        measure: r.measure || 'UN',
        costPrice: parseFloat(r.cost_price) || 0,
        salePriceOrigin: parseFloat(r.sale_price_origin) || 0,
        salePriceDestination: r.sale_price_destination !== null ? parseFloat(r.sale_price_destination) : null,
        verified: !!r.verified,
        qtyReceived: r.qty_received !== null && r.qty_received !== undefined ? parseFloat(r.qty_received) : null,
      })));
      setLoadingItems(false);
    })();
  }, [manifest.id, manifest.isExisting]);

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
      productName: p.name,
      sku: p.sku,
      ean: p.ean,
      qty,
      measure: 'UN',
      costPrice: p.costPrice,
      salePriceOrigin: p.salePriceOrigin,
      salePriceDestination: null,
      verified: false,
      qtyReceived: null,
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

  const itemsTotal = items.reduce((acc, it) => acc + it.qty * it.costPrice, 0);

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
            verified: it.verified,
            qty_received: it.qtyReceived,
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
  // propaga o preço pro Estoque & Preço da loja destino, substituindo o antigo mecanismo da
  // nota (botão de preço / pricingByCompany, removido).
  const updateItemPricing = async (itemId: string, productId: string, salePrice: number | null, verified: boolean) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, salePriceDestination: salePrice, verified } : it));
    const nowIso = new Date().toISOString();
    await supabase.from('distribution_manifest_items').update({
      sale_price_destination: salePrice,
      verified,
      verified_at: verified ? nowIso : null,
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

  // Qtd. recebida — alimenta o badge Falta/Sobra, preenchida pela loja destino em Pedido
  // Enviado, antes de aprovar. Não mexe em estoque (isso só acontece na aprovação).
  const updateItemReceivedQty = async (itemId: string, qtyReceived: number | null) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, qtyReceived } : it));
    await supabase.from('distribution_manifest_items').update({ qty_received: qtyReceived }).eq('id', itemId);
  };

  const canSend = editable && !!destinationCompanyId && items.length > 0;
  const canApprove = receiving && items.length > 0;

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
      if (showDestinationCols) headers.push('Preço Venda Dest.', 'Qtd. Receb.');

      const tableData = items.map(it => {
        const row: any[] = [it.productName, it.ean || '-', it.measure, it.qty, fmtBRL(it.costPrice), fmtBRL(it.salePriceOrigin)];
        if (showDestinationCols) row.push(it.salePriceDestination !== null ? fmtBRL(it.salePriceDestination) : '-', it.qtyReceived !== null ? it.qtyReceived : '-');
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
        .in('product_id', items.map(it => it.productId));
      const countByProduct: Record<string, number> = {};
      (currentStock || []).forEach((r: any) => { countByProduct[r.product_id] = parseFloat(r.count) || 0; });

      const nowIso = new Date().toISOString();
      await Promise.all(items.map(it => {
        const receivedQty = it.qtyReceived !== null ? it.qtyReceived : it.qty;
        const nextCount = (countByProduct[it.productId] || 0) + receivedQty;
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
        className="relative w-full h-full bg-white dark:bg-[#1e1e18] rounded-[20px] shadow-2xl overflow-hidden flex flex-col border border-line/60 dark:border-white/[0.06]"
      >
        {lockBlockedBy && (
          <div className="absolute inset-0 z-[250] flex items-center justify-center bg-black/45 backdrop-blur-[6px]">
            <div className="w-full max-w-[380px] mx-4 bg-white dark:bg-[#252520] border border-line dark:border-white/[0.08] rounded-[22px] shadow-2xl p-8 pb-7 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#D81E1E]/10 dark:bg-[#D81E1E]/20 text-[#D81E1E] dark:text-[#FF6B6B] flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <div className="text-[15px] font-black text-on-surface mb-1.5">Sendo editado agora</div>
              <div className="text-[12px] font-bold text-on-surface/55 mb-5">{lockBlockedBy.name}</div>
              <div className="flex items-center gap-2">
                <button onClick={handleClose} className="flex-1 h-10 rounded-xl border-[1.5px] border-on-surface/15 text-on-surface/55 text-[12.5px] font-bold hover:bg-on-surface/[0.04] transition-colors">
                  Fechar
                </button>
                <button
                  onClick={() => { setLockBlockedBy(null); acquireLock(); }}
                  disabled={checkingLock}
                  className="flex-1 h-10 rounded-xl bg-[#D81E1E] text-white text-[12.5px] font-black flex items-center justify-center gap-1.5 hover:bg-[#B91818] active:scale-[0.97] transition-all disabled:opacity-60"
                >
                  <RefreshCw size={13} className={checkingLock ? 'animate-spin' : ''} />
                  Verificar novamente
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] px-6 pt-5 shrink-0">
          <div className="flex items-start gap-3.5 pb-4">
            <div className="w-[46px] h-[46px] rounded-[14px] bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E] flex items-center justify-center shrink-0 mt-0.5">
              <Package size={20} />
            </div>
            <div className="flex-1 min-w-0" ref={originRef}>
              <div className="relative">
                <input
                  autoFocus={!originCompanyId}
                  value={originQuery}
                  disabled={!editable}
                  onChange={e => { setOriginQuery(e.target.value); setOriginOpen(true); if (!e.target.value) setOriginCompanyId(''); }}
                  onFocus={() => setOriginOpen(true)}
                  placeholder="Selecionar empresa origem…"
                  autoComplete="off"
                  className="text-xl font-black text-[#1A1A0E] border-b-2 border-[#D81E1E] outline-none bg-transparent w-full placeholder:text-[#1A1A0E]/35 disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <AnimatePresence>
                  {originOpen && editable && (
                    <motion.ul
                      initial={{ opacity: 0, y: -4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.13, ease: [0.23, 1, 0.32, 1] }}
                      className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-[#2a2a24] border border-line dark:border-white/10 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto"
                    >
                      {filteredCompanies.map(c => (
                        <li
                          key={c.id}
                          onMouseDown={() => { setOriginCompanyId(c.id); setOriginQuery(c.nome_fantasia); setOriginOpen(false); }}
                          className="px-3 py-2.5 text-sm font-semibold text-on-surface hover:bg-on-surface/5 dark:hover:bg-white/[0.06] cursor-pointer transition-colors"
                        >
                          {c.nome_fantasia}
                        </li>
                      ))}
                      {filteredCompanies.length === 0 && (
                        <li className="px-3 py-2.5 text-sm text-on-surface/35 italic">Nenhuma loja encontrada</li>
                      )}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
              <div className="mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-[#1A1A0E]/55 bg-black/[0.06] px-2.5 py-1 rounded-full">
                {manifest.manifestNumber}
              </div>
            </div>
            {items.length > 0 && (
              <button
                onClick={() => setPdfModalOpen(true)}
                title="Baixar PDF"
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-black/[0.08] border border-black/10 text-black/50 hover:bg-black/[0.14] transition-colors"
              >
                <FileText size={16} />
              </button>
            )}
            <button
              onClick={handleClose}
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-black/[0.08] border border-black/10 text-black/50 hover:bg-black/[0.14] transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex gap-1">
            {(['produtos', 'recebimento'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-4 py-2.5 text-xs font-black uppercase tracking-wide border-b-[3px] transition-colors',
                  activeTab === tab ? 'text-[#1A1A0E] border-[#D81E1E]' : 'text-[#1A1A0E]/45 border-transparent'
                )}
              >
                {tab === 'produtos' ? 'Produtos' : 'Recebimento'}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'produtos' ? (
            !originCompanyId ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm font-bold text-on-surface/40 max-w-sm text-center">
                  Selecione a Empresa Origem para buscar produtos.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {editable && !creatingFormOpen && (
                  <div className="grid grid-cols-2 gap-2.5 max-w-3xl">
                    <div className="relative">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/30 pointer-events-none" />
                      <input
                        type="text"
                        value={descQuery}
                        onChange={e => { setDescQuery(e.target.value); if (e.target.value) setEanQuery(''); }}
                        placeholder="Buscar por descrição…"
                        className="w-full bg-surface-container-lowest border border-on-surface/[0.08] rounded-xl pl-8 pr-3 py-2.5 text-sm font-medium placeholder:text-on-surface/30 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="relative">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/30 pointer-events-none" />
                      <input
                        type="text"
                        value={eanQuery}
                        onChange={e => { setEanQuery(e.target.value); if (e.target.value) setDescQuery(''); }}
                        placeholder="Buscar por EAN…"
                        className="w-full bg-surface-container-lowest border border-on-surface/[0.08] rounded-xl pl-8 pr-3 py-2.5 text-sm font-medium placeholder:text-on-surface/30 focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>
                )}

                {editable && !creatingFormOpen && (descQuery || eanQuery) && !selectedProduct && (
                  <div className="bg-surface-container-lowest border border-on-surface/10 rounded-xl overflow-hidden max-w-3xl">
                    {searchLoading ? (
                      <div className="px-4 py-3 text-xs font-bold text-on-surface/35">Buscando…</div>
                    ) : searchResults.length > 0 ? (
                      searchResults.map(p => (
                        <button
                          key={p.id}
                          onClick={() => selectProduct(p)}
                          className="w-full text-left px-4 py-2.5 hover:bg-on-surface/5 transition-colors flex items-center justify-between gap-2 border-b border-on-surface/5 last:border-b-0"
                        >
                          <span className="text-sm font-bold text-on-surface truncate">{p.name}</span>
                          <span className="font-mono text-[11px] text-on-surface/40 shrink-0">{p.sku || p.ean || '—'}</span>
                        </button>
                      ))
                    ) : (
                      <button
                        onClick={openCreateForm}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[#D81E1E] text-sm font-black hover:bg-[#D81E1E]/5 transition-colors"
                      >
                        <Zap size={14} />
                        {`Criar e Vincular "${(descQuery || eanQuery).trim()}"`}
                      </button>
                    )}
                  </div>
                )}

                {editable && creatingFormOpen && (() => {
                  const labelCls = 'text-[9px] font-black uppercase tracking-wider text-on-surface/45';
                  const inputCls = 'w-full bg-white dark:bg-[#252520] border border-on-surface/15 rounded-lg px-3 py-2 text-sm font-semibold text-on-surface outline-none focus:ring-2 focus:ring-primary/20 mt-1';
                  const sectionCls = 'bg-surface-container-lowest border border-on-surface/10 rounded-2xl p-4 space-y-3';
                  return (
                    <div className="max-w-3xl space-y-4">
                      <button
                        onClick={() => setCreatingFormOpen(false)}
                        className="text-xs font-bold text-on-surface/55 hover:text-[#D81E1E] transition-colors flex items-center gap-1"
                      >
                        ← Voltar para busca
                      </button>

                      <div className={sectionCls}>
                        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-on-surface/50">
                          <Package size={14} className="text-[#D81E1E] shrink-0" />
                          Identificação
                        </div>
                        <div>
                          <label className={labelCls}>Nome do Produto</label>
                          <input autoFocus type="text" value={newName} onChange={e => setNewName(e.target.value)} className={inputCls} placeholder="Nome do produto" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={labelCls}>SKU (Código Interno)</label>
                            <input type="text" value={newSku} onChange={e => setNewSku(e.target.value)} className={inputCls} placeholder="Opcional" />
                          </div>
                          <div>
                            <label className={labelCls}>Código EAN</label>
                            <input type="text" value={newEan} onChange={e => setNewEan(e.target.value)} className={cn(inputCls, 'font-mono')} placeholder="Opcional" />
                          </div>
                        </div>
                      </div>

                      <div className={sectionCls}>
                        <div className="text-[11px] font-black uppercase tracking-wider text-on-surface/50">Preços (Empresa Origem)</div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={labelCls}>Preço de Custo</label>
                            <div className="relative mt-1">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-on-surface/40">R$</span>
                              <input type="text" value={newCost} onChange={e => setNewCost(e.target.value)} placeholder="0,00" className="w-full bg-white dark:bg-[#252520] border border-on-surface/15 rounded-lg pl-8 pr-3 py-2 text-sm font-semibold text-on-surface outline-none focus:ring-2 focus:ring-primary/20 font-mono" />
                            </div>
                          </div>
                          <div>
                            <label className={labelCls}>Preço de Venda</label>
                            <div className="relative mt-1">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-on-surface/40">R$</span>
                              <input type="text" value={newSale} onChange={e => setNewSale(e.target.value)} placeholder="0,00" className="w-full bg-white dark:bg-[#252520] border border-on-surface/15 rounded-lg pl-8 pr-3 py-2 text-sm font-semibold text-on-surface outline-none focus:ring-2 focus:ring-primary/20 font-mono" />
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleSubmitCreateForm}
                        disabled={creatingProduct || !newName.trim()}
                        className="w-full h-11 rounded-xl bg-[#D81E1E] text-white text-sm font-black flex items-center justify-center gap-2 hover:bg-[#B91818] active:scale-[0.99] transition-all disabled:opacity-40"
                      >
                        {creatingProduct
                          ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                          : <Zap size={14} />}
                        {creatingProduct ? 'Criando…' : 'Criar e Vincular'}
                      </button>
                    </div>
                  );
                })()}

                {!creatingFormOpen && selectedProduct && (
                  <div className="bg-surface-container-lowest border border-on-surface/10 rounded-2xl p-4 relative max-w-3xl">
                    {isDuplicateOfSelected && (
                      <div className="absolute top-3 right-3 text-[#D81E1E]">
                        <AlertTriangle size={18} />
                      </div>
                    )}
                    <div className="flex gap-3.5 mb-3.5">
                      <div className="w-[72px] h-[72px] rounded-xl bg-[#D81E1E]/[0.06] border-[1.5px] border-dashed border-[#D81E1E]/25 text-[#D81E1E] flex flex-col items-center justify-center gap-1 shrink-0">
                        <Package size={22} />
                      </div>
                      <div className="flex-1 min-w-0 grid grid-cols-2 gap-1.5">
                        <div className="col-span-2 bg-on-surface/[0.03] border border-on-surface/[0.08] rounded-lg px-2.5 py-1.5">
                          <div className="text-[8px] font-black uppercase tracking-wider text-on-surface/40">Descrição</div>
                          <div className="text-[13px] font-bold text-on-surface truncate">{selectedProduct.name}</div>
                        </div>
                        <div className={cn(
                          'bg-on-surface/[0.03] border rounded-lg px-2.5 py-1.5',
                          isDuplicateOfSelected ? 'border-[#D81E1E]/60 bg-[#D81E1E]/[0.05]' : 'border-on-surface/[0.08]'
                        )}>
                          <div className="text-[8px] font-black uppercase tracking-wider text-on-surface/40">EAN</div>
                          <div className={cn('font-mono text-[12px] font-bold truncate', isDuplicateOfSelected ? 'text-[#D81E1E]' : 'text-on-surface')}>{selectedProduct.ean || '—'}</div>
                        </div>
                        <div className="bg-on-surface/[0.03] border border-on-surface/[0.08] rounded-lg px-2.5 py-1.5">
                          <div className="text-[8px] font-black uppercase tracking-wider text-on-surface/40">SKU</div>
                          <div className="font-mono text-[12px] font-bold text-on-surface truncate">{selectedProduct.sku || '—'}</div>
                        </div>
                        <div className="bg-on-surface/[0.03] border border-on-surface/[0.08] rounded-lg px-2.5 py-1.5">
                          <div className="text-[8px] font-black uppercase tracking-wider text-on-surface/40">Preço de Custo (Origem)</div>
                          <div className="font-mono text-[14px] font-black text-on-surface">{fmtBRL(selectedProduct.costPrice)}</div>
                        </div>
                        <div className="bg-on-surface/[0.03] border border-on-surface/[0.08] rounded-lg px-2.5 py-1.5">
                          <div className="text-[8px] font-black uppercase tracking-wider text-on-surface/40">Preço de Venda (Origem)</div>
                          <div className="font-mono text-[14px] font-black text-on-surface/55">{fmtBRL(selectedProduct.salePriceOrigin)}</div>
                          <div className="text-[8px] font-bold text-on-surface/30">apenas referência</div>
                        </div>
                      </div>
                    </div>

                    {isDuplicateOfSelected ? (
                      <div className="bg-[#D81E1E]/[0.06] border border-[#D81E1E]/25 rounded-xl p-3 flex flex-col gap-2.5">
                        <p className="text-[12px] font-bold text-[#D81E1E]">Este produto já está na lista. Somar {duplicatePendingQty} un. à quantidade existente?</p>
                        <div className="flex gap-2">
                          <button onClick={cancelDuplicateMerge} className="flex-1 h-9 rounded-lg border-[1.5px] border-on-surface/15 text-on-surface/55 text-[12px] font-bold hover:bg-on-surface/5 transition-colors">
                            Cancelar
                          </button>
                          <button onClick={confirmDuplicateMerge} className="flex-1 h-9 rounded-lg bg-[#D81E1E] text-white text-[12px] font-black hover:bg-[#B91818] transition-colors">
                            Sim, somar
                          </button>
                        </div>
                      </div>
                    ) : editable && (
                      <div className="flex gap-2.5 items-end">
                        <div className="flex-1">
                          <div className="text-[8px] font-black uppercase tracking-wider text-on-surface/40 mb-1">Quantidade a enviar</div>
                          <input
                            type="text"
                            value={qtyInput}
                            onChange={e => setQtyInput(e.target.value)}
                            placeholder="0"
                            className="w-full bg-white dark:bg-[#252520] border border-on-surface/15 rounded-lg px-3 py-2 font-mono text-[15px] font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                        <button
                          onClick={handleConfirmAddItem}
                          className="h-[38px] px-5 rounded-lg bg-[#D81E1E] text-white text-[12.5px] font-black flex items-center gap-1.5 hover:bg-[#B91818] active:scale-[0.97] transition-all shrink-0"
                        >
                          <CheckCircle2 size={14} />
                          Confirmar
                        </button>
                        <button
                          onClick={() => { setSelectedProduct(null); setQtyInput(''); }}
                          className="h-[38px] px-3 rounded-lg border border-on-surface/15 text-on-surface/50 text-[12px] font-bold hover:bg-on-surface/5 transition-colors shrink-0"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.1em] text-on-surface/35 mb-2 flex items-center gap-2">
                    Produtos na Distribuição · {items.length}
                    <span className="flex-1 h-px bg-on-surface/10" />
                  </div>
                  {loadingItems ? (
                    <p className="text-xs font-bold text-on-surface/30 py-4 text-center">Carregando produtos…</p>
                  ) : items.length === 0 ? (
                    <p className="text-xs font-bold text-on-surface/30 py-4 text-center">Nenhum produto adicionado ainda.</p>
                  ) : (
                    // Tabela no molde da tabela de revisão da nota (barra de cabeçalho amarela
                    // contínua + chip por coluna, células em duas camadas) — antes essa lista
                    // era compacta demais (cards em Registro, tabela simples pós-envio).
                    <div className="border border-on-surface/[0.08] rounded-xl overflow-hidden">
                      <table className="w-full" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <colgroup>
                          <col style={{ width: 36 }} />
                          <col style={{ width: 150 }} />
                          <col />
                          <col style={{ width: 140 }} />
                          <col style={{ width: 80 }} />
                          <col style={{ width: 90 }} />
                          <col style={{ width: 100 }} />
                          <col style={{ width: 110 }} />
                          <col style={{ width: 80 }} />
                          {!editable && <col style={{ width: 110 }} />}
                          {!editable && <col style={{ width: 90 }} />}
                          {!editable && <col style={{ width: 120 }} />}
                          {!editable && <col style={{ width: 50 }} />}
                          {editable && <col style={{ width: 40 }} />}
                        </colgroup>
                        <thead>
                          <tr>
                            <th className={thBarCls}><div className={thLblCls}>#</div></th>
                            <th className={thBarCls}><div className={thLblCls}>Ident. Interna</div></th>
                            <th className={thBarCls}><div className={thLblCls}>Produto</div></th>
                            <th className={thBarCls}><div className={thLblCls}>EAN</div></th>
                            <th className={thBarCls}><div className={thLblCls}>Medida</div></th>
                            <th className={thBarCls}><div className={thLblCls}>Qtd. Env.</div></th>
                            <th className={thBarCls}><div className={thLblCls}>Preço Custo</div></th>
                            <th className={thBarCls}><div className={thLblCls}>Valor Total</div></th>
                            <th className={thBarCls}><div className={thLblCls}>Markup</div></th>
                            {!editable && <th className={thBarCls}><div className={thLblCls}>Preço Venda</div></th>}
                            {!editable && <th className={thBarCls}><div className={thLblCls}>Qtd. Receb.</div></th>}
                            {!editable && <th className={thBarCls}><div className={thLblCls}>Falta / Sobra</div></th>}
                            {!editable && <th className={thBarCls}><div className={thLblCls}>Ok</div></th>}
                            {editable && <th className={thBarCls}></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it, idx) => {
                            const total = it.qty * it.costPrice;
                            const markup = it.costPrice > 0 ? ((it.salePriceOrigin - it.costPrice) / it.costPrice) * 100 : null;
                            const diff = it.qtyReceived !== null ? it.qtyReceived - it.qty : null;
                            return (
                              <tr key={it.id}>
                                <td className={tdCls}><div className={cn(cellCls, 'justify-center text-on-surface/35 font-medium')}>{idx + 1}</div></td>
                                <td className={tdCls}><div className={cn(cellCls, 'text-on-surface/50 font-medium')}>{it.sku || '—'}</div></td>
                                <td className={tdCls}><div className={cellCls} title={it.productName}><span className="truncate">{it.productName}</span></div></td>
                                <td className={tdCls}><div className={cn(cellCls, 'font-mono text-[11px] text-on-surface/50')}>{it.ean || '—'}</div></td>
                                <td className={tdCls}>
                                  <div className={cn(cellCls, 'justify-center')}>
                                    {editable ? (
                                      <input type="text" value={it.measure} onChange={e => updateItemField(it.id, { measure: e.target.value.toUpperCase().slice(0, 6) })}
                                        className={cn(cellInputCls, 'text-center')} placeholder="UN" />
                                    ) : it.measure}
                                  </div>
                                </td>
                                <td className={tdCls}>
                                  <div className={cn(cellCls, 'justify-end font-mono')}>
                                    {editable ? (
                                      <input type="number" min="0" value={it.qty} onChange={e => updateItemField(it.id, { qty: parseFloat(e.target.value) || 0 })}
                                        className={cn(cellInputCls, 'text-right')} />
                                    ) : it.qty}
                                  </div>
                                </td>
                                <td className={tdCls}><div className={cn(cellCls, 'justify-end font-mono text-on-surface/70')}>{fmtBRL(it.costPrice)}</div></td>
                                <td className={tdCls}><div className={cn(cellCls, 'justify-end font-mono font-black')}>{fmtBRL(total)}</div></td>
                                <td className={tdCls}>
                                  <div className={cn(cellCls, 'justify-end font-mono font-black', markup === null ? 'text-on-surface/30' : markup >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#D81E1E]')}>
                                    {markup === null ? '—' : `${markup >= 0 ? '+' : ''}${markup.toFixed(1)}%`}
                                  </div>
                                </td>
                                {!editable && (
                                  <td className={tdCls}>
                                    <div className={cn(cellCls, 'justify-end font-mono')}>
                                      {receiving ? (
                                        <input type="text" inputMode="decimal"
                                          defaultValue={it.salePriceDestination !== null ? it.salePriceDestination.toFixed(2).replace('.', ',') : ''}
                                          placeholder="0,00"
                                          onBlur={e => { const n = parseFloat(e.target.value.replace(',', '.')); updateItemPricing(it.id, it.productId, isNaN(n) ? null : n, it.verified); }}
                                          className={cn(cellInputCls, 'text-right')} />
                                      ) : it.salePriceDestination !== null ? fmtBRL(it.salePriceDestination) : '—'}
                                    </div>
                                  </td>
                                )}
                                {!editable && (
                                  <td className={tdCls}>
                                    <div className={cn(cellCls, 'justify-end font-mono')}>
                                      {receiving ? (
                                        <input type="number" min="0" defaultValue={it.qtyReceived ?? ''} placeholder={String(it.qty)}
                                          onBlur={e => { const n = parseFloat(e.target.value); updateItemReceivedQty(it.id, isNaN(n) ? null : n); }}
                                          className={cn(cellInputCls, 'text-right')} />
                                      ) : it.qtyReceived ?? '—'}
                                    </div>
                                  </td>
                                )}
                                {!editable && (
                                  <td className={tdCls}>
                                    <div className={cn(cellCls, 'justify-center')}>
                                      {diff === null || diff === 0 ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2 py-0.5">
                                          <Check size={10} /> {diff === null ? 'A conferir' : 'OK'}
                                        </span>
                                      ) : diff < 0 ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-black text-[#D81E1E] bg-[#D81E1E]/10 border border-[#D81E1E]/25 rounded-full px-2 py-0.5">
                                          <ArrowDown size={10} /> Falta {Math.abs(diff)}
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-700 dark:text-[#FCD34D] bg-amber-500/10 border border-amber-500/25 rounded-full px-2 py-0.5">
                                          <ArrowUp size={10} /> Sobra {diff}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                )}
                                {!editable && (
                                  <td className={tdCls}>
                                    <div className={cn(cellCls, 'justify-center')}>
                                      <input type="checkbox" checked={it.verified} disabled={!receiving}
                                        onChange={e => updateItemPricing(it.id, it.productId, it.salePriceDestination, e.target.checked)}
                                        className="w-4 h-4 accent-emerald-600 cursor-pointer disabled:cursor-not-allowed" />
                                    </div>
                                  </td>
                                )}
                                {editable && (
                                  <td className={tdCls}>
                                    <div className={cn(cellCls, 'justify-center border-none bg-transparent p-0')}>
                                      <button onClick={() => removeItem(it.id)}
                                        className="w-7 h-7 rounded-lg bg-[#D81E1E]/10 text-[#D81E1E] flex items-center justify-center hover:bg-[#D81E1E]/20 transition-colors">
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )
          ) : (
            <div className="space-y-6">
              <div className="flex gap-7">
                <div>
                  <label className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-on-surface/40 mb-1.5">
                    Empresa Destino <span className="text-primary">*</span>
                  </label>
                  <select
                    value={destinationCompanyId}
                    disabled={!editable}
                    onChange={e => setDestinationCompanyId(e.target.value)}
                    className={cn(
                      'px-3 py-2 border rounded-xl text-sm font-semibold text-on-surface transition-colors w-fit min-w-[200px] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed',
                      destinationCompanyId
                        ? 'border-on-surface/15 bg-on-surface/[0.03] hover:bg-on-surface/[0.06]'
                        : 'border-primary/55 bg-primary/[0.06] focus:ring-2 focus:ring-primary/20'
                    )}
                  >
                    <option value="">Selecionar...</option>
                    {companies.filter(c => c.id !== originCompanyId).map(c => (
                      <option key={c.id} value={c.id}>{c.nome_fantasia}</option>
                    ))}
                  </select>
                  {!destinationCompanyId && (
                    <p className="text-[10.5px] font-bold text-primary mt-1.5 flex items-center gap-1.5">
                      <AlertTriangle size={11} /> Campo obrigatório
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-on-surface/40 mb-1.5">Data de Envio</label>
                  <input
                    type="date"
                    value={shippingDate}
                    disabled={!editable}
                    onChange={e => setShippingDate(e.target.value)}
                    className="px-3 py-2 border border-on-surface/15 rounded-xl text-sm font-semibold text-on-surface bg-on-surface/[0.03] hover:bg-on-surface/[0.06] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="max-w-3xl">
                <div className="text-[10px] font-black uppercase tracking-[0.09em] text-on-surface/35 mb-2.5">Situação</div>
                <div className="bg-surface-container-lowest border-[1.5px] border-on-surface/[0.08] rounded-2xl p-4">
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className={cn('rounded-2xl p-3.5 flex items-center gap-2.5 border-2', status === 'registro' ? 'bg-amber-500/[0.08] border-amber-500/30' : 'bg-on-surface/[0.02] border-transparent opacity-55')}>
                      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0', status === 'registro' ? 'bg-amber-500/15 text-amber-600 dark:text-[#FCD34D]' : 'bg-on-surface/10 text-on-surface/35')}>
                        <Pencil size={15} />
                      </div>
                      <div>
                        <div className={cn('text-[12px] font-black', status === 'registro' ? 'text-amber-700 dark:text-[#FCD34D]' : 'text-on-surface/35')}>Registro</div>
                        <div className={cn('text-[9.5px] font-bold', status === 'registro' ? 'text-amber-700/70 dark:text-[#FCD34D]/70' : 'text-on-surface/30')}>Editável</div>
                      </div>
                    </div>
                    <button
                      onClick={() => canSend && setConfirmSendOpen(true)}
                      disabled={!canSend}
                      className={cn(
                        'rounded-2xl p-3.5 flex items-center gap-2.5 border-2 text-left transition-colors',
                        status === 'pedido_enviado' || status === 'aprovado'
                          ? 'bg-emerald-500/[0.08] border-emerald-500/30'
                          : canSend
                            ? 'bg-emerald-500/[0.07] border-emerald-500/30 hover:bg-emerald-500/[0.12] cursor-pointer'
                            : 'bg-on-surface/[0.02] border-transparent opacity-55 cursor-not-allowed'
                      )}
                    >
                      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0', (canSend || status === 'pedido_enviado' || status === 'aprovado') ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-on-surface/10 text-on-surface/35')}>
                        <CheckCircle2 size={15} />
                      </div>
                      <div>
                        <div className={cn('text-[12px] font-black', (canSend || status === 'pedido_enviado' || status === 'aprovado') ? 'text-emerald-700 dark:text-emerald-400' : 'text-on-surface/35')}>Pedido Enviado</div>
                        <div className={cn('text-[9.5px] font-bold', (canSend || status === 'pedido_enviado' || status === 'aprovado') ? 'text-emerald-700/70 dark:text-emerald-400/70' : 'text-on-surface/30')}>
                          {status === 'aprovado' ? 'Concluído' : status === 'pedido_enviado' ? 'Aguardando aprovação' : canSend ? 'Clique para confirmar' : 'Bloqueado'}
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => canApprove && setConfirmApproveOpen(true)}
                      disabled={!canApprove}
                      className={cn(
                        'rounded-2xl p-3.5 flex items-center gap-2.5 border-2 text-left transition-colors',
                        status === 'aprovado'
                          ? 'bg-emerald-500/[0.08] border-emerald-500/30'
                          : canApprove
                            ? 'bg-emerald-500/[0.07] border-emerald-500/30 hover:bg-emerald-500/[0.12] cursor-pointer'
                            : 'bg-on-surface/[0.02] border-transparent opacity-55 cursor-not-allowed'
                      )}
                    >
                      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0', (canApprove || status === 'aprovado') ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-on-surface/10 text-on-surface/35')}>
                        <Package size={15} />
                      </div>
                      <div>
                        <div className={cn('text-[12px] font-black', (canApprove || status === 'aprovado') ? 'text-emerald-700 dark:text-emerald-400' : 'text-on-surface/35')}>Aprovado</div>
                        <div className={cn('text-[9.5px] font-bold', (canApprove || status === 'aprovado') ? 'text-emerald-700/70 dark:text-emerald-400/70' : 'text-on-surface/30')}>
                          {status === 'aprovado' ? 'Estoque atualizado' : canApprove ? 'Clique para aprovar' : 'Bloqueado'}
                        </div>
                      </div>
                    </button>
                  </div>

                  {status === 'registro' && (
                    canSend ? (
                      <div className="mt-3 flex items-start gap-2 bg-on-surface/[0.04] border border-on-surface/[0.08] rounded-xl px-3 py-2.5">
                        <Info size={13} className="text-on-surface/40 shrink-0 mt-0.5" />
                        <p className="text-[11px] font-bold text-on-surface/55 leading-relaxed">
                          Confirmar o envio trava a lista de produtos — esta ação não pode ser desfeita.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center gap-1.5 text-[10.5px] font-bold text-on-surface/40">
                        <AlertTriangle size={11} />
                        Adicione ao menos 1 produto e selecione a Empresa Destino para enviar
                      </div>
                    )
                  )}
                  {status === 'pedido_enviado' && (
                    <div className="mt-3 flex items-start gap-2 bg-on-surface/[0.04] border border-on-surface/[0.08] rounded-xl px-3 py-2.5">
                      <Info size={13} className="text-on-surface/40 shrink-0 mt-0.5" />
                      <p className="text-[11px] font-bold text-on-surface/55 leading-relaxed">
                        Confira Qtd. Recebida, Preço de Venda e marque "Ok" item a item na aba Produtos. Aprovar atualiza o estoque da Empresa Destino e não pode ser desfeito.
                      </p>
                    </div>
                  )}
                  {status === 'aprovado' && (
                    <div className="mt-3 flex items-start gap-2 bg-emerald-500/[0.06] border border-emerald-500/20 rounded-xl px-3 py-2.5">
                      <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 leading-relaxed">
                        Estoque da Empresa Destino atualizado com as quantidades recebidas.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {createdByName && (
                <div className="border-t border-dashed border-on-surface/[0.12] pt-3.5 space-y-1.5">
                  <p className="text-[11.5px] font-bold text-on-surface/50">
                    Criado por <b className="text-on-surface font-extrabold">{createdByName}</b> em {fmtDateTimeBR(createdAt)}
                  </p>
                  {sentByName && (
                    <p className="text-[11.5px] font-bold text-on-surface/50">
                      Enviado por <b className="text-on-surface font-extrabold">{sentByName}</b> em {fmtDateTimeBR(sentAt)}
                    </p>
                  )}
                  {approvedByName && (
                    <p className="text-[11.5px] font-bold text-on-surface/50">
                      Aprovado por <b className="text-on-surface font-extrabold">{approvedByName}</b> em {fmtDateTimeBR(approvedAt)}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

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
        <div className="border-t border-line dark:border-white/[0.07] bg-[#FFF7B0] dark:bg-[#252520] px-6 py-4 flex items-center justify-between gap-2 shrink-0">
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
              className="px-4 py-2.5 rounded-xl text-[12.5px] font-bold bg-black/[0.08] dark:bg-white/[0.07] text-[#1A1A0E]/55 dark:text-white/50 border border-black/[0.14] dark:border-white/10 hover:bg-black/[0.12] transition-colors"
            >
              {editable ? 'Cancelar' : 'Fechar'}
            </button>
            {editable && (
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl text-[12.5px] font-black bg-[#D81E1E] text-white shadow-md shadow-[#D81E1E]/25 hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-60 flex items-center gap-1.5"
              >
                <CheckCircle2 size={14} />
                Salvar Rascunho
              </button>
            )}
            {receiving && (
              <button
                onClick={() => canApprove && setConfirmApproveOpen(true)}
                disabled={!canApprove}
                className="px-5 py-2.5 rounded-xl text-[12.5px] font-black bg-emerald-600 text-white shadow-md shadow-emerald-600/25 hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-60 flex items-center gap-1.5"
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
