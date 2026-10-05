// Importação do relatório de vendas da Rede (maquininha) — leitura do arquivo (Excel ou
// CSV), cálculo do dia de recebimento e agregação por dia/modalidade.
//
// Formato conhecido (Rede › Vendas › Exportar, set/2026):
// - Excel: 1ª linha é um aviso ("EXTRATO PARA SIMPLES CONFERÊNCIA..."), cabeçalho na 2ª;
//   datas como serial do Excel, taxas como fração (0.0131).
// - CSV: UTF-8, separado por ';', valores "1.234,56", taxas "1,31%", datas dd/mm/aaaa.
// Uma linha por venda. Líquido = bruto − MDR − recebimento automático (antecipação).

import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

export type RedeModalidade = 'credito' | 'debito' | 'pix';
export type RedeKind = 'credito' | 'debito' | 'mdr' | 'antecipacao';

export interface RedeSale {
  numero_estabelecimento: string;
  nsu: string;
  data_venda: string;        // YYYY-MM-DD
  hora_venda: string | null;
  data_recebimento: string;  // YYYY-MM-DD
  modalidade: RedeModalidade;
  tipo: string | null;
  parcelas: number;
  bandeira: string | null;
  valor_bruto: number;
  taxa_mdr: number;
  valor_mdr: number;
  taxa_antecipacao: number;
  valor_antecipacao: number;
  valor_liquido: number;
  maquininha: string | null;
  autorizacao: string | null;
  status: string | null;
  cancelada: boolean;
  valor_cancelado: number;
  chargeback: boolean;
  valida: boolean;
}

export interface RedeEstabInfo { numero: string; nome: string; cnpj: string; vendas: number; maquinas: string[] }

export interface RedeParsed {
  sales: RedeSale[];         // crédito/débito (PIX fica de fora por enquanto)
  pixIgnoradas: number;
  invalidas: number;         // canceladas / não aprovadas (guardadas, mas fora da soma)
  periodo: [string, string];
  maquinas: string[];
  estabelecimentos: RedeEstabInfo[];
}

// ── Utilidades ─────────────────────────────────────────────────────────────

const norm = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const num = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v ?? '').trim();
  if (!s || s === '-') return 0;
  const pct = s.endsWith('%');
  s = s.replace('%', '').replace(/\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return pct ? n / 100 : n;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');
const isoUTC = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromIso = (s: string) => new Date(`${s}T00:00:00Z`);

const parseData = (v: unknown): string | null => {
  if (typeof v === 'number') {
    const p = XLSX.SSF.parse_date_code(v);
    return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : null;
  }
  if (v instanceof Date) return isoUTC(v);
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

const parseHora = (v: unknown): string | null => {
  if (typeof v === 'number') {
    const secs = Math.round((v % 1) * 86400);
    return `${pad(Math.floor(secs / 3600) % 24)}:${pad(Math.floor(secs / 60) % 60)}:${pad(secs % 60)}`;
  }
  const s = String(v ?? '').trim();
  return s && s !== '-' ? s : null;
};

const texto = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s && s !== '-' ? s : null;
};

// ── Dias úteis (calendário bancário nacional) ─────────────────────────────

function pascoa(ano: number): Date {
  // Algoritmo de Meeus/Jones/Butcher
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const feriadosCache = new Map<number, Set<string>>();
/** Feriados nacionais + dias sem expediente bancário (Carnaval, Sexta Santa, Corpus Christi). */
export function feriadosBancarios(ano: number): Set<string> {
  const cached = feriadosCache.get(ano);
  if (cached) return cached;
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map(md => `${ano}-${md}`);
  const p = pascoa(ano);
  const rel = (dias: number) => { const d = new Date(p); d.setUTCDate(d.getUTCDate() + dias); return isoUTC(d); };
  const set = new Set([...fixos, rel(-48), rel(-47), rel(-2), rel(60)]);
  feriadosCache.set(ano, set);
  return set;
}

const diaUtil = (d: Date) => {
  const w = d.getUTCDay();
  return w !== 0 && w !== 6 && !feriadosBancarios(d.getUTCFullYear()).has(isoUTC(d));
};

/** Data de recebimento a partir do "Prazo de recebimento" da Rede ("1 dia útil", "2 dias"...). */
export function calcularRecebimento(dataVenda: string, prazo: string): string {
  const p = norm(prazo);
  const n = parseInt(p, 10);
  const dias = Number.isFinite(n) && n >= 0 ? n : 1;
  const d = fromIso(dataVenda);
  if (/util|uteis/.test(p) || !Number.isFinite(n)) {
    let faltam = dias;
    while (faltam > 0) { d.setUTCDate(d.getUTCDate() + 1); if (diaUtil(d)) faltam--; }
  } else {
    d.setUTCDate(d.getUTCDate() + dias);
    while (!diaUtil(d)) d.setUTCDate(d.getUTCDate() + 1);
  }
  return isoUTC(d);
}

// ── Leitura do arquivo ────────────────────────────────────────────────────

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ';') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

async function lerLinhas(file: File): Promise<unknown[][]> {
  const buffer = await file.arrayBuffer();
  if (/\.csv$/i.test(file.name)) {
    let text = new TextDecoder('utf-8').decode(buffer);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buffer);
    return parseCsv(text.replace(/^﻿/, ''));
  }
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
}

