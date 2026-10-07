// Rateio de um pagamento pela distribuição de mercadoria das notas vinculadas a ele.
//
// Base de cálculo: o custo de cada produto na própria nota (preço / multiplicador), tanto
// para o total da nota quanto para os itens distribuídos — assim os dois lados ficam na
// mesma base e o frete/impostos da nota se dividem na mesma proporção. Cada loja destino
// recebe a parte do custo que foi para ela (manifestos gerados a partir da nota); a loja
// dona da nota fica com o resto. Manifestos criados à mão (sem nota de origem) não entram.

import { supabase } from '@/lib/supabase';
import { estabelecimentoDaEmpresa } from '@/lib/financeEstablishments';
import { dividirValor, round2 } from '@/lib/rateio';
import type { RateioDistribuicaoSnapshot, Transaction } from '@/types/finance';

export interface DistribuicaoLoja {
  estab: string;
  custo: number;
  origem: boolean;
  manifestos: string[];
  itens: number;
}

export interface DistribuicaoInfo {
  notas: { id: string; numero: string }[];
  custoTotal: number;          // custo total das notas
  distribuido: number;         // custo que foi para outras lojas
  lojas: DistribuicaoLoja[];   // origem(ns) primeiro, depois destinos
  itensSemCusto: number;       // itens distribuídos sem custo (ficam fora do cálculo)
  manifestosSemCusto: string[];
}

interface NotaItem { product_id?: string | null; price?: number; multiplier?: number; qty?: number }

const custoUnitario = (it: NotaItem) => (Number(it.price) || 0) / (Number(it.multiplier) || 1);

/** Distribuição das notas informadas, ou null se nenhuma delas teve distribuição para outra loja. */
export async function calcularDistribuicaoDasNotas(noteIds: string[]): Promise<DistribuicaoInfo | null> {
  if (noteIds.length === 0) return null;
  const { data: manifestos, error: mErr } = await supabase
    .from('distribution_manifests')
    .select('id, manifest_number, source_note_id, destination_company_id')
    .in('source_note_id', noteIds);
  if (mErr || !manifestos || manifestos.length === 0) return null;

  const manifestIds = manifestos.map(m => m.id);
  const [{ data: notas }, itensRes] = await Promise.all([
    supabase.from('review_notes').select('id, note_number, file_name, company_id, items').in('id', noteIds),
    supabase.from('distribution_manifest_items').select('manifest_id, product_id, qty, cost_price, source_note_item_idx').in('manifest_id', manifestIds),
  ]);
  // Sem a coluna source_note_item_idx (SQL ainda não rodado) a consulta falha — refaz sem ela
  let itens = itensRes.data as { manifest_id: string; product_id: string | null; qty: number; cost_price: number; source_note_item_idx?: number | null }[] | null;
  if (itensRes.error) {
    const { data } = await supabase.from('distribution_manifest_items').select('manifest_id, product_id, qty, cost_price').in('manifest_id', manifestIds);
    itens = data;
  }
  if (!notas || notas.length === 0) return null;

  const companyIds = [...new Set([...notas.map(n => n.company_id), ...manifestos.map(m => m.destination_company_id)].filter(Boolean))] as string[];
  const { data: empresas } = companyIds.length
    ? await supabase.from('companies').select('id, nome_fantasia').in('id', companyIds)
    : { data: [] as { id: string; nome_fantasia: string }[] };
  const estabDe = (companyId: string | null | undefined) => {
    const e = (empresas ?? []).find(x => x.id === companyId);
    return e ? estabelecimentoDaEmpresa(String(e.nome_fantasia ?? '')) : null;
  };

  const lojas = new Map<string, DistribuicaoLoja>();
  const loja = (estab: string, origem: boolean) => {
    let l = lojas.get(estab);
    if (!l) { l = { estab, custo: 0, origem, manifestos: [], itens: 0 }; lojas.set(estab, l); }
    if (origem) l.origem = true;
    return l;
  };
  let custoTotal = 0, distribuido = 0, itensSemCusto = 0;
  const manifestosSemCusto = new Set<string>();

  for (const nota of notas) {
    const itensNota = ((nota.items as NotaItem[]) ?? []);
    const totalNota = itensNota.reduce((a, it) => a + Math.max(0, custoUnitario(it)) * (Number(it.qty) || 0), 0);
    // Custo médio de cada produto na nota (o mesmo produto pode aparecer em mais de uma linha)
    const porProduto = new Map<string, { valor: number; qtd: number }>();
    for (const it of itensNota) {
      if (!it.product_id) continue;
      const p = porProduto.get(it.product_id) ?? { valor: 0, qtd: 0 };
      p.valor += Math.max(0, custoUnitario(it)) * (Number(it.qty) || 0);
      p.qtd += Number(it.qty) || 0;
      porProduto.set(it.product_id, p);
    }
    const custoDoProduto = (productId: string, fallback: number) => {
      const p = porProduto.get(productId);
      return p && p.qtd > 0 ? p.valor / p.qtd : fallback;
    };

    let distribuidoNota = 0;
    for (const m of manifestos.filter(x => x.source_note_id === nota.id)) {
      const estab = estabDe(m.destination_company_id);
      if (!estab) continue;
      const l = loja(estab, false);
      l.manifestos.push(String(m.manifest_number));
      for (const it of (itens ?? []).filter(x => x.manifest_id === m.id)) {
        // Linha de origem conhecida (itens pendentes de vínculo, e os enviados depois desta
        // mudança): usa o custo da própria linha da nota; senão, o custo do produto na nota.
        const linha = it.source_note_item_idx != null ? itensNota[Number(it.source_note_item_idx)] : undefined;
        const unit = linha ? Math.max(0, custoUnitario(linha)) : custoDoProduto(String(it.product_id), Number(it.cost_price) || 0);
        const qtd = Number(it.qty) || 0;
        l.itens++;
        if (unit <= 0) { itensSemCusto++; manifestosSemCusto.add(String(m.manifest_number)); continue; }
        l.custo += unit * qtd;
        distribuidoNota += unit * qtd;
      }
    }
    custoTotal += totalNota;
    distribuido += distribuidoNota;
    const origem = estabDe(nota.company_id);
    if (origem) loja(origem, true).custo += Math.max(0, totalNota - distribuidoNota);
  }

  if (distribuido <= 0 || custoTotal <= 0) return null;
  const lista = [...lojas.values()]
    .map(l => ({ ...l, custo: round2(l.custo) }))
    .filter(l => l.custo > 0)
    .sort((a, b) => Number(b.origem) - Number(a.origem) || b.custo - a.custo);
  if (lista.length < 2) return null;
  return {
    notas: notas.map(n => ({ id: n.id, numero: String(n.note_number || n.file_name || 'sem número') })),
    custoTotal: round2(custoTotal),
    distribuido: round2(distribuido),
    lojas: lista,
    itensSemCusto,
    manifestosSemCusto: [...manifestosSemCusto],
  };
}

