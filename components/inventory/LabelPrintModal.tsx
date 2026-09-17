'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Tag, Printer, Plus, Minus, ChevronDown, Check, Pencil, Send, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateBarcodeDataUrl, formatCNPJ } from './labelPrintUtils';
import { LabelEditModal } from './LabelEditModal';

export const blockWheelChange = (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur();

// Elgin L42 Pro — etiqueta térmica em bobina contínua (uma etiqueta por vez,
// sem grid de blocos de folha). Este módulo é dedicado exclusivamente a essa impressora.
export const ELGIN_LABEL_W = 105; // mm
export const ELGIN_LABEL_H = 28;  // mm — etiqueta de gôndola real medida (não 30mm)
export const HALF_OFFSET_X = ELGIN_LABEL_W / 2; // 52.5mm — onde começa a 2ª metade

export interface ElPos { x: number; y: number; w: number; h: number }
export interface CellLayout { nome: ElPos; ref: ElPos; barcode: ElPos; rs: ElPos; preco: ElPos }

// Posições em mm, origem no canto superior esquerdo de cada etiqueta/metade.
// Extraídas por análise de pixel de um par de imagens de referência fornecidas
// pelo usuário (retângulos coloridos delimitando cada elemento — legenda:
// #ff66c4 nome, #ff5757 ref, #5e17eb código de barras, #ffbd59 R$, #7ed957
// preço), medidas em % da largura/altura do rótulo e convertidas pra mm.
export const FULL_LAYOUT: CellLayout = {
  nome:    { x: 3,    y: 2.9,  w: 99,   h: 4.1  },
  ref:     { x: 3,    y: 8.2,  w: 34,   h: 2.5  },
  barcode: { x: 3,    y: 12.7, w: 49,   h: 12.4 },
  rs:      { x: 60.3, y: 11.8, w: 5,    h: 4.5  },
  preco:   { x: 65.6, y: 11.8, w: 35.3, h: 13.4 },
};
// Conteúdo 2mm mais para cima que a extração original (3mm pra cima, depois
// 1mm de volta pra baixo) e a distância entre o REF e o bloco de baixo
// (código de barras/R$/preço) reduzida pra no máximo 3mm — pedidos do
// usuário depois de ver os testes impressos.
export const HALF_LAYOUT: CellLayout = {
  nome:    { x: 3,    y: 2,    w: 46,  h: 2.7 },
  ref:     { x: 3,    y: 6.2,  w: 21,  h: 2   },
  barcode: { x: 3,    y: 11.2, w: 21,  h: 9.3 },
  rs:      { x: 24.7, y: 11.2, w: 3.5, h: 3   },
  preco:   { x: 28.5, y: 11.2, w: 21,  h: 10  },
};

// Respiro entre o nome e o REF logo abaixo dele.
const NOME_GAP_MM = 0.3;

const PREVIEW_PX_PER_MM = 4; // escala de referência da prévia (~420px pra 105mm)

// Etiqueta de Produto — adesiva 40x40mm (branca, sem pré-impressão), para
// produtos sem etiqueta / com etiqueta danificada ou código ilegível. Metade
// corta HORIZONTAL (duas de 40x20mm empilhadas) — diferente da Gôndola, que
// corta vertical.
export const PRODUTO_LABEL_SIZE = 40; // mm — lado da etiqueta Inteira / folha impressa da Metade
export const PRODUTO_HALF_H = PRODUTO_LABEL_SIZE / 2; // 20mm — altura de cada metade

export interface ProdutoLayout { descricao: ElPos; ref: ElPos; barcode: ElPos }
export interface ProdutoInfoLayout extends ProdutoLayout { infoBlockY: number; infoBlockBottom: number }

// Posições em mm extraídas por análise de pixel de 3 imagens de referência do
// usuário (retângulos coloridos — legenda: #cb6ce6 descrição, #ff751f
// REF/SKU, #004aad fabricante, #1800ad CNPJ, #c1ff72 composição, #ff5757
// validade, #ff3131 código de barras).
export const PRODUTO_FULL_MIN: ProdutoLayout = { // 40x40mm, sem informações adicionais
  descricao: { x: 2.2, y: 6.44, w: 35.6, h: 7.2 },
  ref:       { x: 2.2, y: 14.24, w: 35.6, h: 2.71 },
  barcode:   { x: 2.2, y: 18.98, w: 35.6, h: 14.92 },
};
export const PRODUTO_FULL_INFO: ProdutoInfoLayout = { // 40x40mm, com informações adicionais
  descricao: { x: 2.2, y: 2.71, w: 35.6, h: 3.98 },
  ref:       { x: 2.2, y: 7.71, w: 35.6, h: 2.63 },
  infoBlockY: 11.86, infoBlockBottom: 23.48, // dividido igualmente entre os N campos marcados
  barcode:   { x: 2.2, y: 25.0, w: 35.6, h: 12.54 },
};
export const PRODUTO_HALF: ProdutoLayout = { // 40x20mm, sempre mínima (sem espaço pra informações extras)
  descricao: { x: 1.95, y: 1.95, w: 36.1, h: 4.24 },
  ref:       { x: 1.95, y: 6.53, w: 36.1, h: 1.61 },
  barcode:   { x: 1.95, y: 9.32, w: 36.1, h: 8.73 },
};

// Etiqueta de Produto — Código de Barras: divide a folha 40x40mm em 3 faixas
// horizontais de ~13.3mm, cada uma dedicada só ao código de barras (sem
// descrição/REF) — pra quando o objetivo é só ter 3 códigos de barras
// avulsos pra colar, não uma etiqueta descritiva completa.
export interface ProdutoBarcodeLayout { barcode: ElPos }
export const PRODUTO_THIRD_H = PRODUTO_LABEL_SIZE / 3; // ~13.33mm — altura de cada faixa
const PRODUTO_THIRD_MARGIN_Y = 1.3;
// Altura do código reduzida pra 1/3 do que caberia na faixa inteira —
// centralizado verticalmente no espaço que sobra.
const PRODUTO_THIRD_BARCODE_H = (PRODUTO_THIRD_H - PRODUTO_THIRD_MARGIN_Y * 2) / 3;
export const PRODUTO_THIRD: ProdutoBarcodeLayout = {
  barcode: { x: 2.2, y: (PRODUTO_THIRD_H - PRODUTO_THIRD_BARCODE_H) / 2, w: 35.6, h: PRODUTO_THIRD_BARCODE_H },
};

const PX_TO_MM = 25.4 / 96;
// Informações adicionais usam a mesma fonte da REF, 2px menores.
const INFO_FONT_DELTA_MM = 2 * PX_TO_MM;

// Só o número, sem "R$" — o símbolo já tem sua própria caixa na etiqueta
// (formatPrice do labelPrintUtils inclui o símbolo, por isso não é usado aqui).
export function formatPriceValue(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// REF é um código curto de referência — nunca o EAN inteiro (13 dígitos não
// cabem na caixa e quebravam a linha, embolando com o código de barras).
export function productRef(product: any): string {
  if (product?.sku) return product.sku;
  if (product?.ean) return String(product.ean).slice(-4);
  return '0000';
}

// Mede o texto de verdade (canvas) e devolve o maior font-size (em "unidades
// da caixa", mm no print / px na prévia) que ainda cabe na largura disponível
// — sem isso, textos maiores que a caixa (ex: preço "123,45") saem cortados
// em vez de encolher, que foi o bug visto na impressão real.
let fitMeasureCanvas: HTMLCanvasElement | null = null;
// Margem de segurança: a fonte final fica ~6% mais estreita do que o cálculo
// exato indicaria, absorvendo pequenas diferenças de métrica entre a fonte
// medida aqui e a realmente usada pela impressora — sem isso um preço podia
// sair cortado/reticências na impressão real mesmo "cabendo" no cálculo.
const FIT_SAFETY = 0.94;
function fitFontSize(text: string, maxWidth: number, maxHeight: number, weight: number | string, family: string): number {
  if (typeof document === 'undefined' || !text) return maxHeight;
  if (!fitMeasureCanvas) fitMeasureCanvas = document.createElement('canvas');
  const ctx = fitMeasureCanvas.getContext('2d');
  if (!ctx) return maxHeight;
  const probe = 100;
  ctx.font = `${weight} ${probe}px ${family}`;
  const measured = ctx.measureText(text).width || probe;
  return Math.max(1, Math.min(maxWidth * FIT_SAFETY * (probe / measured), maxHeight));
}

// Largura real do texto num tamanho de fonte específico — usado pra decidir
// se o nome cabe numa linha só, em vez de deduzir isso indiretamente.
function measureTextWidth(text: string, fontSize: number, weight: number | string, family: string): number {
  if (typeof document === 'undefined' || !text) return 0;
  if (!fitMeasureCanvas) fitMeasureCanvas = document.createElement('canvas');
  const ctx = fitMeasureCanvas.getContext('2d');
  if (!ctx) return 0;
  ctx.font = `${weight} ${fontSize}px ${family}`;
  return ctx.measureText(text).width;
}

// Quanto o REF/código de barras/R$/preço podem descer sem passar do fim da
// etiqueta — usado pra saber o maior tamanho de fonte que o nome pode usar
// em 2 linhas empurrando esses elementos pra baixo (em vez de encolher).
const NOME_BOTTOM_SAFETY_MM = 0.5;
function maxTwoLineNomeSize(layout: CellLayout): number {
  const lowestBottom = Math.max(
    layout.ref.y + layout.ref.h,
    layout.barcode.y + layout.barcode.h,
    layout.rs.y + layout.rs.h,
    layout.preco.y + layout.preco.h,
  );
  const availableDown = Math.max(0, ELGIN_LABEL_H - NOME_BOTTOM_SAFETY_MM - lowestBottom);
  const maxBlockH = layout.nome.h + availableDown;
  return maxBlockH / (2 * 1.05);
}

// Desloca REF/código de barras/R$/preço pra baixo em `dy` mm — usado quando
// o nome precisa de 2 linhas, preservando a distância original entre o nome
// e o REF (que fica igual, só que mais embaixo).
function shiftLayoutDown(layout: CellLayout, dy: number): CellLayout {
  if (dy <= 0) return layout;
  return {
    nome: layout.nome,
    ref: { ...layout.ref, y: layout.ref.y + dy },
    barcode: { ...layout.barcode, y: layout.barcode.y + dy },
    rs: { ...layout.rs, y: layout.rs.y + dy },
    preco: { ...layout.preco, y: layout.preco.y + dy },
  };
}

// O nome sempre usa o mesmo tamanho de fonte (não encolhe conforme o texto
// fica mais comprido). Se ele não couber numa linha, quebra em 2 linhas. Se
// mesmo assim sobrarem mais de 2 linhas, o CSS de line-clamp corta o
// excedente com "…".
interface NomeFit { fontSizeMm: number; yMm: number; hMm: number; twoLines: boolean; extraH: number }
// Na Metade a fonte do nome no tamanho "padrão" (cheio da caixa) fica volumosa
// pro espaço pequeno da etiqueta — reduz um passo só nela, mantendo a caixa
// (e portanto a posição do REF/código de barras/preço abaixo) do mesmo
// tamanho, só o texto fica menor dentro dela. Na Metade, quando precisa de 2
// linhas, os elementos abaixo (REF/código de barras/R$/preço) descem pra
// abrir espaço.
const HALF_NOME_SCALE = 0.88;
// Na Inteira, quando precisa de 2 linhas, sobe o texto pra cima (até essa
// margem mínima do topo da etiqueta) em vez de empurrar REF/código de
// barras/preço pra baixo — mantém esses elementos exatamente onde estão.
const FULL_NOME_TOP_SAFETY_MM = 0.5;
function fitNomeLayout(text: string, layout: CellLayout, weight: number | string, family: string): NomeFit {
  const scale = layout === HALF_LAYOUT ? HALF_NOME_SCALE : 1;
  const w = layout.nome.w;
  const bottom = layout.ref.y - NOME_GAP_MM;
  const singleMaxH = Math.max(1, bottom - layout.nome.y);
  const fitsOneLine = measureTextWidth(text, singleMaxH, weight, family) <= w * FIT_SAFETY;
  if (fitsOneLine) {
    return { fontSizeMm: singleMaxH * scale, yMm: layout.nome.y, hMm: singleMaxH, twoLines: false, extraH: 0 };
  }

  if (layout === FULL_LAYOUT) {
    const maxAvailableH = Math.max(singleMaxH, bottom - FULL_NOME_TOP_SAFETY_MM);
    const standardSize = maxAvailableH / (2 * 1.05);
    const blockH = standardSize * 1.05 * 2;
    return { fontSizeMm: standardSize, yMm: bottom - blockH, hMm: blockH, twoLines: true, extraH: 0 };
  }

  const standardSize = maxTwoLineNomeSize(layout);
  const blockH = standardSize * 1.05 * 2;
  const extraH = Math.max(0, blockH - layout.nome.h);
  return { fontSizeMm: standardSize * scale, yMm: layout.nome.y, hMm: blockH, twoLines: true, extraH };
}

// Mesma lógica de fitNomeLayout, generalizada pra qualquer caixa (usada pela
// descrição da Etiqueta de Produto, que fica centralizada em vez de alinhada
// à esquerda).
const DESCRICAO_GAP_MM = 0.3;
const DESCRICAO_MIN_TOP_MM = 1.6;
const DESCRICAO_TWO_LINE_BIAS = 1.15;
interface DescricaoFit { fontSizeMm: number; yMm: number; hMm: number; twoLines: boolean }
function fitDescricaoLayout(text: string, box: ElPos, nextY: number, weight: number | string, family: string): DescricaoFit {
  const w = box.w;
  const y = box.y;
  const singleMaxH = Math.max(1, nextY - y - DESCRICAO_GAP_MM);
  const oneLineSize = fitFontSize(text, w, singleMaxH, weight, family);

  const bottom = nextY - DESCRICAO_GAP_MM;
  const maxAvailableH = Math.max(singleMaxH, bottom - DESCRICAO_MIN_TOP_MM);
  const twoLineEstimate = fitFontSize(text, w * 1.85, 9999, weight, family);
  const heightCap = maxAvailableH / (2 * 1.05);
  const twoLineSize = Math.max(1, Math.min(twoLineEstimate, heightCap));

  if (twoLineSize > oneLineSize * DESCRICAO_TWO_LINE_BIAS) {
    const blockH = twoLineSize * 1.05 * 2;
    const yMm = Math.max(DESCRICAO_MIN_TOP_MM, bottom - blockH);
    return { fontSizeMm: twoLineSize, yMm, hMm: blockH, twoLines: true };
  }
  return { fontSizeMm: oneLineSize, yMm: y, hMm: singleMaxH, twoLines: false };
}

export const SAMPLE_FULL = { name: 'COCA COLA ORIGINAL 350ML', sku: '0000', ean: '899197910205', price: 5 };
export const SAMPLE_HALF_A = { name: 'Refrigerante Guaraná Lata 350ml', sku: '0457', ean: '7891234500011', price: 3.49 };
export const SAMPLE_HALF_B = { name: 'Água Mineral s/Gás 500ml', sku: '0312', ean: '7891234512345', price: 2 };
export const SAMPLE_TRIPLE_C = { name: 'Suco de Uva Integral 1L', sku: '0891', ean: '7891234598765', price: 8.9 };

function LabelPreviewCell({ product, layout, offsetXMm }: { product: any; layout: CellLayout; offsetXMm: number }) {
  const box = (p: ElPos, extra?: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    left: `${((p.x + offsetXMm) / ELGIN_LABEL_W) * 100}%`,
    top: `${(p.y / ELGIN_LABEL_H) * 100}%`,
    width: `${(p.w / ELGIN_LABEL_W) * 100}%`,
    height: `${(p.h / ELGIN_LABEL_H) * 100}%`,
    ...extra,
  });
  const code = product.ean || product.sku || '';
  const nomeText = product.name || '—';
  const refText = `REF ${productRef(product)}`;
  const priceText = formatPriceValue(product.price ?? 0);

  const nomeFit = fitNomeLayout(nomeText, layout, 800, 'DM Sans, sans-serif');
  const nomeBox: ElPos = { x: layout.nome.x, y: nomeFit.yMm, w: layout.nome.w, h: nomeFit.hMm };
  const shifted = shiftLayoutDown(layout, nomeFit.extraH);
  const refSize = fitFontSize(refText, shifted.ref.w * PREVIEW_PX_PER_MM, shifted.ref.h * PREVIEW_PX_PER_MM, 900, "'DM Mono', monospace");
  const rsSize = fitFontSize('R$', shifted.rs.w * PREVIEW_PX_PER_MM, shifted.rs.h * PREVIEW_PX_PER_MM, 800, 'DM Sans, sans-serif');
  const precoSize = fitFontSize(priceText, shifted.preco.w * PREVIEW_PX_PER_MM, shifted.preco.h * PREVIEW_PX_PER_MM, 800, 'DM Sans, sans-serif');
  const bcNumSize = code ? fitFontSize(code, shifted.barcode.w * PREVIEW_PX_PER_MM, shifted.barcode.h * 0.3 * PREVIEW_PX_PER_MM, 700, "'DM Mono', monospace") : 0;

  return (
    <>
      <div style={box(nomeBox, {
        fontSize: nomeFit.fontSizeMm * PREVIEW_PX_PER_MM, fontWeight: 800, color: '#141400', lineHeight: 1.05, overflow: 'hidden',
        ...(nomeFit.twoLines
          ? { whiteSpace: 'normal', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties
          : { whiteSpace: 'nowrap', textOverflow: 'ellipsis' }),
      })}>
        {nomeText}
      </div>
      <div style={box(shifted.ref, { fontSize: refSize, fontFamily: "'DM Mono', monospace", fontWeight: 900, color: 'rgba(20,20,0,.6)', whiteSpace: 'nowrap', overflow: 'hidden' })}>
        {refText}
      </div>
      <div style={box(shifted.barcode, { display: 'flex', flexDirection: 'column', gap: 1 })}>
        <div style={{ flex: 1, minHeight: 0, background: 'repeating-linear-gradient(90deg,#141400 0 2px, transparent 2px 4.4px)' }} />
        {code && (
          <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: '#3c3c3c', textAlign: 'center', fontSize: bcNumSize, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {code}
          </div>
        )}
      </div>
      <div style={box(shifted.rs, { fontSize: rsSize, fontWeight: 800, color: '#141400', whiteSpace: 'nowrap', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' })}>R$</div>
      <div style={box(shifted.preco, { fontSize: precoSize, fontWeight: 800, color: '#141400', lineHeight: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' })}>
        {priceText}
      </div>
    </>
  );
}

export function LabelPreview({ variant, items }: { variant: 'full' | 'half'; items: any[] }) {
  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-[#FFE500] shadow-inner" style={{ aspectRatio: `${ELGIN_LABEL_W} / ${ELGIN_LABEL_H}` }}>
      {variant === 'full' ? (
        <LabelPreviewCell product={items[0]} layout={FULL_LAYOUT} offsetXMm={0} />
      ) : (
        <>
          <LabelPreviewCell product={items[0]} layout={HALF_LAYOUT} offsetXMm={0} />
          <LabelPreviewCell product={items[1]} layout={HALF_LAYOUT} offsetXMm={HALF_OFFSET_X} />
          <div className="absolute top-0 bottom-0 border-l border-dashed border-black/30 pointer-events-none" style={{ left: '50%' }} />
        </>
      )}
    </div>
  );
}

function ProdutoPreviewCell({ product, layout, offsetYMm }: { product: any; layout: ProdutoLayout; offsetYMm: number }) {
  const box = (p: ElPos, extra?: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    left: `${(p.x / PRODUTO_LABEL_SIZE) * 100}%`,
    top: `${((p.y + offsetYMm) / PRODUTO_LABEL_SIZE) * 100}%`,
    width: `${(p.w / PRODUTO_LABEL_SIZE) * 100}%`,
    height: `${(p.h / PRODUTO_LABEL_SIZE) * 100}%`,
    ...extra,
  });
  const code = product.ean || product.sku || '';
  const descText = product.name || '—';
  const refText = `REF ${productRef(product)}`;

  const descFit = fitDescricaoLayout(descText, layout.descricao, layout.ref.y, 800, 'DM Sans, sans-serif');
  const descBox: ElPos = { x: layout.descricao.x, y: descFit.yMm, w: layout.descricao.w, h: descFit.hMm };
  const refSize = fitFontSize(refText, layout.descricao.w * PREVIEW_PX_PER_MM, layout.ref.h * PREVIEW_PX_PER_MM, 900, "'DM Mono', monospace");
  const bcNumSize = code ? fitFontSize(code, layout.barcode.w * PREVIEW_PX_PER_MM, layout.barcode.h * 0.22 * PREVIEW_PX_PER_MM, 700, "'DM Mono', monospace") : 0;

  return (
    <>
      <div style={box(descBox, {
        fontSize: descFit.fontSizeMm * PREVIEW_PX_PER_MM, fontWeight: 800, color: '#141400', lineHeight: 1.05, overflow: 'hidden', textAlign: 'center',
        ...(descFit.twoLines
          ? { whiteSpace: 'normal', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties
          : { whiteSpace: 'nowrap', textOverflow: 'ellipsis' }),
      })}>
        {descText}
      </div>
      <div style={box({ x: layout.descricao.x, y: layout.ref.y, w: layout.descricao.w, h: layout.ref.h }, { fontSize: refSize, fontFamily: "'DM Mono', monospace", fontWeight: 900, color: 'rgba(20,20,0,.6)', whiteSpace: 'nowrap', overflow: 'hidden', textAlign: 'center' })}>
        {refText}
      </div>
      <div style={box(layout.barcode, { display: 'flex', flexDirection: 'column', gap: 1 })}>
        <div style={{ flex: 1, minHeight: 0, background: 'repeating-linear-gradient(90deg,#141400 0 2px, transparent 2px 4.4px)' }} />
        {code && (
          <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: '#3c3c3c', textAlign: 'center', fontSize: bcNumSize, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {code}
          </div>
        )}
      </div>
    </>
  );
}

function ProdutoInfoPreviewCell({ product, extraFields }: { product: any; extraFields: { label: string; value: string }[] }) {
  const layout = PRODUTO_FULL_INFO;
  const box = (p: ElPos, extra?: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    left: `${(p.x / PRODUTO_LABEL_SIZE) * 100}%`,
    top: `${(p.y / PRODUTO_LABEL_SIZE) * 100}%`,
    width: `${(p.w / PRODUTO_LABEL_SIZE) * 100}%`,
    height: `${(p.h / PRODUTO_LABEL_SIZE) * 100}%`,
    ...extra,
  });
  const code = product.ean || product.sku || '';
  const descText = product.name || '—';
  const refText = `REF ${productRef(product)}`;

  const descFit = fitDescricaoLayout(descText, layout.descricao, layout.ref.y, 800, 'DM Sans, sans-serif');
  const descBox: ElPos = { x: layout.descricao.x, y: descFit.yMm, w: layout.descricao.w, h: descFit.hMm };
  const refSize = fitFontSize(refText, layout.descricao.w * PREVIEW_PX_PER_MM, layout.ref.h * PREVIEW_PX_PER_MM, 900, "'DM Mono', monospace");
  const bcNumSize = code ? fitFontSize(code, layout.barcode.w * PREVIEW_PX_PER_MM, layout.barcode.h * 0.22 * PREVIEW_PX_PER_MM, 700, "'DM Mono', monospace") : 0;

  // Bloco de informações extras: altura fixa dividida entre os campos
  // marcados, todos com a mesma fonte (a menor necessária pra linha mais
  // longa caber), centralizados na largura da etiqueta.
  const n = extraFields.length;
  const totalH = layout.infoBlockBottom - layout.infoBlockY;
  const rowGap = 0.35;
  const rowH = n > 0 ? (totalH - rowGap * (n - 1)) / n : 0;
  let infoSize = Math.max(1, refSize - 2);
  extraFields.forEach(field => {
    const text = `${field.label}: ${field.value}`;
    const maxSize = fitFontSize(text, layout.descricao.w * PREVIEW_PX_PER_MM, rowH * PREVIEW_PX_PER_MM, 900, "'DM Mono', monospace");
    infoSize = Math.min(infoSize, maxSize);
  });

  return (
    <>
      <div style={box(descBox, {
        fontSize: descFit.fontSizeMm * PREVIEW_PX_PER_MM, fontWeight: 800, color: '#141400', lineHeight: 1.05, overflow: 'hidden', textAlign: 'center',
        ...(descFit.twoLines
          ? { whiteSpace: 'normal', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties
          : { whiteSpace: 'nowrap', textOverflow: 'ellipsis' }),
      })}>
        {descText}
      </div>
      <div style={box({ x: layout.descricao.x, y: layout.ref.y, w: layout.descricao.w, h: layout.ref.h }, { fontSize: refSize, fontFamily: "'DM Mono', monospace", fontWeight: 900, color: 'rgba(20,20,0,.6)', whiteSpace: 'nowrap', overflow: 'hidden', textAlign: 'center' })}>
        {refText}
      </div>
      {extraFields.map((field, i) => {
        const rowY = layout.infoBlockY + i * (rowH + rowGap);
        return (
          <div key={field.label} style={box({ x: layout.descricao.x, y: rowY, w: layout.descricao.w, h: rowH }, { fontSize: infoSize, fontFamily: "'DM Mono', monospace", fontWeight: 900, color: '#3c3c3c', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', overflow: 'hidden' })}>
            <b>{field.label}:</b>&nbsp;{field.value}
          </div>
        );
      })}
      <div style={box(layout.barcode, { display: 'flex', flexDirection: 'column', gap: 1 })}>
        <div style={{ flex: 1, minHeight: 0, background: 'repeating-linear-gradient(90deg,#141400 0 2px, transparent 2px 4.4px)' }} />
        {code && (
          <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: '#3c3c3c', textAlign: 'center', fontSize: bcNumSize, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {code}
          </div>
        )}
      </div>
    </>
  );
}

export function ProdutoPreviewFull({ product, extraFields }: { product: any; extraFields: { label: string; value: string }[] }) {
  return (
    <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-white shadow-inner border border-black/10">
      {extraFields.length > 0
        ? <ProdutoInfoPreviewCell product={product} extraFields={extraFields} />
        : <ProdutoPreviewCell product={product} layout={PRODUTO_FULL_MIN} offsetYMm={0} />}
    </div>
  );
}

export function ProdutoPreviewHalf({ items }: { items: any[] }) {
  return (
    <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-white shadow-inner border border-black/10">
      <ProdutoPreviewCell product={items[0]} layout={PRODUTO_HALF} offsetYMm={0} />
      <ProdutoPreviewCell product={items[1]} layout={PRODUTO_HALF} offsetYMm={PRODUTO_HALF_H} />
      <div className="absolute left-0 right-0 border-t border-dashed border-black/30 pointer-events-none" style={{ top: '50%' }} />
    </div>
  );
}

function ProdutoBarcodePreviewCell({ product, offsetYMm }: { product: any; offsetYMm: number }) {
  const box = (p: ElPos, extra?: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    left: `${(p.x / PRODUTO_LABEL_SIZE) * 100}%`,
    top: `${((p.y + offsetYMm) / PRODUTO_LABEL_SIZE) * 100}%`,
    width: `${(p.w / PRODUTO_LABEL_SIZE) * 100}%`,
    height: `${(p.h / PRODUTO_LABEL_SIZE) * 100}%`,
    ...extra,
  });
  const code = product.ean || product.sku || '';
  const bcNumSize = code ? fitFontSize(code, PRODUTO_THIRD.barcode.w * PREVIEW_PX_PER_MM, PRODUTO_THIRD.barcode.h * 0.22 * PREVIEW_PX_PER_MM, 700, "'DM Mono', monospace") : 0;

  return (
    <div style={box(PRODUTO_THIRD.barcode, { display: 'flex', flexDirection: 'column', gap: 1 })}>
      <div style={{ flex: 1, minHeight: 0, background: 'repeating-linear-gradient(90deg,#141400 0 2px, transparent 2px 4.4px)' }} />
      {code && (
        <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: '#3c3c3c', textAlign: 'center', fontSize: bcNumSize, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {code}
        </div>
      )}
    </div>
  );
}

export function ProdutoPreviewTriple({ items }: { items: any[] }) {
  return (
    <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-white shadow-inner border border-black/10">
      <ProdutoBarcodePreviewCell product={items[0]} offsetYMm={0} />
      <ProdutoBarcodePreviewCell product={items[1]} offsetYMm={PRODUTO_THIRD_H} />
      <ProdutoBarcodePreviewCell product={items[2]} offsetYMm={PRODUTO_THIRD_H * 2} />
      <div className="absolute left-0 right-0 border-t border-dashed border-black/30 pointer-events-none" style={{ top: `${(100 / 3).toFixed(4)}%` }} />
      <div className="absolute left-0 right-0 border-t border-dashed border-black/30 pointer-events-none" style={{ top: `${(200 / 3).toFixed(4)}%` }} />
    </div>
  );
}

// Ícones do toggle Inteira/Metade da Etiqueta de Produto — deixam claro que
// aqui o corte é horizontal (a Gôndola corta vertical e não usa ícone).
export function IconWholeSquare({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="2" width="12" height="12" rx="2" />
    </svg>
  );
}
export function IconHalfHorizontal({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <line x1="2" y1="8" x2="14" y2="8" />
    </svg>
  );
}
export function IconTriple({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="2" width="12" height="12" rx="2" />
      <line x1="2" y1="6" x2="14" y2="6" />
      <line x1="2" y1="10" x2="14" y2="10" />
    </svg>
  );
}

// Campos digitados na hora da impressão (valem pra todas as etiquetas do
// lote) — exclusivos da Etiqueta de Produto.
const EXTRA_INFO_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: 'marca', label: 'Marca', placeholder: 'ex: Nitron' },
  { key: 'fabricante', label: 'Fabricante', placeholder: 'ex: Nitron Ind. LTDA' },
  { key: 'cnpj', label: 'CNPJ', placeholder: 'ex: 12.345.678/0001-90' },
  { key: 'composicao', label: 'Composição', placeholder: 'ex: Plástico ABS' },
  { key: 'validade', label: 'Validade', placeholder: 'ex: 12/2026' },
];

export type LabelTemplate = 'gondola' | 'produto';
// 'triple' é exclusivo da Etiqueta de Produto — divide a folha 40x40mm em 3
// faixas dedicadas só a código de barras (sem descrição/REF).
export type LabelSize = 'full' | 'half' | 'triple';
type Tab = 'selecao' | 'visualizacao';

// Sobrescreve, só pra etiqueta impressa (nunca o produto cadastrado), a
// descrição/REF/EAN/preço de um item da fila — editado pelo botão de lápis
// na Visualização. Chave ausente = usa o valor do produto normalmente.
export interface LabelOverrides {
  name?: string;
  sku?: string;
  ean?: string;
  price?: number;
}

export interface QueueEntry {
  product: any;
  qty: number;
  size: LabelSize;
  overrides?: LabelOverrides;
}

// Produto "efetivo" pra renderizar/imprimir — aplica as sobrescritas por
// cima dos dados reais do produto, sem tocar no objeto original.
export function effectiveLabelProduct(entry: QueueEntry): any {
  return entry.overrides ? { ...entry.product, ...entry.overrides } : entry.product;
}

interface Draft {
  qty: number;
  size: LabelSize;
}

interface LabelPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: any[];
  // Preenche a fila já pronta ao abrir — usado quando o modal é aberto a
  // partir de um pedido pendente na Central de Requisições (Fila de
  // Impressão enviada remotamente), pulando direto pra Visualização.
  initialQueue?: QueueEntry[];
  initialTemplate?: LabelTemplate;
  // Chamado assim que o usuário dispara a impressão de verdade (antes do
  // diálogo de impressão do navegador) — usado pra marcar o pedido de
  // origem como concluído.
  onPrinted?: () => void;
  // Id do pedido pendente que preencheu a fila (veio da Central de
  // Requisições) — presente só quando o modal foi aberto a partir de um
  // pedido existente. Habilita o botão "Salvar", que grava a fila atualizada
  // de volta nesse mesmo pedido (sem imprimir), pra quem criou ou outra
  // pessoa poder voltar depois e completar/ajustar os itens.
  requestId?: string;
  onSaveQueue?: (requestId: string, payload: PrintQueueSubmission) => Promise<void> | void;
  // Manda a fila atual como um novo pedido pendente de impressão, sem
  // imprimir na hora — mesmo destino da Fila de Impressão, só que disparado
  // direto deste módulo padrão. Só faz sentido pra uma fila nova (sem
  // requestId), então some quando o modal já foi aberto a partir de um pedido.
  onSendQueue?: (payload: PrintQueueSubmission) => Promise<void> | void;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const TEMPLATE_LABELS: Record<LabelTemplate, string> = {
  gondola: 'Etiqueta de Gôndola',
  produto: 'Etiqueta de Produto',
};

// Payload de um pedido remoto de impressão (Fila de Impressão / botão
// "Enviar" deste módulo) — mandado como requisição pendente, sem imprimir na
// hora. Compartilhado entre este módulo e a Fila de Impressão.
export interface PrintQueueItem {
  product_id: string;
  name: string;
  sku: string | null;
  ean: string | null;
  price: number | null;
  qty: number;
  size: LabelSize;
}

export interface PrintQueueSubmission {
  template: LabelTemplate;
  items: PrintQueueItem[];
}

const emptyDraft = (): Draft => ({ qty: 1, size: 'full' });

export function LabelPrintModal({ isOpen, onClose, products, initialQueue, initialTemplate, onPrinted, requestId, onSaveQueue, onSendQueue }: LabelPrintModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('selecao');
  const [template, setTemplate] = useState<LabelTemplate>('gondola');
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [queue, setQueue] = useState<Record<string, QueueEntry>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  // Ao abrir já com uma fila pronta (pedido vindo da Central de Requisições),
  // carrega ela e pula direto pra Visualização em vez da Seleção vazia.
  useEffect(() => {
    if (isOpen && initialQueue && initialQueue.length > 0) {
      const seeded: Record<string, QueueEntry> = {};
      initialQueue.forEach(entry => { seeded[entry.product.id] = entry; });
      setQueue(seeded);
      if (initialTemplate) setTemplate(initialTemplate);
      setActiveTab('visualizacao');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Informações adicionais — exclusivas da Etiqueta de Produto. Os valores são
  // digitados na hora da impressão e valem pra todas as etiquetas do lote.
  const [extraInfoOn, setExtraInfoOn] = useState(false);
  const [extraChecked, setExtraChecked] = useState<Record<string, boolean>>({});
  const [extraValues, setExtraValues] = useState<Record<string, string>>({});

  const toggleExtraField = useCallback((key: string) => {
    setExtraChecked(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const setExtraValue = useCallback((key: string, value: string) => {
    setExtraValues(prev => ({ ...prev, [key]: key === 'cnpj' ? formatCNPJ(value) : value }));
  }, []);

  // Campos de "Informações adicionais" marcados e preenchidos — só entram na
  // etiqueta Inteira; se nenhum estiver marcado/preenchido, cai no layout
  // mínimo mesmo com o toggle ligado.
  const extraFieldsFilled = useMemo(() => (
    extraInfoOn
      ? EXTRA_INFO_FIELDS.filter(f => extraChecked[f.key] && (extraValues[f.key] ?? '').trim() !== '')
          .map(f => ({ label: f.label, value: (extraValues[f.key] ?? '').trim() }))
      : []
  ), [extraInfoOn, extraChecked, extraValues]);

  const queueList = useMemo(() => Object.entries(queue), [queue]);
  const totalLabels = useMemo(() => queueList.reduce((acc, [, e]) => acc + e.qty, 0), [queueList]);

  // Amostras pra prévia — usa o primeiro produto real de cada tamanho na fila,
  // caindo pra um exemplo genérico quando ainda não tem nada adicionado.
  const previewFull = useMemo(() => {
    const entry = queueList.find(([, e]) => e.size === 'full')?.[1];
    return entry ? effectiveLabelProduct(entry) : SAMPLE_FULL;
  }, [queueList]);
  const previewHalfItems = useMemo(() => queueList.filter(([, e]) => e.size === 'half').map(([, e]) => effectiveLabelProduct(e)), [queueList]);
  const previewHalfA = previewHalfItems[0] ?? SAMPLE_HALF_A;
  const previewHalfB = previewHalfItems[1] ?? SAMPLE_HALF_B;
  const previewTripleItems = useMemo(() => queueList.filter(([, e]) => e.size === 'triple').map(([, e]) => effectiveLabelProduct(e)), [queueList]);
  const previewTripleA = previewTripleItems[0] ?? SAMPLE_HALF_A;
  const previewTripleB = previewTripleItems[1] ?? SAMPLE_HALF_B;
  const previewTripleC = previewTripleItems[2] ?? SAMPLE_TRIPLE_C;

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products.filter(p =>
      !queue[p.id] &&
      (p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.ean?.toLowerCase().includes(q))
    );
  }, [products, search, queue]);

  const getDraft = useCallback((id: string) => drafts[id] ?? emptyDraft(), [drafts]);

  // Sem clamp automático aqui — o campo precisa poder ficar vazio (qty 0,
  // tratado como "vazio" na exibição) enquanto o usuário digita um número
  // novo, senão nunca dá pra apagar o "1" sem antes digitar o dígito na
  // frente dele. O mínimo de 1 é garantido no blur e ao confirmar o item.
  const setDraftQty = useCallback((id: string, qty: number) => {
    setDrafts(prev => ({ ...prev, [id]: { ...getDraft(id), qty } }));
  }, [getDraft]);

  const setDraftSize = useCallback((id: string, size: LabelSize) => {
    setDrafts(prev => ({ ...prev, [id]: { ...getDraft(id), size } }));
  }, [getDraft]);

  const confirmAdd = useCallback((product: any) => {
    const draft = getDraft(product.id);
    setQueue(prev => ({ ...prev, [product.id]: { product, qty: Math.max(1, draft.qty), size: draft.size } }));
    setDrafts(prev => {
      const next = { ...prev };
      delete next[product.id];
      return next;
    });
  }, [getDraft]);

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // Edição inline na Visualização — quantidade e modelo de cada item já
  // adicionado à fila, sem precisar voltar pra Seleção. Mesmo raciocínio do
  // setDraftQty: sem clamp automático pra não travar o campo ao apagar.
  const updateQueueQty = useCallback((id: string, qty: number) => {
    setQueue(prev => (prev[id] ? { ...prev, [id]: { ...prev[id], qty } } : prev));
  }, []);

  const updateQueueSize = useCallback((id: string, size: LabelSize) => {
    setQueue(prev => (prev[id] ? { ...prev, [id]: { ...prev[id], size } } : prev));
  }, []);

  // Item com o "Editar etiqueta" (lápis) aberto — sobrescreve descrição/REF/
  // EAN/preço só pra impressão, sem tocar no produto cadastrado.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingEntry = editingId ? queue[editingId] : null;

  const setEntryOverrides = useCallback((id: string, overrides: LabelOverrides) => {
    setQueue(prev => (prev[id] ? { ...prev, [id]: { ...prev[id], overrides: Object.keys(overrides).length > 0 ? overrides : undefined } } : prev));
  }, []);

  const handleClose = () => {
    setActiveTab('selecao');
    setTemplate('gondola');
    setTemplateMenuOpen(false);
    setSearch('');
    setQueue({});
    setDrafts({});
    setExtraInfoOn(false);
    setExtraChecked({});
    setExtraValues({});
    setEditingId(null);
    onClose();
  };

  const buildQueueSubmission = (): PrintQueueSubmission => ({
    template,
    items: queueList.map(([, entry]) => {
      const effective = effectiveLabelProduct(entry);
      return {
        product_id: entry.product.id,
        name: effective.name || '—',
        sku: effective.sku || null,
        ean: effective.ean || null,
        price: effective.price ?? null,
        qty: entry.qty,
        size: entry.size,
      };
    }),
  });

  const [savingQueue, setSavingQueue] = useState(false);
  const [sendingQueue, setSendingQueue] = useState(false);

  // Grava a fila atual de volta no pedido pendente de origem, sem imprimir —
  // pra quem criou (ou outra pessoa) poder voltar depois e completar os itens.
  const handleSaveQueue = async () => {
    if (!requestId || !onSaveQueue || totalLabels === 0 || savingQueue) return;
    setSavingQueue(true);
    try {
      await onSaveQueue(requestId, buildQueueSubmission());
    } finally {
      setSavingQueue(false);
    }
  };

  // Manda a fila atual como um novo pedido pendente (mesmo destino da Fila
  // de Impressão), sem imprimir na hora.
  const handleSendQueue = async () => {
    if (!onSendQueue || totalLabels === 0 || sendingQueue) return;
    setSendingQueue(true);
    try {
      await onSendQueue(buildQueueSubmission());
      handleClose();
    } finally {
      setSendingQueue(false);
    }
  };

  // Uma etiqueta "Inteira" = 1 produto ocupando os 105mm. Uma etiqueta "Metade"
  // ocupa só a esquerda (0–52,5mm) ou a direita (52,5–105mm) de um disparo de
  // 105mm — duas etiquetas Metade sempre são pareadas num mesmo disparo físico
  // (se sobrar uma sozinha, ela sai com a metade direita em branco).
  const buildCellHtml = (product: any, layout: CellLayout, offsetX: number): string => {
    const code = product.ean || product.sku || '';
    let bcDataUrl = '';
    if (code) {
      try { bcDataUrl = generateBarcodeDataUrl(code); } catch { /* skip barcode on error */ }
    }
    const boxStyle = (p: ElPos) => `left:${(p.x + offsetX).toFixed(2)}mm; top:${p.y.toFixed(2)}mm; width:${p.w.toFixed(2)}mm; height:${p.h.toFixed(2)}mm;`;

    const nomeText = product.name || '—';
    const refText = `REF ${productRef(product)}`;
    const priceText = formatPriceValue(product.price ?? 0);

    // Nome cabe numa linha se der; senão quebra em 2 linhas — na Inteira sobe
    // pra cima, na Metade empurra REF/código de barras/R$/preço pra baixo.
    const nomeFit = fitNomeLayout(nomeText, layout, 800, 'Arial, Helvetica, sans-serif');
    const shifted = shiftLayoutDown(layout, nomeFit.extraH);
    const nomeBoxStyle = `left:${(layout.nome.x + offsetX).toFixed(2)}mm; top:${nomeFit.yMm.toFixed(2)}mm; width:${layout.nome.w.toFixed(2)}mm; height:${nomeFit.hMm.toFixed(2)}mm;`;
    const nomeWrapStyle = nomeFit.twoLines
      ? 'white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;'
      : '';
    const refSize = fitFontSize(refText, shifted.ref.w, shifted.ref.h, 900, "'Courier New', monospace");
    const rsSize = fitFontSize('R$', shifted.rs.w, shifted.rs.h, 800, 'Arial, Helvetica, sans-serif');
    const precoSize = fitFontSize(priceText, shifted.preco.w, shifted.preco.h, 800, 'Arial, Helvetica, sans-serif');
    const bcNumSize = code ? fitFontSize(code, shifted.barcode.w, shifted.barcode.h * 0.3, 700, "'Courier New', monospace") : 0;

    return `
      <div class="cell-el nome" style="${nomeBoxStyle} font-size:${nomeFit.fontSizeMm.toFixed(2)}mm; ${nomeWrapStyle}">${escapeHtml(nomeText)}</div>
      <div class="cell-el ref" style="${boxStyle(shifted.ref)} font-size:${refSize.toFixed(2)}mm;">${escapeHtml(refText)}</div>
      <div class="cell-el barcode" style="${boxStyle(shifted.barcode)}">
        ${bcDataUrl ? `<img class="bc-img" src="${bcDataUrl}" />` : ''}
        ${code ? `<div class="bc-num" style="font-size:${bcNumSize.toFixed(2)}mm;">${escapeHtml(code)}</div>` : ''}
      </div>
      <div class="cell-el rs" style="${boxStyle(shifted.rs)} font-size:${rsSize.toFixed(2)}mm;">R$</div>
      <div class="cell-el preco" style="${boxStyle(shifted.preco)} font-size:${precoSize.toFixed(2)}mm;">${escapeHtml(priceText)}</div>
    `;
  };

  const printElgin = () => {
    if (template !== 'gondola' || totalLabels === 0) return;
    onPrinted?.();

    const fullUnits: any[] = [];
    const halfUnits: any[] = [];
    queueList.forEach(([, entry]) => {
      const product = effectiveLabelProduct(entry);
      for (let i = 0; i < entry.qty; i++) (entry.size === 'half' ? halfUnits : fullUnits).push(product);
    });

    const pages: string[] = fullUnits.map(product =>
      `<div class="elgin-label">${buildCellHtml(product, FULL_LAYOUT, 0)}</div>`
    );
    for (let i = 0; i < halfUnits.length; i += 2) {
      const left = halfUnits[i];
      const right = halfUnits[i + 1];
      pages.push(
        `<div class="elgin-label">${buildCellHtml(left, HALF_LAYOUT, 0)}${right ? buildCellHtml(right, HALF_LAYOUT, HALF_OFFSET_X) : ''}</div>`
      );
    }

    const labelsHtml = pages.join('');
    const win = window.open('', '_blank', 'width=500,height=400');
    if (!win) return;
    win.document.write(`
      <html><head><title>Etiquetas Elgin L42 Pro</title>
      <style>
        @page { size: ${ELGIN_LABEL_W}mm ${ELGIN_LABEL_H}mm; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; }
        .elgin-label {
          position: relative; width: ${ELGIN_LABEL_W}mm; height: ${ELGIN_LABEL_H}mm;
          page-break-after: always; overflow: hidden;
        }
        .elgin-label:last-child { page-break-after: auto; }
        .cell-el { position: absolute; color: #141400; font-weight: 700; line-height: 1.05; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .cell-el.nome { font-weight: 800; }
        .cell-el.ref { font-family: 'Courier New', monospace; font-weight: 900; color: #3c3c3c; }
        .cell-el.rs { display: flex; align-items: flex-start; justify-content: flex-end; }
        .cell-el.preco { font-weight: 800; line-height: 0.85; display: flex; align-items: center; justify-content: flex-end; }
        .cell-el.barcode { display: flex; flex-direction: column; white-space: normal; }
        .bc-img { flex: 1 1 auto; width: 100%; min-height: 0; object-fit: fill; }
        .bc-num { font-family: 'Courier New', monospace; font-weight: 700; color: #3c3c3c; text-align: center; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      </style></head>
      <body>${labelsHtml}</body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  };

  // Etiqueta de Produto — mínima (Inteira sem informações adicionais, ou
  // qualquer uma das duas metades empilhadas). offsetY desloca a 2ª metade
  // 20mm pra baixo dentro da folha 40x40 impressa.
  const buildProdutoCellHtml = (product: any, layout: ProdutoLayout, offsetY: number): string => {
    const code = product.ean || product.sku || '';
    let bcDataUrl = '';
    if (code) {
      try { bcDataUrl = generateBarcodeDataUrl(code); } catch { /* skip barcode on error */ }
    }
    const boxStyle = (p: ElPos) => `left:${p.x.toFixed(2)}mm; top:${(p.y + offsetY).toFixed(2)}mm; width:${p.w.toFixed(2)}mm; height:${p.h.toFixed(2)}mm;`;

    const descText = product.name || '—';
    const refText = `REF ${productRef(product)}`;

    const descFit = fitDescricaoLayout(descText, layout.descricao, layout.ref.y, 800, 'Arial, Helvetica, sans-serif');
    const descBoxStyle = `left:${layout.descricao.x.toFixed(2)}mm; top:${(descFit.yMm + offsetY).toFixed(2)}mm; width:${layout.descricao.w.toFixed(2)}mm; height:${descFit.hMm.toFixed(2)}mm;`;
    const descWrapStyle = descFit.twoLines
      ? 'white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;'
      : '';
    const refSize = fitFontSize(refText, layout.descricao.w, layout.ref.h, 900, "'Courier New', monospace");
    const bcNumSize = code ? fitFontSize(code, layout.barcode.w, layout.barcode.h * 0.22, 700, "'Courier New', monospace") : 0;

    return `
      <div class="cell-el descricao" style="${descBoxStyle} font-size:${descFit.fontSizeMm.toFixed(2)}mm; ${descWrapStyle}">${escapeHtml(descText)}</div>
      <div class="cell-el ref" style="left:${layout.descricao.x.toFixed(2)}mm; top:${(layout.ref.y + offsetY).toFixed(2)}mm; width:${layout.descricao.w.toFixed(2)}mm; height:${layout.ref.h.toFixed(2)}mm; font-size:${refSize.toFixed(2)}mm;">${escapeHtml(refText)}</div>
      <div class="cell-el barcode" style="${boxStyle(layout.barcode)}">
        ${bcDataUrl ? `<img class="bc-img" src="${bcDataUrl}" />` : ''}
        ${code ? `<div class="bc-num" style="font-size:${bcNumSize.toFixed(2)}mm;">${escapeHtml(code)}</div>` : ''}
      </div>
    `;
  };

  // Etiqueta de Produto — Inteira com informações adicionais. O bloco de
  // campos extras ocupa uma faixa fixa dividida igualmente entre os N campos
  // marcados, todos com a mesma fonte da REF (2px menor) e centralizados.
  const buildProdutoInfoCellHtml = (product: any, extraFields: { label: string; value: string }[]): string => {
    const layout = PRODUTO_FULL_INFO;
    const code = product.ean || product.sku || '';
    let bcDataUrl = '';
    if (code) {
      try { bcDataUrl = generateBarcodeDataUrl(code); } catch { /* skip barcode on error */ }
    }
    const descText = product.name || '—';
    const refText = `REF ${productRef(product)}`;

    const descFit = fitDescricaoLayout(descText, layout.descricao, layout.ref.y, 800, 'Arial, Helvetica, sans-serif');
    const descBoxStyle = `left:${layout.descricao.x.toFixed(2)}mm; top:${descFit.yMm.toFixed(2)}mm; width:${layout.descricao.w.toFixed(2)}mm; height:${descFit.hMm.toFixed(2)}mm;`;
    const descWrapStyle = descFit.twoLines
      ? 'white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;'
      : '';
    const refSize = fitFontSize(refText, layout.descricao.w, layout.ref.h, 900, "'Courier New', monospace");
    const bcNumSize = code ? fitFontSize(code, layout.barcode.w, layout.barcode.h * 0.22, 700, "'Courier New', monospace") : 0;

    const n = extraFields.length;
    const totalH = layout.infoBlockBottom - layout.infoBlockY;
    const rowGap = 0.35;
    const rowH = (totalH - rowGap * (n - 1)) / n;
    let infoSize = Math.max(1, refSize - INFO_FONT_DELTA_MM);
    extraFields.forEach(field => {
      const text = `${field.label}: ${field.value}`;
      const maxSize = fitFontSize(text, layout.descricao.w, rowH, 900, "'Courier New', monospace");
      infoSize = Math.min(infoSize, maxSize);
    });

    const infoRows = extraFields.map((field, i) => {
      const rowY = layout.infoBlockY + i * (rowH + rowGap);
      return `<div class="cell-el info" style="left:${layout.descricao.x.toFixed(2)}mm; top:${rowY.toFixed(2)}mm; width:${layout.descricao.w.toFixed(2)}mm; height:${rowH.toFixed(2)}mm; font-size:${infoSize.toFixed(2)}mm;"><b>${escapeHtml(field.label)}:</b>&nbsp;${escapeHtml(field.value)}</div>`;
    }).join('');

    return `
      <div class="cell-el descricao" style="${descBoxStyle} font-size:${descFit.fontSizeMm.toFixed(2)}mm; ${descWrapStyle}">${escapeHtml(descText)}</div>
      <div class="cell-el ref" style="left:${layout.descricao.x.toFixed(2)}mm; top:${layout.ref.y.toFixed(2)}mm; width:${layout.descricao.w.toFixed(2)}mm; height:${layout.ref.h.toFixed(2)}mm; font-size:${refSize.toFixed(2)}mm;">${escapeHtml(refText)}</div>
      ${infoRows}
      <div class="cell-el barcode" style="${`left:${layout.barcode.x.toFixed(2)}mm; top:${layout.barcode.y.toFixed(2)}mm; width:${layout.barcode.w.toFixed(2)}mm; height:${layout.barcode.h.toFixed(2)}mm;`}">
        ${bcDataUrl ? `<img class="bc-img" src="${bcDataUrl}" />` : ''}
        ${code ? `<div class="bc-num" style="font-size:${bcNumSize.toFixed(2)}mm;">${escapeHtml(code)}</div>` : ''}
      </div>
    `;
  };

  // Etiqueta de Produto — Código de Barras: faixa dedicada só ao código de
  // barras, sem descrição/REF (offset desloca a 2ª/3ª faixa pra baixo dentro
  // da folha 40x40 impressa).
  const buildProdutoBarcodeCellHtml = (product: any, offsetY: number): string => {
    const code = product.ean || product.sku || '';
    let bcDataUrl = '';
    if (code) {
      try { bcDataUrl = generateBarcodeDataUrl(code); } catch { /* skip barcode on error */ }
    }
    const layout = PRODUTO_THIRD;
    const boxStyle = `left:${layout.barcode.x.toFixed(2)}mm; top:${(layout.barcode.y + offsetY).toFixed(2)}mm; width:${layout.barcode.w.toFixed(2)}mm; height:${layout.barcode.h.toFixed(2)}mm;`;
    const bcNumSize = code ? fitFontSize(code, layout.barcode.w, layout.barcode.h * 0.22, 700, "'Courier New', monospace") : 0;

    return `
      <div class="cell-el barcode" style="${boxStyle}">
        ${bcDataUrl ? `<img class="bc-img" src="${bcDataUrl}" />` : ''}
        ${code ? `<div class="bc-num" style="font-size:${bcNumSize.toFixed(2)}mm;">${escapeHtml(code)}</div>` : ''}
      </div>
    `;
  };

  const printProduto = () => {
    if (template !== 'produto' || totalLabels === 0) return;
    onPrinted?.();

    const fullUnits: any[] = [];
    const halfUnits: any[] = [];
    const tripleUnits: any[] = [];
    queueList.forEach(([, entry]) => {
      const product = effectiveLabelProduct(entry);
      const target = entry.size === 'half' ? halfUnits : entry.size === 'triple' ? tripleUnits : fullUnits;
      for (let i = 0; i < entry.qty; i++) target.push(product);
    });

    const pages: string[] = fullUnits.map(product =>
      `<div class="produto-label">${
        extraFieldsFilled.length > 0
          ? buildProdutoInfoCellHtml(product, extraFieldsFilled)
          : buildProdutoCellHtml(product, PRODUTO_FULL_MIN, 0)
      }</div>`
    );
    for (let i = 0; i < halfUnits.length; i += 2) {
      const top = halfUnits[i];
      const bottom = halfUnits[i + 1];
      pages.push(
        `<div class="produto-label">${buildProdutoCellHtml(top, PRODUTO_HALF, 0)}${bottom ? buildProdutoCellHtml(bottom, PRODUTO_HALF, PRODUTO_HALF_H) : ''}</div>`
      );
    }
    for (let i = 0; i < tripleUnits.length; i += 3) {
      const a = tripleUnits[i];
      const b = tripleUnits[i + 1];
      const c = tripleUnits[i + 2];
      pages.push(
        `<div class="produto-label">${buildProdutoBarcodeCellHtml(a, 0)}${b ? buildProdutoBarcodeCellHtml(b, PRODUTO_THIRD_H) : ''}${c ? buildProdutoBarcodeCellHtml(c, PRODUTO_THIRD_H * 2) : ''}</div>`
      );
    }

    const labelsHtml = pages.join('');
    const win = window.open('', '_blank', 'width=400,height=400');
    if (!win) return;
    win.document.write(`
      <html><head><title>Etiquetas de Produto</title>
      <style>
        @page { size: ${PRODUTO_LABEL_SIZE}mm ${PRODUTO_LABEL_SIZE}mm; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; }
        .produto-label {
          position: relative; width: ${PRODUTO_LABEL_SIZE}mm; height: ${PRODUTO_LABEL_SIZE}mm;
          page-break-after: always; overflow: hidden; background: #fff;
        }
        .produto-label:last-child { page-break-after: auto; }
        .cell-el { position: absolute; color: #141400; font-weight: 700; line-height: 1.05; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .cell-el.descricao { font-weight: 800; text-align: center; }
        .cell-el.ref { font-family: 'Courier New', monospace; font-weight: 900; color: #3c3c3c; text-align: center; }
        .cell-el.info { font-family: 'Courier New', monospace; font-weight: 900; color: #3c3c3c; display: flex; align-items: center; justify-content: center; }
        .cell-el.barcode { display: flex; flex-direction: column; white-space: normal; }
        .bc-img { flex: 1 1 auto; width: 100%; min-height: 0; object-fit: fill; }
        .bc-num { font-family: 'Courier New', monospace; font-weight: 700; color: #3c3c3c; text-align: center; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      </style></head>
      <body>${labelsHtml}</body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="relative bg-[#F0E7CC] dark:bg-[#1E1E18] rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-black/10 dark:border-white/[0.08] flex flex-col"
          >
            {/* Header — mesmo padrão do modal "Editar Produto" */}
            <div className="px-6 py-5 flex items-center gap-3.5 bg-[#FFE500] border-b border-[#D4C000] dark:border-[#C8B800] flex-shrink-0">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
                <Tag size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-manrope font-extrabold text-[#1A1A0E] leading-tight">Etiquetas</h2>
                <p className="text-xs font-bold text-[#1A1A0E]/55 mt-0.5">Elgin L42 Pro Full — impressão térmica</p>
              </div>
              <button
                onClick={handleClose}
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-black/[0.08] border border-black/10 text-black/50 hover:bg-black/[0.14] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div className="px-6 pt-3 flex items-center gap-5 bg-[#F0E7CC] dark:bg-[#1E1E18] border-b border-black/10 dark:border-white/[0.08] flex-shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('selecao')}
                className={cn(
                  'px-1 py-2.5 -mb-px text-[11px] font-extrabold uppercase tracking-wide transition-colors border-b-2',
                  activeTab === 'selecao' ? 'border-primary text-primary' : 'border-transparent text-secondary hover:text-on-surface'
                )}
              >
                Seleção
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('visualizacao')}
                className={cn(
                  'px-1 py-2.5 -mb-px text-[11px] font-extrabold uppercase tracking-wide transition-colors border-b-2 flex items-center gap-1.5',
                  activeTab === 'visualizacao' ? 'border-primary text-primary' : 'border-transparent text-secondary hover:text-on-surface'
                )}
              >
                Visualização
                {totalLabels > 0 && (
                  <span className={cn(
                    'px-1.5 py-0.5 rounded-full text-[10px] font-black leading-none',
                    activeTab === 'visualizacao' ? 'bg-primary/10 text-primary' : 'bg-black/[0.06] dark:bg-white/[0.08] text-secondary/70'
                  )}>
                    {totalLabels}
                  </span>
                )}
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
              {activeTab === 'selecao' && (
                <>
                  {/* Modelo de etiqueta — dropdown mostrando só o nome */}
                  <div>
                    <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">Modelo de etiqueta</span>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setTemplateMenuOpen(v => !v)}
                        className="w-full h-[46px] px-4 rounded-2xl border-[1.5px] border-black/[0.14] dark:border-white/[0.14] bg-white dark:bg-[#252520] flex items-center justify-between text-[13.5px] font-extrabold text-on-surface transition-colors"
                      >
                        {TEMPLATE_LABELS[template]}
                        <ChevronDown size={16} className={cn('text-secondary/50 transition-transform duration-150', templateMenuOpen && 'rotate-180')} />
                      </button>
                      <AnimatePresence>
                        {templateMenuOpen && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.97, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.97, y: -4 }}
                            transition={{ duration: 0.13 }}
                            className="absolute z-10 mt-1.5 w-full rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#2E2E28] shadow-xl overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => { setTemplate('gondola'); setTemplateMenuOpen(false); }}
                              className="w-full text-left px-4 py-3 text-[13px] font-bold text-on-surface hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                            >
                              {TEMPLATE_LABELS.gondola}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setTemplate('produto'); setTemplateMenuOpen(false); }}
                              className="w-full text-left px-4 py-3 text-[13px] font-bold text-on-surface hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors flex items-center justify-between"
                            >
                              {TEMPLATE_LABELS.produto}
                              <span className="text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary">Adesiva 40×40mm</span>
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Busca */}
                  <div>
                    <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">Buscar produto</span>
                    <div className="relative">
                      <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary/40 pointer-events-none" />
                      <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por nome, SKU ou EAN…"
                        className="w-full h-[42px] pl-10 pr-4 bg-black/[0.035] dark:bg-white/[0.05] border border-black/[0.10] dark:border-white/[0.10] rounded-2xl text-[13px] font-semibold text-on-surface placeholder:text-secondary/40 outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Resultados */}
                  {search.trim() === '' ? (
                    <p className="text-center text-[12px] font-semibold text-secondary/40 py-2">
                      Busque um produto pra adicionar à fila de impressão.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {searchResults.map(product => {
                        const draft = getDraft(product.id);
                        return (
                          <div key={product.id} className="flex items-center gap-3 p-3 rounded-2xl border border-black/[0.10] dark:border-white/[0.08] bg-white dark:bg-[#252520]">
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-bold text-on-surface truncate">{product.name}</p>
                              <p className="text-[10.5px] font-mono text-secondary/45 mt-0.5">
                                {product.ean && `EAN ${product.ean}`}
                                {product.ean && product.sku && ' · '}
                                {product.sku && `SKU ${product.sku}`}
                                {!product.ean && !product.sku && 'Sem código'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="flex bg-black/[0.06] dark:bg-white/[0.07] rounded-lg p-0.5 gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => setDraftSize(product.id, 'full')}
                                  className={cn(
                                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wide transition-all',
                                    draft.size === 'full'
                                      ? 'bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]'
                                      : 'text-secondary/50 hover:text-on-surface'
                                  )}
                                >
                                  {template === 'produto' && <IconWholeSquare size={12} />}
                                  Inteira
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDraftSize(product.id, 'half')}
                                  title={template === 'produto' ? 'Meia etiqueta — corte horizontal (40×20mm)' : undefined}
                                  className={cn(
                                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wide transition-all',
                                    draft.size === 'half'
                                      ? 'bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]'
                                      : 'text-secondary/50 hover:text-on-surface'
                                  )}
                                >
                                  {template === 'produto' && <IconHalfHorizontal size={12} />}
                                  Metade
                                </button>
                                {template === 'produto' && (
                                  <button
                                    type="button"
                                    onClick={() => setDraftSize(product.id, 'triple')}
                                    title="3 códigos de barras — divide a etiqueta em 3 faixas, cada uma só com o código de barras"
                                    className={cn(
                                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wide transition-all',
                                      draft.size === 'triple'
                                        ? 'bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]'
                                        : 'text-secondary/50 hover:text-on-surface'
                                    )}
                                  >
                                    <IconTriple size={12} />
                                    Código
                                  </button>
                                )}
                              </div>
                              <input
                                type="number"
                                min={1}
                                value={draft.qty === 0 ? '' : draft.qty}
                                onWheel={blockWheelChange}
                                onChange={e => {
                                  const raw = e.target.value;
                                  if (raw === '') { setDraftQty(product.id, 0); return; }
                                  const val = parseInt(raw);
                                  if (!Number.isNaN(val)) setDraftQty(product.id, val);
                                }}
                                onBlur={() => { if (getDraft(product.id).qty < 1) setDraftQty(product.id, 1); }}
                                className="w-11 h-[34px] border border-black/[0.14] dark:border-white/[0.14] rounded-lg text-center text-[13px] font-extrabold text-on-surface bg-transparent outline-none focus:border-primary/50 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button
                                type="button"
                                onClick={() => confirmAdd(product)}
                                className="w-[34px] h-[34px] rounded-lg bg-[#1A1A0E] dark:bg-[#FFE500] text-[#FFE500] dark:text-[#1A1A0E] flex items-center justify-center flex-shrink-0 hover:opacity-80 transition-opacity active:scale-95"
                                title="Adicionar à fila"
                              >
                                <Plus size={15} strokeWidth={2.5} />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {searchResults.length === 0 && (
                        <p className="text-center text-[12px] font-semibold text-secondary/35 py-4">
                          Nenhum produto encontrado.
                        </p>
                      )}

                      {queueList.length > 0 && (
                        <p className="text-center text-[10.5px] font-semibold text-secondary/35 pt-1">
                          Produtos já adicionados à fila somem daqui — veja e ajuste em "Visualização"
                        </p>
                      )}
                    </div>
                  )}

                  {template === 'produto' && (
                    <div className="flex flex-col items-center gap-1 -mt-2">
                      <p className="text-center text-[10px] font-semibold text-secondary/40 flex items-center justify-center gap-1.5">
                        <IconHalfHorizontal size={11} />
                        Metade corta a etiqueta ao meio na horizontal (duas de 40×20mm)
                      </p>
                      <p className="text-center text-[10px] font-semibold text-secondary/40 flex items-center justify-center gap-1.5">
                        <IconTriple size={11} />
                        Código divide em 3 faixas, cada uma só com o código de barras
                      </p>
                    </div>
                  )}

                  {/* Informações adicionais — exclusivas da Etiqueta de Produto */}
                  {template === 'produto' && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55">Informações adicionais</span>
                        <button
                          type="button"
                          onClick={() => setExtraInfoOn(v => !v)}
                          className={cn('relative w-9 h-5 rounded-full transition-colors', extraInfoOn ? 'bg-primary' : 'bg-black/15 dark:bg-white/15')}
                        >
                          <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all', extraInfoOn ? 'left-[18px]' : 'left-0.5')} />
                        </button>
                      </div>
                      {extraInfoOn && (
                        <div className="flex flex-col gap-3 p-3.5 rounded-2xl border border-[#D4C000] dark:border-[#FFE500]/25 bg-[#FFE500]/[0.12] dark:bg-[#FFE500]/[0.06]">
                          <p className="text-[10.5px] font-semibold text-secondary/60 leading-relaxed -mt-0.5">
                            Além de descrição, REF e código de barras, inclua os campos abaixo — os valores digitados valem pra todas as etiquetas desta impressão.
                          </p>
                          <div className="flex flex-wrap gap-x-4 gap-y-2">
                            {EXTRA_INFO_FIELDS.map(field => (
                              <button
                                key={field.key}
                                type="button"
                                onClick={() => toggleExtraField(field.key)}
                                className="flex items-center gap-2"
                              >
                                <div className={cn(
                                  'w-[18px] h-[18px] rounded-md flex items-center justify-center flex-shrink-0 transition-colors',
                                  extraChecked[field.key] ? 'bg-[#1A1A0E] dark:bg-[#FFE500]' : 'border-2 border-black/20 dark:border-white/20'
                                )}>
                                  {extraChecked[field.key] && <Check size={11} strokeWidth={3} className="text-[#FFE500] dark:text-[#1A1A0E]" />}
                                </div>
                                <span className={cn('text-[11.5px] font-semibold', extraChecked[field.key] ? 'text-on-surface' : 'text-secondary/60')}>{field.label}</span>
                              </button>
                            ))}
                          </div>
                          {EXTRA_INFO_FIELDS.some(f => extraChecked[f.key]) && (
                            <div className="flex flex-wrap gap-2">
                              {EXTRA_INFO_FIELDS.filter(f => extraChecked[f.key]).map(field => (
                                <div key={field.key} className="flex-1 min-w-[150px]">
                                  <label className="block text-[9px] font-extrabold uppercase tracking-wide text-secondary/45 mb-1">{field.label}</label>
                                  <input
                                    value={extraValues[field.key] ?? ''}
                                    onChange={e => setExtraValue(field.key, e.target.value)}
                                    placeholder={field.placeholder}
                                    maxLength={field.key === 'cnpj' ? 18 : undefined}
                                    className="w-full h-9 px-3 bg-white dark:bg-[#252520] border border-black/[0.10] dark:border-white/[0.10] rounded-xl text-[12.5px] font-semibold text-on-surface outline-none focus:border-primary/50 transition-colors"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Resumo da fila */}
                  {queueList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('visualizacao')}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-[#FFE500]/30 dark:bg-[#FFE500]/10 border border-[#D4C000] dark:border-[#FFE500]/30 transition-colors hover:bg-[#FFE500]/40 dark:hover:bg-[#FFE500]/[0.15]"
                    >
                      <span className="text-[12px] font-extrabold text-on-surface">
                        <b>{queueList.length}</b> produto{queueList.length !== 1 ? 's' : ''} na fila · <b>{totalLabels}</b> etiqueta{totalLabels !== 1 ? 's' : ''}
                      </span>
                      <span className="text-[11px] font-extrabold text-on-surface underline underline-offset-2">Ver na Visualização</span>
                    </button>
                  )}
                </>
              )}

              {activeTab === 'visualizacao' && (
                <>
                  {template === 'gondola' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">Prévia — Inteira</span>
                        <LabelPreview variant="full" items={[previewFull]} />
                        <p className="text-center font-mono text-[10.5px] font-bold text-secondary/40 mt-2">{ELGIN_LABEL_W} × {ELGIN_LABEL_H}mm</p>
                      </div>
                      <div>
                        <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">Prévia — Metade</span>
                        <LabelPreview variant="half" items={[previewHalfA, previewHalfB]} />
                        <p className="text-center font-mono text-[10.5px] font-bold text-secondary/40 mt-2">2 × {(ELGIN_LABEL_W / 2).toFixed(1)} × {ELGIN_LABEL_H}mm</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">Prévia — Inteira</span>
                        <ProdutoPreviewFull product={previewFull} extraFields={extraFieldsFilled} />
                        <p className="text-center font-mono text-[10.5px] font-bold text-secondary/40 mt-2">{PRODUTO_LABEL_SIZE} × {PRODUTO_LABEL_SIZE}mm</p>
                      </div>
                      <div>
                        <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">Prévia — Metade</span>
                        <ProdutoPreviewHalf items={[previewHalfA, previewHalfB]} />
                        <p className="text-center font-mono text-[10.5px] font-bold text-secondary/40 mt-2">2 × {PRODUTO_LABEL_SIZE} × {PRODUTO_HALF_H}mm</p>
                      </div>
                      <div>
                        <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">Prévia — Código</span>
                        <ProdutoPreviewTriple items={[previewTripleA, previewTripleB, previewTripleC]} />
                        <p className="text-center font-mono text-[10.5px] font-bold text-secondary/40 mt-2">3 × {PRODUTO_LABEL_SIZE} × {PRODUTO_THIRD_H.toFixed(1)}mm</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 mb-2">Produtos selecionados para impressão</span>
                    {queueList.length === 0 ? (
                      <p className="text-center text-[12px] font-semibold text-secondary/35 py-6">
                        Nenhum produto na fila ainda — adicione pela aba Seleção.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {queueList.map(([id, entry]) => {
                          const edited = !!entry.overrides;
                          const effective = effectiveLabelProduct(entry);
                          return (
                            <div key={id} className={cn(
                              'flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border',
                              edited ? 'border-[#D4C000] dark:border-[#FFE500]/30 bg-[#FFE500]/[0.10] dark:bg-[#FFE500]/[0.06]' : 'border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#252520]'
                            )}>
                              <span className="flex-1 min-w-0 flex items-center gap-1.5">
                                <span className="min-w-0 text-[12.5px] font-bold text-on-surface truncate">{effective.name}</span>
                                {edited && (
                                  <span className="shrink-0 text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-[#D4C000]/25 dark:bg-[#FFE500]/20 text-[#7A6A00] dark:text-[#FFE500]">Editado</span>
                                )}
                              </span>
                              <div className="flex bg-black/[0.06] dark:bg-white/[0.07] rounded-lg p-0.5 gap-0.5 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => updateQueueSize(id, 'full')}
                                  className={cn(
                                    'px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wide transition-all',
                                    entry.size === 'full'
                                      ? 'bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]'
                                      : 'text-secondary/50 hover:text-on-surface'
                                  )}
                                >
                                  Inteira
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateQueueSize(id, 'half')}
                                  className={cn(
                                    'px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wide transition-all',
                                    entry.size === 'half'
                                      ? 'bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]'
                                      : 'text-secondary/50 hover:text-on-surface'
                                  )}
                                >
                                  Metade
                                </button>
                                {template === 'produto' && (
                                  <button
                                    type="button"
                                    onClick={() => updateQueueSize(id, 'triple')}
                                    className={cn(
                                      'px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wide transition-all',
                                      entry.size === 'triple'
                                        ? 'bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]'
                                        : 'text-secondary/50 hover:text-on-surface'
                                    )}
                                  >
                                    Código
                                  </button>
                                )}
                              </div>

                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => updateQueueQty(id, Math.max(1, entry.qty - 1))}
                                  className="w-6 h-6 rounded-md bg-black/[0.06] dark:bg-white/[0.07] text-secondary/60 flex items-center justify-center hover:text-on-surface transition-colors"
                                >
                                  <Minus size={11} strokeWidth={2.5} />
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  value={entry.qty === 0 ? '' : entry.qty}
                                  onWheel={blockWheelChange}
                                  onChange={e => {
                                    const raw = e.target.value;
                                    if (raw === '') { updateQueueQty(id, 0); return; }
                                    const val = parseInt(raw);
                                    if (!Number.isNaN(val)) updateQueueQty(id, val);
                                  }}
                                  onBlur={() => { if (entry.qty < 1) updateQueueQty(id, 1); }}
                                  className="w-8 h-6 text-center text-[11px] font-extrabold text-on-surface bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => updateQueueQty(id, entry.qty + 1)}
                                  className="w-6 h-6 rounded-md bg-black/[0.06] dark:bg-white/[0.07] text-secondary/60 flex items-center justify-center hover:text-on-surface transition-colors"
                                >
                                  <Plus size={11} strokeWidth={2.5} />
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => setEditingId(id)}
                                title={edited ? 'Editar etiqueta (personalizada)' : 'Editar etiqueta'}
                                className={cn(
                                  'relative w-[26px] h-[26px] rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
                                  edited ? 'bg-[#1A1A0E]/[0.08] dark:bg-white/[0.10] text-[#1A1A0E] dark:text-on-surface' : 'bg-black/[0.05] dark:bg-white/[0.06] text-secondary/60 hover:text-on-surface'
                                )}
                              >
                                <Pencil size={13} />
                                {edited && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary border border-white dark:border-[#1E1E18]" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeFromQueue(id)}
                                className="w-[26px] h-[26px] rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 hover:bg-primary/20 transition-colors"
                              >
                                <X size={12} strokeWidth={2.5} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-1 flex-shrink-0">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 bg-black/[0.06] dark:bg-white/[0.07] text-secondary font-bold py-3 rounded-2xl hover:bg-black/[0.10] dark:hover:bg-white/[0.11] transition-colors"
                >
                  Cancelar
                </button>
                {requestId && onSaveQueue && (
                  <button
                    type="button"
                    onClick={handleSaveQueue}
                    disabled={totalLabels === 0 || savingQueue}
                    className="flex-1 bg-black/[0.06] dark:bg-white/[0.07] text-on-surface font-bold py-3 rounded-2xl hover:bg-black/[0.10] dark:hover:bg-white/[0.11] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Save size={15} />
                    {savingQueue ? 'Salvando…' : 'Salvar'}
                  </button>
                )}
                {!requestId && onSendQueue && (
                  <button
                    type="button"
                    onClick={handleSendQueue}
                    disabled={totalLabels === 0 || sendingQueue}
                    className="flex-1 bg-black/[0.06] dark:bg-white/[0.07] text-on-surface font-bold py-3 rounded-2xl hover:bg-black/[0.10] dark:hover:bg-white/[0.11] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Send size={15} />
                    {sendingQueue ? 'Enviando…' : 'Enviar'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (template === 'gondola' ? printElgin() : printProduto())}
                  disabled={totalLabels === 0}
                  className="flex-1 bg-primary text-white font-bold py-3 rounded-2xl hover:opacity-90 transition-colors shadow-lg shadow-primary/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Printer size={15} />
                  {`Imprimir ${totalLabels} etiqueta${totalLabels !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </motion.div>

          <LabelEditModal
            isOpen={!!editingEntry}
            product={editingEntry?.product}
            overrides={editingEntry?.overrides}
            onSave={overrides => { if (editingId) setEntryOverrides(editingId, overrides); }}
            onRestore={() => { if (editingId) setEntryOverrides(editingId, {}); }}
            onClose={() => setEditingId(null)}
          />
        </div>
      )}
    </AnimatePresence>
  );
}