const COLS = {
  data: 'data da venda', hora: 'hora da venda', status: 'status da venda',
  valor: 'valor da venda atualizado', valorOriginal: 'valor da venda original',
  modalidade: 'modalidade', tipo: 'tipo', parcelas: 'numero de parcelas', bandeira: 'bandeira',
  taxaMdr: 'taxa mdr', valorMdr: 'valor mdr',
  taxaAnt: 'taxa de recebimento automatico', valorAnt: 'valor taxa de recebimento automatico',
  liquido: 'valor liquido', nsu: 'nsu/cv', prazo: 'prazo de recebimento',
  autorizacao: 'numero da autorizacao (auto)', estab: 'numero do estabelecimento',
  nomeEstab: 'nome do estabelecimento', cnpj: 'cnpj', maquina: 'codigo da maquininha',
  cancelada: 'cancelada pelo estabelecimento', valorCancelado: 'valor cancelado',
  chargeback: 'em disputa de chargeback', idTransacao: 'id transacao',
} as const;
const OBRIGATORIAS: (keyof typeof COLS)[] = ['data', 'modalidade', 'valor', 'liquido', 'nsu', 'prazo', 'estab'];

export async function parseRedeFile(file: File): Promise<RedeParsed> {
  const linhas = await lerLinhas(file);
  const hIdx = linhas.slice(0, 15).findIndex(r => (r ?? []).some(c => norm(c) === COLS.data));
  if (hIdx < 0) throw new Error('Não encontrei a coluna "data da venda". Este arquivo não parece ser o relatório de vendas da Rede.');
  const header = (linhas[hIdx] ?? []).map(norm);
  const idx = Object.fromEntries(Object.entries(COLS).map(([k, nome]) => [k, header.indexOf(nome)])) as Record<keyof typeof COLS, number>;
  const faltando = OBRIGATORIAS.filter(k => idx[k] < 0).map(k => COLS[k]);
  if (faltando.length) throw new Error(`Colunas faltando no relatório: ${faltando.join(', ')}.`);

  const sales: RedeSale[] = [];
  let pixIgnoradas = 0, invalidas = 0;
  const estabs = new Map<string, RedeEstabInfo & { maqSet: Set<string> }>();
  const maquinas = new Set<string>();

  for (const r of linhas.slice(hIdx + 1)) {
    if (!r) continue;
    const get = (k: keyof typeof COLS) => (idx[k] >= 0 ? r[idx[k]] : null);
    const dataVenda = parseData(get('data'));
    if (!dataVenda) continue;
    const mod = norm(get('modalidade'));
    const modalidade: RedeModalidade | null = mod.startsWith('cred') ? 'credito' : mod.startsWith('deb') ? 'debito' : mod.includes('pix') ? 'pix' : null;
    if (!modalidade) continue;
    if (modalidade === 'pix') { pixIgnoradas++; continue; }

    const numero = String(get('estab') ?? '').trim();
    const nsu = texto(get('nsu')) ?? texto(get('idTransacao'));
    if (!numero || !nsu) continue;

    const status = texto(get('status'));
    const cancelada = norm(get('cancelada')) === 'sim';
    const valida = (!status || norm(status) === 'aprovada') && !cancelada;
    if (!valida) invalidas++;
    const maquina = texto(get('maquina'));

    sales.push({
      numero_estabelecimento: numero,
      nsu,
      data_venda: dataVenda,
      hora_venda: parseHora(get('hora')),
      data_recebimento: calcularRecebimento(dataVenda, String(get('prazo') ?? '')),
      modalidade,
      tipo: texto(get('tipo')),
      parcelas: Math.max(1, Math.round(num(get('parcelas'))) || 1),
      bandeira: texto(get('bandeira')),
      valor_bruto: round2(num(get('valor')) || num(get('valorOriginal'))),
      taxa_mdr: num(get('taxaMdr')),
      valor_mdr: round2(num(get('valorMdr'))),
      taxa_antecipacao: num(get('taxaAnt')),
      valor_antecipacao: round2(num(get('valorAnt'))),
      valor_liquido: round2(num(get('liquido'))),
      maquininha: maquina,
      autorizacao: texto(get('autorizacao')),
      status,
      cancelada,
      valor_cancelado: round2(num(get('valorCancelado'))),
      chargeback: norm(get('chargeback')) === 'sim',
      valida,
    });

    if (maquina) maquinas.add(maquina);
    const e = estabs.get(numero) ?? { numero, nome: String(get('nomeEstab') ?? '').trim(), cnpj: String(get('cnpj') ?? '').trim(), vendas: 0, maquinas: [], maqSet: new Set<string>() };
    e.vendas++;
    if (maquina) e.maqSet.add(maquina);
    estabs.set(numero, e);
  }

  if (sales.length === 0) throw new Error(pixIgnoradas ? 'O arquivo só tem vendas PIX — a importação de PIX ainda não está disponível.' : 'Nenhuma venda encontrada no arquivo.');

  const datas = sales.map(s => s.data_venda).sort();
  return {
    sales,
    pixIgnoradas,
    invalidas,
    periodo: [datas[0], datas[datas.length - 1]],
    maquinas: [...maquinas].sort(),
    estabelecimentos: [...estabs.values()].map(({ maqSet, ...e }) => ({ ...e, maquinas: [...maqSet].sort() })),
  };
}

