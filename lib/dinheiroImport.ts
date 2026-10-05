// Importação das vendas em dinheiro do Retaguarda (relatório "Central de Vendas") —
// leitura do arquivo e agregação por dia de venda.
//
// Formato conhecido (central_vendas_*.xlsx, out/2026): cabeçalho na 1ª linha com nomes
// técnicos (rel_idMov, rel_dhEmi "dd/mm/aaaa hh:mm:ss", tot_vNF, mov_descPag, loj_doc...).
// Uma linha por venda; status 2 = finalizada, 3 = cancelada (valor zero).
// Pagamento misto ("DINHEIRO | DÉBITO") vem só com o total da venda — a parte em dinheiro
// é informada pelo usuário na prévia.
// Dados do cliente (rel_doc, cad_xNome) não são lidos nem gravados.

import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { buscarPaginado } from '@/lib/redeImport';

export interface PdvSale {
  id_mov: string;
  cnpj_loja: string;
  numero: string | null;
  tipo_doc: string | null;
  caixa: number | null;
  data_venda: string;       // YYYY-MM-DD
  hora_venda: string | null;
  status: number | null;
  forma_pagamento: string;
  valor_total: number;
  misto: boolean;
  valida: boolean;
}

export interface PdvLoja { cnpj: string; nome: string; vendas: number }

export interface PdvParsed {
  sales: PdvSale[];            // vendas com dinheiro (inclui canceladas, com valida = false)
  linhasLidas: number;         // linhas de venda no arquivo (antes de filtrar)
  canceladas: number;
  outrasFormas: number;        // vendas sem dinheiro na forma de pagamento (ignoradas)
  possivelCorte: boolean;      // nº de linhas com cara de limite de exportação
  periodo: [string, string];
  caixas: number[];
  lojas: PdvLoja[];
}

const norm = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const pad = (n: number) => String(n).padStart(2, '0');
const round2 = (n: number) => Math.round(n * 100) / 100;

const num = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v ?? '').trim().replace(/\s/g, '');
  if (!s || s === '-') return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

/** Valor digitado pelo usuário ("12,50", "12.5", "1.234,56"). Vazio → null. */
export function parseValorDigitado(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = num(t);
  return Number.isFinite(n) ? round2(Math.max(0, n)) : null;
}

function parseDataHora(v: unknown): { data: string; hora: string | null } | null {
  if (typeof v === 'number') {
    const p = XLSX.SSF.parse_date_code(v);
    if (!p) return null;
    return { data: `${p.y}-${pad(p.m)}-${pad(p.d)}`, hora: `${pad(p.H)}:${pad(p.M)}:${pad(Math.floor(p.S))}` };
  }
  if (v instanceof Date) return { data: `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`, hora: null };
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?/);
  if (m) return { data: `${m[3]}-${m[2]}-${m[1]}`, hora: m[4] ?? null };
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}:\d{2}(?::\d{2})?))?/);
  return m ? { data: `${m[1]}-${m[2]}-${m[3]}`, hora: m[4] ?? null } : null;
}

const COLS = {
  id: 'rel_idmov', numero: 'rel_nnf', caixa: 'cai_numcaixa', status: 'rel_indstatusmov', tipo: 'mov_desctp',
  data: 'rel_dhemi', valor: 'tot_vnf', cnpj: 'loj_doc', loja: 'loj_xnome', pagamento: 'mov_descpag',
} as const;

