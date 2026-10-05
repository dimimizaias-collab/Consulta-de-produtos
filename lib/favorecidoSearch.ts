import type { Favorecido, Supplier } from '@/types/finance';

// Busca de favorecido por nome fiscal, nome no extrato, apelidos e dados do
// fornecedor vinculado (nome, fantasia, razão social, CNPJ/CPF). Ignora
// maiúsculas, acentos e pontuação; devolve também em qual campo bateu e o
// trecho casado, pra lista de sugestões mostrar "por que" o item apareceu.

export type FavMatchField = 'nome' | 'apelido' | 'extrato' | 'fornecedor' | 'fantasia' | 'razao' | 'documento';

export interface FavMatch {
  fav: Favorecido;
  field: FavMatchField;
  /** Texto original do campo que casou. */
  value: string;
  /** Trecho casado dentro de `value` ([início, fim) em índices do texto original). */
  range: [number, number] | null;
  rank: number;
}

export const FAV_MATCH_LABEL: Record<FavMatchField, string> = {
  nome: 'Nome fiscal',
  apelido: 'Apelido',
  extrato: 'Extrato',
  fornecedor: 'Fornecedor',
  fantasia: 'Fantasia',
  razao: 'Razão social',
  documento: 'CNPJ/CPF',
};

const MIN_DOC_DIGITS = 3;

/** Normaliza mantendo o índice de cada caractere no texto original. */
function indexed(text: string, digitsOnly = false) {
  let norm = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (const ch of c) {
      if (digitsOnly ? /[0-9]/.test(ch) : /[a-z0-9 ]/.test(ch)) {
        norm += ch;
        map.push(i);
      }
    }
  }
  return { norm, map };
}

export function normalizeSearch(text: string) {
  return indexed(text).norm.replace(/\s+/g, ' ').trim();
}

function find(text: string, q: string, digitsOnly = false): { start: boolean; range: [number, number] } | null {
  if (!text || !q) return null;
  const { norm, map } = indexed(text, digitsOnly);
  // Colapsa espaços repetidos sem perder o mapeamento de índices.
  let collapsed = '';
  const cmap: number[] = [];
  for (let i = 0; i < norm.length; i++) {
    if (norm[i] === ' ' && (collapsed.endsWith(' ') || collapsed === '')) continue;
    collapsed += norm[i];
    cmap.push(map[i]);
  }
  const at = collapsed.indexOf(q);
  if (at < 0) return null;
  return { start: at === 0, range: [cmap[at], cmap[at + q.length - 1] + 1] };
}

function matchOne(fav: Favorecido, sup: Supplier | undefined, q: string, qDigits: string | null): FavMatch | null {
  const nome = find(fav.nome_fiscal, q);
  if (nome) return { fav, field: 'nome', value: fav.nome_fiscal, range: nome.range, rank: nome.start ? 0 : 1 };

  for (const ap of fav.apelidos ?? []) {
    const m = find(ap, q);
    if (m) return { fav, field: 'apelido', value: ap, range: m.range, rank: 2 };
  }

  const extrato = find(fav.nome_banco, q);
  if (extrato) return { fav, field: 'extrato', value: fav.nome_banco, range: extrato.range, rank: 3 };

  if (sup) {
    const supFields: [FavMatchField, string | undefined][] = [
      ['fantasia', sup.nome_fantasia],
      ['fornecedor', sup.name],
      ['razao', sup.razao_social],
    ];
    for (const [field, value] of supFields) {
      if (!value) continue;
      const m = find(value, q);
      if (m) return { fav, field, value, range: m.range, rank: 4 };
    }
    if (qDigits && sup.documento) {
      const m = find(sup.documento, qDigits, true);
      if (m) return { fav, field: 'documento', value: sup.documento, range: m.range, rank: 5 };
    }
  }
  return null;
}

export function searchFavorecidos(favorecidos: Favorecido[], suppliers: Supplier[], query: string): FavMatch[] {
  const q = normalizeSearch(query);
  if (!q) return favorecidos.map(fav => ({ fav, field: 'nome', value: fav.nome_fiscal, range: null, rank: 0 }));

  // CNPJ/CPF só entra quando o texto não tem letras e tem dígitos suficientes.
  const digits = query.replace(/\D/g, '');
  const qDigits = !/[a-z]/i.test(query) && digits.length >= MIN_DOC_DIGITS ? digits : null;

  const supById = new Map(suppliers.map(s => [s.id, s]));
  const out: FavMatch[] = [];
  for (const fav of favorecidos) {
    const m = matchOne(fav, fav.supplier_id ? supById.get(fav.supplier_id) : undefined, q, qDigits);
    if (m) out.push(m);
  }
  return out.sort((a, b) => a.rank - b.rank || a.fav.nome_fiscal.localeCompare(b.fav.nome_fiscal, 'pt-BR'));
}

/** Lista de apelidos limpa: sem vazios, sem duplicatas (comparando sem acento/caixa). */
export function cleanApelidos(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = raw.trim().replace(/\s+/g, ' ');
    const key = normalizeSearch(v);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}