/** % de cada loja (4 casas; a última fecha os 100%). */
export function linhasProporcionais(info: DistribuicaoInfo): { estab: string; pct: number }[] {
  const total = info.lojas.reduce((a, l) => a + l.custo, 0);
  let acc = 0;
  return info.lojas.map((l, i) => {
    const pct = i === info.lojas.length - 1 ? Math.round((100 - acc) * 1e4) / 1e4 : Math.round((l.custo / total) * 1e6) / 1e4;
    acc += pct;
    return { estab: l.estab, pct };
  });
}

export const snapshotDe = (info: DistribuicaoInfo): RateioDistribuicaoSnapshot => ({
  notas: info.notas.map(n => n.id).sort(),
  custos: Object.fromEntries(info.lojas.map(l => [l.estab, l.custo])),
  total: info.custoTotal,
});

/** A distribuição atual ainda é a mesma usada no rateio? */
export function mesmaDistribuicao(a: RateioDistribuicaoSnapshot, b: RateioDistribuicaoSnapshot): boolean {
  const ka = Object.keys(a.custos).sort(), kb = Object.keys(b.custos).sort();
  if (ka.join('|') !== kb.join('|')) return false;
  if (Math.abs(a.total - b.total) >= 0.01) return false;
  return ka.every(k => Math.abs((a.custos[k] ?? 0) - (b.custos[k] ?? 0)) < 0.01);
}

// ── Aplicar direto (pergunta da Entrada de Mercadoria) ─────────────────────

/** Movimentações vinculadas à nota que podem ser rateadas (sem rateio, fora de cartão/RH/importação). */
export async function movimentacoesRateaveisDaNota(noteId: string): Promise<Transaction[]> {
  const { data: links } = await supabase.from('finance_transaction_notes').select('transaction_id').eq('note_id', noteId);
  const ids = (links ?? []).map(l => l.transaction_id as string);
  if (ids.length === 0) return [];
  const { data } = await supabase.from('finance_transactions').select('*').in('id', ids);
  return ((data ?? []) as Transaction[]).filter(t =>
    !t.rateio_id && !t.card_id && !t.is_fatura_consolidada && (!t.origem || t.origem === 'manual'));
}

/**
 * Divide cada movimentação informada entre as lojas da distribuição: cria uma parte por loja
 * (mesmos dados, valor proporcional, mesmo rateio_id) e apaga a original, mantendo pagamento
 * e notas vinculadas.
 */
export async function aplicarRateioDistribuicao(txs: Transaction[], info: DistribuicaoInfo): Promise<void> {
  const linhas = linhasProporcionais(info);
  const pesos = linhas.map(l => l.pct);
  const snapshot = snapshotDe(info);
  for (const t of txs) {
    const { data: links } = await supabase.from('finance_transaction_notes').select('note_id').eq('transaction_id', t.id);
    const noteIds = (links ?? []).map(l => l.note_id as string);
    const { id, codigo, codigo_numero, ...resto } = t as Transaction & { created_at?: string; updated_at?: string };
    delete (resto as Record<string, unknown>).created_at;
    delete (resto as Record<string, unknown>).updated_at;
    const rateioId = crypto.randomUUID();
    const partes = dividirValor(t.valor_final, pesos);
    const rows = linhas.map((l, k) => ({
      ...resto,
      estabelecimento: l.estab,
      valor_final: partes[k],
      total_pago: t.pago ? partes[k] : 0,
      rateio_id: rateioId,
      rateio_ordem: k,
      rateio_percentual: l.pct,
      rateio_distribuicao: snapshot,
    }));
    const { data: inserted, error } = await supabase.from('finance_transactions').insert(rows).select('id');
    if (error) throw new Error(error.message);
    if (noteIds.length > 0 && inserted) {
      await supabase.from('finance_transaction_notes').upsert(
        inserted.flatMap(r => noteIds.map(noteId => ({ transaction_id: r.id, note_id: noteId }))),
        { onConflict: 'transaction_id,note_id' },
      );
    }
    // A FK legada da nota aponta para a movimentação original — passa para a parte principal
    if (noteIds.length > 0 && inserted?.[0]) {
      await supabase.from('review_notes').update({ finance_transaction_id: inserted[0].id }).in('id', noteIds).eq('finance_transaction_id', t.id);
    }
    await supabase.from('finance_transactions').delete().eq('id', t.id);
  }
}