export async function parsePdvFile(file: File): Promise<PdvParsed> {
  const buffer = await file.arrayBuffer();
  let wb: XLSX.WorkBook;
  if (/\.csv$/i.test(file.name)) {
    let text = new TextDecoder('utf-8').decode(buffer);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buffer);
    wb = XLSX.read(text.replace(/^﻿/, ''), { type: 'string', raw: true });
  } else {
    wb = XLSX.read(buffer, { type: 'array' });
  }
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  const hIdx = linhas.slice(0, 10).findIndex(r => (r ?? []).some(c => norm(c) === COLS.id));
  if (hIdx < 0) throw new Error('Não encontrei a coluna "rel_idMov". Este arquivo não parece ser a Central de Vendas do Retaguarda.');
  const header = (linhas[hIdx] ?? []).map(norm);
  const idx = Object.fromEntries(Object.entries(COLS).map(([k, n]) => [k, header.indexOf(n)])) as Record<keyof typeof COLS, number>;
  const faltando = (['id', 'data', 'valor', 'pagamento', 'cnpj'] as const).filter(k => idx[k] < 0).map(k => COLS[k]);
  if (faltando.length) throw new Error(`Colunas faltando no relatório: ${faltando.join(', ')}.`);

  const sales: PdvSale[] = [];
  let linhasLidas = 0, canceladas = 0, outrasFormas = 0;
  const lojas = new Map<string, PdvLoja>();
  const caixas = new Set<number>();

  for (const r of linhas.slice(hIdx + 1)) {
    if (!r || r.every(c => c === null || String(c).trim() === '')) continue;
    const get = (k: keyof typeof COLS) => (idx[k] >= 0 ? r[idx[k]] : null);
    const id = String(get('id') ?? '').trim();
    const dh = parseDataHora(get('data'));
    if (!id || !dh) continue;
    linhasLidas++;

    const pagamento = String(get('pagamento') ?? '').trim();
    const formas = pagamento.split('|').map(p => norm(p)).filter(Boolean);
    if (!formas.includes('dinheiro')) { outrasFormas++; continue; }

    const statusRaw = get('status');
    const status = statusRaw === null || statusRaw === '' ? null : Math.round(num(statusRaw));
    const valida = status === null || status === 2;
    if (!valida) canceladas++;
    const cnpj = String(get('cnpj') ?? '').replace(/\D/g, '');
    const caixa = get('caixa') === null ? null : Math.round(num(get('caixa')));
    if (caixa !== null) caixas.add(caixa);

    sales.push({
      id_mov: id,
      cnpj_loja: cnpj,
      numero: get('numero') === null ? null : String(get('numero')),
      tipo_doc: get('tipo') === null ? null : String(get('tipo')),
      caixa,
      data_venda: dh.data,
      hora_venda: dh.hora,
      status,
      forma_pagamento: pagamento,
      valor_total: round2(num(get('valor'))),
      misto: formas.length > 1,
      valida,
    });
    const l = lojas.get(cnpj) ?? { cnpj, nome: String(get('loja') ?? '').trim(), vendas: 0 };
    l.vendas++;
    lojas.set(cnpj, l);
  }

  if (sales.length === 0) throw new Error(outrasFormas ? 'Nenhuma venda em dinheiro no arquivo.' : 'Nenhuma venda encontrada no arquivo.');
  const datas = sales.map(s => s.data_venda).sort();
  // Exportações costumam cortar em números redondos (1.000, 2.000…): avisa quando o total
  // de linhas do arquivo (com cabeçalho) cai exatamente num deles.
  const totalLinhas = linhasLidas + 1;
  return {
    sales, linhasLidas, canceladas, outrasFormas,
    possivelCorte: totalLinhas >= 500 && totalLinhas % 500 === 0,
    periodo: [datas[0], datas[datas.length - 1]],
    caixas: [...caixas].sort((a, b) => a - b),
    lojas: [...lojas.values()],
  };
}

// ── Agregação por dia ─────────────────────────────────────────────────────

export interface PdvDia {
  cnpj: string;
  data: string;
  total: number;            // dinheiro do dia (vendas só em dinheiro + parte em dinheiro das mistas)
  nPuro: number;
  nMisto: number;
  mistoDinheiro: number;
  porCaixa: Record<string, number>;
}

export const pdvDiaKey = (cnpj: string, data: string) => `${cnpj}|${data}`;
export const pdvRef = (cnpj: string, data: string) => `retaguarda:${cnpj}:${data}:dinheiro`;

type SaleLike = Pick<PdvSale, 'cnpj_loja' | 'data_venda' | 'caixa' | 'misto' | 'valida'> & { valor_dinheiro: number };

export function agregarPdvPorDia(sales: SaleLike[]): Map<string, PdvDia> {
  const out = new Map<string, PdvDia>();
  for (const s of sales) {
    if (!s.valida) continue;
    const k = pdvDiaKey(s.cnpj_loja, s.data_venda);
    const d = out.get(k) ?? { cnpj: s.cnpj_loja, data: s.data_venda, total: 0, nPuro: 0, nMisto: 0, mistoDinheiro: 0, porCaixa: {} };
    const v = Number(s.valor_dinheiro) || 0;
    d.total += v;
    if (s.misto) { d.nMisto++; d.mistoDinheiro += v; } else d.nPuro++;
    const cx = String(s.caixa ?? '—');
    d.porCaixa[cx] = (d.porCaixa[cx] ?? 0) + v;
    out.set(k, d);
  }
  for (const d of out.values()) {
    d.total = round2(d.total);
    d.mistoDinheiro = round2(d.mistoDinheiro);
    for (const c of Object.keys(d.porCaixa)) d.porCaixa[c] = round2(d.porCaixa[c]);
  }
  return out;
}

// ── Banco ─────────────────────────────────────────────────────────────────

export interface PdvConfig { estabelecimentos: Record<string, string>; tag_dinheiro: string | null }

export async function carregarPdvConfig(): Promise<PdvConfig> {
  const { data, error } = await supabase.from('finance_pdv_config').select('*').eq('id', 1).maybeSingle();
  if (error) {
    if (/finance_pdv_config/.test(error.message) || error.code === '42P01' || error.code === 'PGRST205')
      throw new Error('As tabelas da importação de dinheiro ainda não existem. Rode supabase/add_finance_dinheiro_import.sql no SQL Editor do Supabase.');
    throw new Error(error.message);
  }
  return { estabelecimentos: (data?.estabelecimentos as Record<string, string>) ?? {}, tag_dinheiro: data?.tag_dinheiro ?? null };
}