// ── Agregação por dia de recebimento ──────────────────────────────────────

export interface RedeDia {
  numero: string;
  data: string;              // data de recebimento
  credito: number; nCredito: number;
  debito: number; nDebito: number;
  mdr: number; antecipacao: number; liquido: number;
  vendasDe: string[];        // datas de venda que caem neste recebimento
  maquinas: string[];
}

export const diaKey = (numero: string, data: string) => `${numero}|${data}`;
export const redeRef = (numero: string, data: string, kind: RedeKind) => `rede:${numero}:${data}:${kind}`;

type SaleLike = Pick<RedeSale, 'numero_estabelecimento' | 'data_recebimento' | 'data_venda' | 'modalidade' | 'valor_bruto' | 'valor_mdr' | 'valor_antecipacao' | 'valor_liquido' | 'maquininha' | 'valida'>;

export function agregarPorDia(sales: SaleLike[]): Map<string, RedeDia> {
  const out = new Map<string, RedeDia & { _v: Set<string>; _m: Set<string> }>();
  for (const s of sales) {
    if (!s.valida) continue;
    const k = diaKey(s.numero_estabelecimento, s.data_recebimento);
    let d = out.get(k);
    if (!d) {
      d = { numero: s.numero_estabelecimento, data: s.data_recebimento, credito: 0, nCredito: 0, debito: 0, nDebito: 0, mdr: 0, antecipacao: 0, liquido: 0, vendasDe: [], maquinas: [], _v: new Set(), _m: new Set() };
      out.set(k, d);
    }
    const bruto = Number(s.valor_bruto) || 0;
    if (s.modalidade === 'credito') { d.credito += bruto; d.nCredito++; }
    else if (s.modalidade === 'debito') { d.debito += bruto; d.nDebito++; }
    d.mdr += Number(s.valor_mdr) || 0;
    d.antecipacao += Number(s.valor_antecipacao) || 0;
    d.liquido += Number(s.valor_liquido) || 0;
    d._v.add(s.data_venda);
    if (s.maquininha) d._m.add(s.maquininha);
  }
  const res = new Map<string, RedeDia>();
  for (const [k, { _v, _m, ...d }] of out) {
    res.set(k, {
      ...d,
      credito: round2(d.credito), debito: round2(d.debito), mdr: round2(d.mdr),
      antecipacao: round2(d.antecipacao), liquido: round2(d.liquido),
      vendasDe: [..._v].sort(), maquinas: [..._m].sort(),
    });
  }
  return res;
}