export async function salvarPdvConfig(cfg: PdvConfig) {
  const { error } = await supabase.from('finance_pdv_config').upsert({ id: 1, ...cfg, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export interface PdvSaleDb { id_mov: string; cnpj_loja: string; data_venda: string; caixa: number | null; misto: boolean; valida: boolean; valor_dinheiro: number }
const COLS_DB = 'id_mov, cnpj_loja, data_venda, caixa, misto, valida, valor_dinheiro';

export async function vendasPdvPorId(ids: string[]): Promise<PdvSaleDb[]> {
  const out: PdvSaleDb[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('finance_pdv_sales').select(COLS_DB).in('id_mov', ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as PdvSaleDb[]));
  }
  return out;
}

async function vendasPdvDosDias(dias: { cnpj: string; data: string }[]): Promise<PdvSaleDb[]> {
  const porCnpj = new Map<string, string[]>();
  for (const d of dias) porCnpj.set(d.cnpj, [...(porCnpj.get(d.cnpj) ?? []), d.data]);
  const out: PdvSaleDb[] = [];
  for (const [cnpj, datas] of porCnpj) {
    const ord = [...datas].sort();
    const rows = await buscarPaginado<PdvSaleDb>((from, to) =>
      supabase.from('finance_pdv_sales').select(COLS_DB)
        .eq('cnpj_loja', cnpj).gte('data_venda', ord[0]).lte('data_venda', ord[ord.length - 1])
        .order('id').range(from, to));
    const set = new Set(datas);
    out.push(...rows.filter(r => set.has(r.data_venda)));
  }
  return out;
}

const fmtBRL = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function descricao(d: PdvDia): string {
  const caixas = Object.entries(d.porCaixa).sort(([a], [b]) => a.localeCompare(b)).map(([c, v]) => `Caixa ${c}: ${fmtBRL(v)}`).join(' · ');
  const mistas = d.nMisto ? ` + ${d.nMisto} ${d.nMisto === 1 ? 'mista' : 'mistas'} (${fmtBRL(d.mistoDinheiro)} em dinheiro)` : '';
  return `Vendas em dinheiro · ${d.nPuro} vendas${mistas} · ${caixas}`;
}

/** Recalcula a receita "Dinheiro" de cada dia a partir das vendas gravadas no banco. */
export async function sincronizarDiasPdv(
  dias: { cnpj: string; data: string }[],
  cfg: PdvConfig,
  importId: string | null,
): Promise<{ criadas: number; atualizadas: number; removidas: number }> {
  const res = { criadas: 0, atualizadas: 0, removidas: 0 };
  if (dias.length === 0) return res;
  const agregados = agregarPdvPorDia(await vendasPdvDosDias(dias));
  const refs = dias.map(d => pdvRef(d.cnpj, d.data));
  const existentes = new Map<string, { id: string; valor_final: number; pago: boolean }>();
  for (let i = 0; i < refs.length; i += 150) {
    const { data, error } = await supabase.from('finance_transactions').select('id, origem_ref, valor_final, pago').in('origem_ref', refs.slice(i, i + 150));
    if (error) throw new Error(error.message);
    for (const t of data ?? []) existentes.set(t.origem_ref as string, t as { id: string; valor_final: number; pago: boolean });
  }

  const inserir: Record<string, unknown>[] = [];
  const remover: string[] = [];
  for (const dia of dias) {
    const ag = agregados.get(pdvDiaKey(dia.cnpj, dia.data));
    const ref = pdvRef(dia.cnpj, dia.data);
    const tx = existentes.get(ref);
    const valor = ag?.total ?? 0;
    if (valor <= 0) { if (tx) remover.push(tx.id); continue; }
    if (tx) {
      const patch: Record<string, unknown> = { valor_final: valor, observacoes: descricao(ag!) };
      if (tx.pago) patch.total_pago = valor;
      const { error } = await supabase.from('finance_transactions').update(patch).eq('id', tx.id);
      if (error) throw new Error(error.message);
      if (Math.abs(Number(tx.valor_final) - valor) >= 0.005) res.atualizadas++;
      continue;
    }
    const estab = cfg.estabelecimentos[dia.cnpj];
    if (!estab) throw new Error(`Loja de CNPJ ${dia.cnpj} sem estabelecimento definido.`);
    inserir.push({
      data: dia.data,
      tipo: 'Receita',
      tipo_pagamento: 'Dinheiro',
      favorecido: 'Vendas balcão',
      estabelecimento: estab,
      vencimento: dia.data,
      valor_final: valor,
      total_pago: valor,
      pago: true,
      data_pagamento: dia.data,
      numero_cheque: null, identificacao: null, numero_parcela: null, total_parcelas: null,
      parcelamento_id: null, codigo_barras: null,
      tag_ids: cfg.tag_dinheiro ? [cfg.tag_dinheiro] : [],
      observacoes: descricao(ag!),
      import_id: importId,
      origem: 'retaguarda',
      origem_ref: ref,
    });
  }
  for (let i = 0; i < inserir.length; i += 200) {
    const { error } = await supabase.from('finance_transactions').insert(inserir.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
  res.criadas = inserir.length;
  for (let i = 0; i < remover.length; i += 150) {
    const { error } = await supabase.from('finance_transactions').delete().in('id', remover.slice(i, i + 150));
    if (error) throw new Error(error.message);
  }
  res.removidas = remover.length;
  return res;
}