// ── Acesso ao banco ───────────────────────────────────────────────────────

export interface RedeConfig {
  estabelecimentos: Record<string, string>;
  tag_credito: string | null;
  tag_debito: string | null;
  tag_mdr: string | null;
  tag_antecipacao: string | null;
}

export async function carregarRedeConfig(): Promise<RedeConfig> {
  const { data, error } = await supabase.from('finance_rede_config').select('*').eq('id', 1).maybeSingle();
  if (error) {
    if (/finance_rede_config/.test(error.message) || error.code === '42P01' || error.code === 'PGRST205')
      throw new Error('As tabelas da importação Rede ainda não existem. Rode supabase/add_finance_rede_import.sql no SQL Editor do Supabase.');
    throw new Error(error.message);
  }
  return {
    estabelecimentos: (data?.estabelecimentos as Record<string, string>) ?? {},
    tag_credito: data?.tag_credito ?? null,
    tag_debito: data?.tag_debito ?? null,
    tag_mdr: data?.tag_mdr ?? null,
    tag_antecipacao: data?.tag_antecipacao ?? null,
  };
}

export async function salvarRedeConfig(cfg: RedeConfig) {
  const { error } = await supabase.from('finance_rede_config').upsert({ id: 1, ...cfg, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

const SALE_COLS = 'numero_estabelecimento, nsu, data_venda, data_recebimento, modalidade, valor_bruto, valor_mdr, valor_antecipacao, valor_liquido, maquininha, valida';
type DbSale = SaleLike & { nsu: string };

/** Busca paginada (o Supabase devolve no máximo 1000 linhas por consulta). */
async function buscarPaginado<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Vendas já gravadas no banco que podem colidir com o arquivo (mesmo estabelecimento e período). */
export async function vendasExistentesNoPeriodo(numeros: string[], de: string, ate: string): Promise<DbSale[]> {
  return buscarPaginado<DbSale>((from, to) =>
    supabase.from('finance_rede_sales').select(SALE_COLS)
      .in('numero_estabelecimento', numeros).gte('data_venda', de).lte('data_venda', ate)
      .order('id').range(from, to));
}

/** Vendas gravadas nos dias de recebimento informados. */
export async function vendasDosDias(dias: { numero: string; data: string }[]): Promise<DbSale[]> {
  if (dias.length === 0) return [];
  const porNumero = new Map<string, string[]>();
  for (const d of dias) porNumero.set(d.numero, [...(porNumero.get(d.numero) ?? []), d.data]);
  const out: DbSale[] = [];
  for (const [numero, datas] of porNumero) {
    const ord = [...datas].sort();
    const rows = await buscarPaginado<DbSale>((from, to) =>
      supabase.from('finance_rede_sales').select(SALE_COLS)
        .eq('numero_estabelecimento', numero).gte('data_recebimento', ord[0]).lte('data_recebimento', ord[ord.length - 1])
        .order('id').range(from, to));
    const set = new Set(datas);
    out.push(...rows.filter(r => set.has(r.data_recebimento)));
  }
  return out;
}

export const saleKey = (s: Pick<RedeSale, 'numero_estabelecimento' | 'nsu' | 'data_venda'>) => `${s.numero_estabelecimento}|${s.nsu}|${s.data_venda}`;

export interface TxExistente { id: string; origem_ref: string; valor_final: number; pago: boolean }

export async function movimentacoesPorRef(refs: string[]): Promise<TxExistente[]> {
  const out: TxExistente[] = [];
  for (let i = 0; i < refs.length; i += 150) {
    const { data, error } = await supabase.from('finance_transactions')
      .select('id, origem_ref, valor_final, pago').in('origem_ref', refs.slice(i, i + 150));
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as TxExistente[]));
  }
  return out;
}

const KINDS: RedeKind[] = ['credito', 'debito', 'mdr', 'antecipacao'];

const fmtDm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function descricao(d: RedeDia, kind: RedeKind): string {
  const de = d.vendasDe.length === 1 ? fmtDm(d.vendasDe[0]) : `${fmtDm(d.vendasDe[0])} a ${fmtDm(d.vendasDe[d.vendasDe.length - 1])}`;
  const maq = d.maquinas.length ? ` · máquinas ${d.maquinas.join(', ')}` : '';
  switch (kind) {
    case 'credito': return `Vendas crédito Rede · ${d.nCredito} vendas de ${de}${maq}`;
    case 'debito': return `Vendas débito Rede · ${d.nDebito} vendas de ${de}${maq}`;
    case 'mdr': return `Taxa MDR Rede · vendas de ${de}`;
    case 'antecipacao': return `Antecipação (recebimento automático) Rede · vendas de ${de}`;
  }
}

export const valorDoKind = (d: RedeDia, kind: RedeKind) =>
  kind === 'credito' ? d.credito : kind === 'debito' ? d.debito : kind === 'mdr' ? d.mdr : d.antecipacao;

export interface SyncResultado { criadas: number; atualizadas: number; removidas: number }

/**
 * Recalcula as movimentações (crédito, débito, MDR, antecipação) dos dias de recebimento
 * informados a partir das vendas gravadas no banco: cria o que falta, atualiza o valor do
 * que mudou e remove o que zerou. Preserva tags/conta/observações editadas pelo usuário
 * nas movimentações que já existiam (só valor e pagamento são atualizados).
 */
export async function sincronizarDias(
  dias: { numero: string; data: string }[],
  cfg: RedeConfig,
  importId: string | null,
  hojeIso: string,
): Promise<SyncResultado> {
  const res: SyncResultado = { criadas: 0, atualizadas: 0, removidas: 0 };
  if (dias.length === 0) return res;
  const agregados = agregarPorDia(await vendasDosDias(dias));
  const refs = dias.flatMap(d => KINDS.map(k => redeRef(d.numero, d.data, k)));
  const existentes = new Map((await movimentacoesPorRef(refs)).map(t => [t.origem_ref, t]));
  const tagDe: Record<RedeKind, string | null> = { credito: cfg.tag_credito, debito: cfg.tag_debito, mdr: cfg.tag_mdr, antecipacao: cfg.tag_antecipacao };

  const inserir: Record<string, unknown>[] = [];
  const remover: string[] = [];
  for (const dia of dias) {
    const ag = agregados.get(diaKey(dia.numero, dia.data));
    const estab = cfg.estabelecimentos[dia.numero];
    for (const kind of KINDS) {
      const ref = redeRef(dia.numero, dia.data, kind);
      const valor = ag ? valorDoKind(ag, kind) : 0;
      const tx = existentes.get(ref);
      if (valor <= 0) { if (tx) remover.push(tx.id); continue; }
      const pago = dia.data <= hojeIso;
      if (tx) {
        if (Math.abs(Number(tx.valor_final) - valor) < 0.005) continue;
        const patch: Record<string, unknown> = { valor_final: valor, observacoes: descricao(ag!, kind) };
        if (tx.pago) patch.total_pago = valor;
        const { error } = await supabase.from('finance_transactions').update(patch).eq('id', tx.id);
        if (error) throw new Error(error.message);
        res.atualizadas++;
      } else {
        if (!estab) throw new Error(`Estabelecimento Rede nº ${dia.numero} sem loja definida.`);
        const tag = tagDe[kind];
        inserir.push({
          data: dia.data,
          tipo: kind === 'credito' || kind === 'debito' ? 'Receita' : 'Despesa',
          tipo_pagamento: 'Transferência',
          favorecido: 'Rede',
          estabelecimento: estab,
          vencimento: dia.data,
          valor_final: valor,
          total_pago: pago ? valor : 0,
          pago,
          data_pagamento: pago ? dia.data : null,
          numero_cheque: null, identificacao: null, numero_parcela: null, total_parcelas: null,
          parcelamento_id: null, codigo_barras: null,
          tag_ids: tag ? [tag] : [],
          observacoes: descricao(ag!, kind),
          import_id: importId,
          origem: 'rede',
          origem_ref: ref,
        });
      }
    }
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

export async function hashArquivo(file: File): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
