'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Tag, Printer, Plus, Minus, ChevronDown, Check, Pencil, Send, Save, Eye, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateBarcodeDataUrl } from './labelPrintUtils';
import { squareTabCls, squareTabsBarCls } from '@/components/shared/squareTabs';
import {
  modalBackdropCls, modalCls, barCls, barChipCls, barTitleCls, barSubtitleCls, closeBtnCls,
  sectionCls, sectionHeadCls, sectionTitleCls, sectionCountCls, labelCls, inputCls, noSpinCls,
  rowCls, segCls, segBtnCls, iconBtnCls, deleteBtnCls, footerCls, btnCls, btnPrimaryCls,
  highlightCls, highlightBoxCls,
} from './labelUi';
import { LabelEditModal } from './LabelEditModal';
import { LabelInfoModal, resolveLabelInfo, hasLabelInfo, LABEL_INFO_FIELDS, type LabelInfoConfig, type ProductCadastroPatch } from './LabelInfoModal';
import type { Manufacturer } from '@/components/manufacturers/AddManufacturerModal';
import { supabase } from '@/lib/supabase';

export const blockWheelChange = (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur();

// Elgin L42 Pro — etiqueta térmica em bobina contínua (uma etiqueta por vez,
// sem grid de blocos de folha). Este módulo é dedicado exclusivamente a essa impressora.
export const ELGIN_LABEL_W = 105; // mm
export const ELGIN_LABEL_H = 28;  // mm — etiqueta de gôndola real medida (não 30mm)
export const HALF_OFFSET_X = ELGIN_LABEL_W / 2; // 52.5mm — onde começa a 2ª metade

export interface ElPos { x: number; y: number; w: number; h: number }
export interface CellLayout { nome: ElPos; ref: ElPos; barcode: ElPos; rs: ElPos; preco: ElPos; data: ElPos }

// Posições em mm, origem no canto superior esquerdo de cada etiqueta/metade.
// Extraídas por análise de pixel de um par de imagens de referência fornecidas
// pelo usuário (retângulos coloridos delimitando cada elemento — legenda:
// #ff66c4 nome, #ff5757 ref, #5e17eb código de barras, #ffbd59 R$, #7ed957
// preço), medidas em % da largura/altura do rótulo e convertidas pra mm.
// Tudo 1mm mais pra baixo que a extração original — a descrição estava sendo
// cortada pelo gap entre etiquetas.
export const FULL_LAYOUT: CellLayout = {
  nome:    { x: 3,    y: 3.9,  w: 99,   h: 4.1  },
  ref:     { x: 3,    y: 9.2,  w: 34,   h: 2.5  },
  barcode: { x: 3,    y: 13.7, w: 49,   h: 12.4 },
  // R$/preço mais acima e à esquerda pra abrir espaço à linha "Data de Impressão".
  rs:      { x: 60.3, y: 8.8,  w: 5,    h: 4.5  },
  preco:   { x: 63.6, y: 8.8,  w: 35.3, h: 13.4 },
  data:    { x: 60.3, y: 24.6, w: 41,   h: 2.6  },
};
// Conteúdo 2mm mais para cima que a extração original (3mm pra cima, depois
// 1mm de volta pra baixo) e a distância entre o REF e o bloco de baixo
// (código de barras/R$/preço) reduzida pra no máximo 3mm — pedidos do
// usuário depois de ver os testes impressos.
export const HALF_LAYOUT: CellLayout = {
  nome:    { x: 3,    y: 2,    w: 46,  h: 2.7 },
  ref:     { x: 3,    y: 6.2,  w: 21,  h: 2   },
  barcode: { x: 3,    y: 11.2, w: 21,  h: 9.3 },
  // R$/preço 1,5mm mais acima pra abrir espaço à linha "Data de Impressão".
  rs:      { x: 24.7, y: 9.7,  w: 3.5, h: 3   },
  preco:   { x: 28.5, y: 9.7,  w: 21,  h: 10  },
  data:    { x: 14.2, y: 20,   w: 27.5, h: 2  },
};

// Descrição da etiqueta de Gôndola: sempre em MAIÚSCULO, Arimo negrito. O
// arquivo da fonte vai junto no app (public/fonts) pra impressão não depender
// da fonte instalada no computador; @font-face está em globals.css e na janela
// de impressão.
export const NOME_FONT_FAMILY = "Arimo, Arial, Helvetica, sans-serif";
export const NOME_FONT_WEIGHT = 700;
export const ARIMO_FONT_URL = '/fonts/Arimo-VariableFont_wght.ttf';
export function ensureArimoLoaded(): Promise<unknown> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  return document.fonts.load(`${NOME_FONT_WEIGHT} 16px Arimo`).catch(() => undefined);
}
function useArimoReady(): void {
  const [, setReady] = useState(false);
  useEffect(() => { let alive = true; ensureArimoLoaded().then(() => { if (alive) setReady(true); }); return () => { alive = false; }; }, []);
}
export function dataImpressaoText(): string {
  return `Data de Impressão - ${new Date().toLocaleDateString('pt-BR')}`;
}

// Respiro entre o nome e o REF logo abaixo dele.
const NOME_GAP_MM = 0.3;

const PREVIEW_PX_PER_MM = 4; // escala de referência da prévia (~420px pra 105mm)

// Etiqueta de Produto — adesiva 40x40mm (branca, sem pré-impressão), para
// produtos sem etiqueta / com etiqueta danificada ou código ilegível. Metade
// corta HORIZONTAL (duas de 40x20mm empilhadas) — diferente da Gôndola, que
// corta vertical.
export const PRODUTO_LABEL_SIZE = 40; // mm — lado da etiqueta Inteira / folha impressa da Metade
export const PRODUTO_HALF_H = PRODUTO_LABEL_SIZE / 2; // 20mm — altura de cada metade

// A Inteira, a Metade e o Código usam layouts fixos próprios — ver
// PRODUTO_FULL_SPEC, PRODUTO_HALF_SPEC e PRODUTO_CODIGO_SPEC.
const PT_MM = 0.3528; // 1pt em mm

// Linha de corte pontilhada (0,5mm) no meio da folha 40x40 da Metade — em
// coordenadas mm (viewBox 0 0 40 40), usada igual na prévia e na impressão.
const CORTE_LINE_SVG_INNER = `<line x1="0.5" y1="${PRODUTO_LABEL_SIZE / 2}" x2="${PRODUTO_LABEL_SIZE - 0.5}" y2="${PRODUTO_LABEL_SIZE / 2}" stroke="#141400" stroke-width="0.5" stroke-linecap="round" stroke-dasharray="0 1" />`;

// Descrição da Metade: cada palavra com inicial maiúscula, exceto conectivos
// ("e", "de", "com"...). Palavra em MAIÚSCULO (padrão do cadastro) ou
// minúsculo é convertida; palavra em caixa mista (ex: "iPhone") fica como está.
const TITLE_CASE_LOWER = new Set([
  'e', 'ou', 'de', 'da', 'do', 'das', 'dos', 'com', 'sem', 'em', 'na', 'no', 'nas', 'nos',
  'para', 'pra', 'por', 'a', 'o', 'as', 'os', 'ao', 'aos', 'à', 'às', 'x', 'c/', 's/', 'p/',
]);
const TITLE_CASE_UNIT_RE = /^(\d+(?:[.,]\d+)?)(ml|l|lt|g|gr|kg|mg|cm|mm|m|un|und|pc|pcs|w|v)$/;
function capitalizeFirstLetter(word: string): string {
  for (let i = 0; i < word.length; i++) {
    const c = word[i];
    if (c >= '0' && c <= '9') return word;
    if (c.toLowerCase() !== c.toUpperCase()) return word.slice(0, i) + c.toUpperCase() + word.slice(i + 1);
  }
  return word;
}
export function titleCasePt(text: string): string {
  return text.trim().split(/\s+/).map((raw, i) => {
    const lower = raw.toLowerCase();
    const mixed = raw !== lower && raw !== raw.toUpperCase();
    const word = mixed ? raw : lower;
    const unit = lower.match(TITLE_CASE_UNIT_RE);
    if (unit) return unit[1] + (unit[2] === 'l' ? 'L' : unit[2]);
    if (i > 0 && TITLE_CASE_LOWER.has(lower)) return lower;
    if (mixed) return word;
    const abbr = word.match(/^([cspCSP])\/(.+)$/); // c/, s/, p/
    if (abbr) return (i === 0 ? abbr[1].toUpperCase() : abbr[1].toLowerCase()) + '/' + capitalizeFirstLetter(abbr[2]);
    return word.split('-').map((part, j) => (
      j > 0 && TITLE_CASE_LOWER.has(part.toLowerCase()) ? part.toLowerCase() : capitalizeFirstLetter(part)
    )).join('-');
  }).join(' ');
}
function produtoDescText(product: any): string {
  const name = product.name || '—';
  return titleCasePt(name);
}

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

// Quebra o texto em até `maxLines` linhas medindo a largura real (canvas),
// e não com -webkit-line-clamp — o line-clamp calcula sua própria altura de
// recorte a partir da line-height renderizada, que na impressão real pode
// sair menor que a estimativa em mm usada pro tamanho da caixa (1.05), sobrando
// espaço onde uma 3ª linha inteira (ou pedaço dela) aparece por cima do que
// vem embaixo em vez de ficar escondida. Pré-calculando as linhas aqui, o
// HTML impresso nunca contém uma 3ª linha pra vazar.
function wrapToLines(text: string, maxWidth: number, fontSize: number, weight: number | string, family: string, maxLines: number): string[] {
  if (typeof document === 'undefined' || !text) return [text];
  const safeWidth = maxWidth * FIT_SAFETY;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[][] = [[]];
  for (const word of words) {
    const line = lines[lines.length - 1];
    const attempt = [...line, word].join(' ');
    if (line.length === 0 || measureTextWidth(attempt, fontSize, weight, family) <= safeWidth) {
      line.push(word);
    } else {
      lines.push([word]);
    }
  }

  if (lines.length <= maxLines) return lines.map(l => l.join(' '));

  const kept = lines.slice(0, maxLines).map(l => [...l]);
  const overflowWords = lines.slice(maxLines).flat();
  const lastLine = kept[maxLines - 1];
  lastLine.push(...overflowWords);
  while (lastLine.length > 1 && measureTextWidth(`${lastLine.join(' ')}…`, fontSize, weight, family) > safeWidth) {
    lastLine.pop();
  }
  const result = kept.slice(0, maxLines - 1).map(l => l.join(' '));
  result.push(`${lastLine.join(' ')}…`);
  return result;
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
    layout.data.y + layout.data.h,
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
    data: { ...layout.data, y: layout.data.y + dy },
  };
}

// Metade: depois de calcular o tamanho/quebra do nome (com a geometria
// original), o REF sobe 2mm e código de barras/R$/preço sobem 2mm. O REF só
// sobe quando o nome ocupa 2 linhas — com o nome em 1 linha não há espaço
// livre acima dele (o nome termina 0,3mm antes do REF).
const HALF_REF_LIFT_MM = 2;
const HALF_BLOCK_LIFT_MM = 2;
function liftHalfLayout(layout: CellLayout, shifted: CellLayout, twoLines: boolean): CellLayout {
  if (layout !== HALF_LAYOUT) return shifted;
  return {
    ...shifted,
    ref: { ...shifted.ref, y: shifted.ref.y - (twoLines ? HALF_REF_LIFT_MM : 0) },
    barcode: { ...shifted.barcode, y: shifted.barcode.y - HALF_BLOCK_LIFT_MM },
    rs: { ...shifted.rs, y: shifted.rs.y - HALF_BLOCK_LIFT_MM },
    preco: { ...shifted.preco, y: shifted.preco.y - HALF_BLOCK_LIFT_MM },
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
// Quando o nome (que já saiu menor que o tamanho cheio por não caber em 1 linha
// no tamanho cheio) ainda cabe numa linha só na Inteira, ele sobe 1 tamanho
// (1pt) e desce 2mm — antes ficava colado no topo da etiqueta. Nomes que
// realmente precisam de 2 linhas mantêm o tamanho/posição de antes, senão
// bateriam no REF.
const FULL_NOME_ONE_LINE_BUMP_MM = 0.353; // 1pt
const FULL_NOME_ONE_LINE_DROP_MM = 1;
// Na Inteira, nome de 1 linha (qualquer tamanho) fica 1mm acima da posição base.
const FULL_NOME_ONE_LINE_RAISE_MM = 1;
function fitNomeLayout(text: string, layout: CellLayout, weight: number | string, family: string): NomeFit {
  const scale = layout === HALF_LAYOUT ? HALF_NOME_SCALE : 1;
  const w = layout.nome.w;
  const bottom = layout.ref.y - NOME_GAP_MM;
  const singleMaxH = Math.max(1, bottom - layout.nome.y);
  const fitsOneLine = measureTextWidth(text, singleMaxH, weight, family) <= w * FIT_SAFETY;
  if (fitsOneLine) {
    const raise = layout === FULL_LAYOUT ? FULL_NOME_ONE_LINE_RAISE_MM : 0;
    return { fontSizeMm: singleMaxH * scale, yMm: layout.nome.y - raise, hMm: singleMaxH, twoLines: false, extraH: 0 };
  }

  if (layout === FULL_LAYOUT) {
    const maxAvailableH = Math.max(singleMaxH, bottom - FULL_NOME_TOP_SAFETY_MM);
    const standardSize = maxAvailableH / (2 * 1.05);
    const blockH = standardSize * 1.05 * 2;
    const bumpedSize = standardSize + FULL_NOME_ONE_LINE_BUMP_MM;
    if (measureTextWidth(text, bumpedSize, weight, family) <= w * FIT_SAFETY) {
      const oneLineH = bumpedSize * 1.05;
      const yMm = Math.max(FULL_NOME_TOP_SAFETY_MM, bottom - blockH) + FULL_NOME_ONE_LINE_DROP_MM;
      return { fontSizeMm: bumpedSize, yMm, hMm: oneLineH, twoLines: false, extraH: 0 };
    }
    return { fontSizeMm: standardSize, yMm: bottom - blockH, hMm: blockH, twoLines: true, extraH: 0 };
  }

  const standardSize = maxTwoLineNomeSize(layout);
  const blockH = standardSize * 1.05 * 2;
  const extraH = Math.max(0, blockH - layout.nome.h);
  return { fontSizeMm: standardSize * scale, yMm: layout.nome.y, hMm: blockH, twoLines: true, extraH };
}

export const SAMPLE_FULL = { name: 'COCA COLA ORIGINAL 350ML', sku: '0000', ean: '899197910205', price: 5 };
export const SAMPLE_HALF_A = { name: 'Refrigerante Guaraná Lata 350ml', sku: '0457', ean: '7891234500011', price: 3.49 };
export const SAMPLE_HALF_B = { name: 'Água Mineral s/Gás 500ml', sku: '0312', ean: '7891234512345', price: 2 };
export const SAMPLE_TRIPLE_C = { name: 'Suco de Uva Integral 1L', sku: '0891', ean: '7891234598765', price: 8.9 };
export const SAMPLE_TRIPLE_D = { name: 'Biscoito Recheado Chocolate 140g', sku: '0623', ean: '7891234587654', price: 3.29 };

function LabelPreviewCell({ product, layout, offsetXMm }: { product: any; layout: CellLayout; offsetXMm: number }) {
  useArimoReady();
  const box = (p: ElPos, extra?: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    left: `${((p.x + offsetXMm) / ELGIN_LABEL_W) * 100}%`,
    top: `${(p.y / ELGIN_LABEL_H) * 100}%`,
    width: `${(p.w / ELGIN_LABEL_W) * 100}%`,
    height: `${(p.h / ELGIN_LABEL_H) * 100}%`,
    ...extra,
  });
  const code = product.ean || product.sku || '';
  const nomeText = (product.name || '—').toUpperCase();
  const refText = `REF ${productRef(product)}`;
  const priceText = formatPriceValue(product.price ?? 0);
  const dataText = dataImpressaoText();

  const nomeFit = fitNomeLayout(nomeText, layout, NOME_FONT_WEIGHT, NOME_FONT_FAMILY);
  const nomeBox: ElPos = { x: layout.nome.x, y: nomeFit.yMm, w: layout.nome.w, h: nomeFit.hMm };
  const shifted = liftHalfLayout(layout, shiftLayoutDown(layout, nomeFit.extraH), nomeFit.twoLines);
  const refSize = fitFontSize(refText, shifted.ref.w * PREVIEW_PX_PER_MM, shifted.ref.h * PREVIEW_PX_PER_MM, 900, "'DM Mono', monospace");
  const rsSize = fitFontSize('R$', shifted.rs.w * PREVIEW_PX_PER_MM, shifted.rs.h * PREVIEW_PX_PER_MM, 800, 'DM Sans, sans-serif');
  const precoSize = fitFontSize(priceText, shifted.preco.w * PREVIEW_PX_PER_MM, shifted.preco.h * PREVIEW_PX_PER_MM, 800, 'DM Sans, sans-serif');
  const bcNumSize = code ? fitFontSize(code, shifted.barcode.w * PREVIEW_PX_PER_MM, shifted.barcode.h * 0.3 * PREVIEW_PX_PER_MM, 700, "'DM Mono', monospace") : 0;
  const dataSize = fitFontSize(dataText, shifted.data.w * PREVIEW_PX_PER_MM, shifted.data.h * PREVIEW_PX_PER_MM, 400, 'DM Sans, sans-serif');

  return (
    <>
      <div style={box(nomeBox, {
        fontFamily: NOME_FONT_FAMILY, fontSize: nomeFit.fontSizeMm * PREVIEW_PX_PER_MM, fontWeight: NOME_FONT_WEIGHT, color: '#141400', lineHeight: 1.05, overflow: 'hidden', textAlign: 'left',
        ...(nomeFit.twoLines
          ? { whiteSpace: 'pre-line' } as React.CSSProperties
          : { whiteSpace: 'nowrap', textOverflow: 'ellipsis' }),
      })}>
        {nomeFit.twoLines
          ? wrapToLines(nomeText, layout.nome.w, nomeFit.fontSizeMm, NOME_FONT_WEIGHT, NOME_FONT_FAMILY, 2).join('\n')
          : nomeText}
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
      <div style={box(shifted.preco, { fontSize: precoSize, fontWeight: 800, color: '#141400', lineHeight: 0.85, whiteSpace: 'nowrap', overflow: 'visible', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' })}>
        {priceText}
      </div>
      <div style={box(shifted.data, { fontSize: dataSize, color: '#3c3c3c', whiteSpace: 'nowrap', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' })}>
        {dataText}
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

// Etiqueta de Produto Inteira — layout FIXO (medidas do usuário, em mm):
// cada elemento tem posição e tamanho de fonte próprios, que não mudam com o
// tamanho da descrição nem com a presença de informações adicionais. Texto
// que não cabe é cortado com "…" em vez de encolher.
export const MONTASER_FONT_FAMILY = "'Montaser Arabic', Arimo, Arial, Helvetica, sans-serif";
const PRODUTO_FULL_SPEC = {
  descricao: { x: 1.79, y: 2.23, w: 36.42, h: 6.96 },
  descricaoFontMm: 8 * PT_MM,
  ref: { x: 1.79, y: 10.35, w: 36.42, h: 2.4 },
  refFontMm: 6 * PT_MM,
  info: { x: 1.79, y: 15.53, w: 36.02, rowH: 2, maxY: 23.8 }, // um campo por linha
  infoFontMm: 5 * PT_MM,
  barcode: { x: 2.18, y: 30.05, w: 35.63, h: 5.95 },
  bcNum: { x: 1.79, y: 36.79, w: 36.42, h: 2 },
};
const PRODUTO_FULL_DESC_WEIGHT = 700; // descrição da Inteira em negrito
const PRODUTO_FULL_REF_WEIGHT = 700;
const PRODUTO_FULL_INFO_MAX_ROWS = Math.floor((PRODUTO_FULL_SPEC.info.maxY - PRODUTO_FULL_SPEC.info.y) / PRODUTO_FULL_SPEC.info.rowH + 1e-6);

interface ProdutoFullContent { descLines: string[]; refText: string; infoRows: { label: string; value: string; y: number }[]; code: string; bcNumMm: number }
function produtoFullContent(product: any, extraFields: { label: string; value: string }[]): ProdutoFullContent {
  const s = PRODUTO_FULL_SPEC;
  const maxDescLines = Math.max(1, Math.floor(s.descricao.h / (s.descricaoFontMm * 1.05)));
  const descLines = wrapToLines(produtoDescText(product), s.descricao.w, s.descricaoFontMm, PRODUTO_FULL_DESC_WEIGHT, MONTASER_FONT_FAMILY, maxDescLines);
  const infoRows = extraFields.slice(0, PRODUTO_FULL_INFO_MAX_ROWS).map((f, i) => ({ ...f, y: s.info.y + i * s.info.rowH }));
  const code = product.ean || product.sku || '';
  const bcNumMm = code ? fitFontSize(code, s.bcNum.w, s.bcNum.h * 0.9, 700, "'Courier New', monospace") : 0;
  return { descLines, refText: `REF ${productRef(product)}`, infoRows, code, bcNumMm };
}

export function ProdutoPreviewFull({ product, extraFields }: { product: any; extraFields: { label: string; value: string }[] }) {
  useArimoReady();
  const s = PRODUTO_FULL_SPEC;
  const c = produtoFullContent(product, extraFields);
  const px = (mm: number) => mm * PREVIEW_PX_PER_MM;
  const box = (x: number, y: number, w: number, h: number, extra?: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    left: `${(x / PRODUTO_LABEL_SIZE) * 100}%`, top: `${(y / PRODUTO_LABEL_SIZE) * 100}%`,
    width: `${(w / PRODUTO_LABEL_SIZE) * 100}%`, height: `${(h / PRODUTO_LABEL_SIZE) * 100}%`,
    overflow: 'hidden', ...extra,
  });
  const line: React.CSSProperties = { whiteSpace: 'nowrap', textOverflow: 'ellipsis', textAlign: 'left' };
  return (
    <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-white shadow-inner border border-black/10">
      <div style={box(s.descricao.x, s.descricao.y, s.descricao.w, s.descricao.h, { fontFamily: MONTASER_FONT_FAMILY, fontWeight: PRODUTO_FULL_DESC_WEIGHT, fontSize: px(s.descricaoFontMm), lineHeight: 1.05, color: '#141400', whiteSpace: 'pre-line', textAlign: 'left' })}>
        {c.descLines.join('\n')}
      </div>
      <div style={box(s.ref.x, s.ref.y, s.ref.w, s.ref.h, { ...line, fontFamily: MONTASER_FONT_FAMILY, fontWeight: PRODUTO_FULL_REF_WEIGHT, fontSize: px(s.refFontMm), lineHeight: `${px(s.ref.h)}px`, color: '#141400' })}>
        {c.refText}
      </div>
      {c.infoRows.map(r => (
        <div key={r.label} style={box(s.info.x, r.y, s.info.w, s.info.rowH, { ...line, fontFamily: MONTASER_FONT_FAMILY, fontSize: px(s.infoFontMm), lineHeight: `${px(s.info.rowH)}px`, color: '#141400' })}>
          <b>{r.label}:</b>&nbsp;{r.value}
        </div>
      ))}
      <div style={box(s.barcode.x, s.barcode.y, s.barcode.w, s.barcode.h, { background: 'repeating-linear-gradient(90deg,#141400 0 2px, transparent 2px 4.4px)' })} />
      {c.code && (
        <div style={box(s.bcNum.x, s.bcNum.y, s.bcNum.w, s.bcNum.h, { fontFamily: "'DM Mono', monospace", fontWeight: 700, color: '#3c3c3c', textAlign: 'center', fontSize: px(c.bcNumMm), lineHeight: `${px(s.bcNum.h)}px`, whiteSpace: 'nowrap' })}>
          {c.code}
        </div>
      )}
    </div>
  );
}

// HTML de impressão da Inteira (mesmas medidas da prévia).
function buildProdutoFullHtml(product: any, extraFields: { label: string; value: string }[]): string {
  const s = PRODUTO_FULL_SPEC;
  const c = produtoFullContent(product, extraFields);
  const pos = (x: number, y: number, w: number, h: number) => `left:${x.toFixed(2)}mm; top:${y.toFixed(2)}mm; width:${w.toFixed(2)}mm; height:${h.toFixed(2)}mm;`;
  let bcDataUrl = '';
  if (c.code) {
    try { bcDataUrl = generateBarcodeDataUrl(c.code); } catch { /* sem código de barras se falhar */ }
  }
  const info = c.infoRows.map(r =>
    `<div class="pf pf-info" style="${pos(s.info.x, r.y, s.info.w, s.info.rowH)} line-height:${s.info.rowH}mm;"><b>${escapeHtml(r.label)}:</b>&nbsp;${escapeHtml(r.value)}</div>`
  ).join('');
  return `
    <div class="pf pf-desc" style="${pos(s.descricao.x, s.descricao.y, s.descricao.w, s.descricao.h)}">${escapeHtml(c.descLines.join('\n'))}</div>
    <div class="pf pf-ref" style="${pos(s.ref.x, s.ref.y, s.ref.w, s.ref.h)} line-height:${s.ref.h}mm;">${escapeHtml(c.refText)}</div>
    ${info}
    ${bcDataUrl ? `<img class="pf-bc" src="${bcDataUrl}" style="${pos(s.barcode.x, s.barcode.y, s.barcode.w, s.barcode.h)}" />` : ''}
    ${c.code ? `<div class="pf pf-bcnum" style="${pos(s.bcNum.x, s.bcNum.y, s.bcNum.w, s.bcNum.h)} line-height:${s.bcNum.h}mm; font-size:${c.bcNumMm.toFixed(2)}mm;">${escapeHtml(c.code)}</div>` : ''}
  `;
}
const PRODUTO_FULL_PRINT_CSS = `
  .pf { position: absolute; overflow: hidden; color: #141400; white-space: nowrap; text-overflow: ellipsis; text-align: left; }
  .pf-desc { font-family: ${MONTASER_FONT_FAMILY}; font-weight: ${PRODUTO_FULL_DESC_WEIGHT}; font-size: ${PRODUTO_FULL_SPEC.descricaoFontMm.toFixed(3)}mm; line-height: 1.05; white-space: pre-line; }
  .pf-ref { font-family: ${MONTASER_FONT_FAMILY}; font-weight: ${PRODUTO_FULL_REF_WEIGHT}; font-size: ${PRODUTO_FULL_SPEC.refFontMm.toFixed(3)}mm; }
  .pf-info { font-family: ${MONTASER_FONT_FAMILY}; font-weight: 400; font-size: ${PRODUTO_FULL_SPEC.infoFontMm.toFixed(3)}mm; }
  .pf-bc { position: absolute; object-fit: fill; }
  .pf-bcnum { font-family: 'Courier New', monospace; font-weight: 700; color: #3c3c3c; text-align: center; }
`;

// extraFields é por item (cada metade leva as informações adicionais do seu
// próprio produto) — item sem entrada/vazio usa o layout mínimo.
// Etiqueta de Produto Metade (40x20mm) — layout FIXO (medidas do usuário, em
// mm a partir do topo de cada metade), mesmo raciocínio da Inteira: posição e
// fonte de cada elemento não mudam com o tamanho da descrição nem com as
// informações adicionais. Informações adicionais: uma por linha a partir de
// 9,19mm; com 4 campos, o penúltimo encurta e o último (Validade) divide a 3ª
// linha com ele.
const PRODUTO_HALF_SPEC = {
  descricao: { x: 1.79, y: 0.88, w: 36.36, h: 5.22 },
  descricaoFontMm: 7 * PT_MM,
  ref: { x: 1.79, y: 6.33, w: 36.42, h: 2.2 },
  refFontMm: 5.5 * PT_MM,
  info: { x: 1.79, y: 9.19, w: 36.12, rowH: 1.6, rowStep: (12.42 - 9.19) / 2, maxRows: 3 },
  infoFontMm: 4 * PT_MM,
  infoShared: { penultW: 23.33, lastX: 25.84, lastY: 12.4, lastW: 12 },
  barcode: { x: 2.04, y: 14.55, w: 36.12, h: 3.5 },
  bcNum: { x: 13.07, y: 17.99, w: 13.86, h: 2.01 },
};

interface ProdutoHalfContent { descLines: string[]; refText: string; infoRows: { label: string; value: string; x: number; y: number; w: number }[]; code: string; bcNumMm: number }
function produtoHalfContent(product: any, extraFields: { label: string; value: string }[]): ProdutoHalfContent {
  const s = PRODUTO_HALF_SPEC;
  const maxDescLines = Math.max(1, Math.floor(s.descricao.h / (s.descricaoFontMm * 1.05)));
  const descLines = wrapToLines(produtoDescText(product), s.descricao.w, s.descricaoFontMm, NOME_FONT_WEIGHT, NOME_FONT_FAMILY, maxDescLines);
  const i = s.info;
  const shared = extraFields.length > i.maxRows; // 4 campos: 3ª linha dividida
  const infoRows = extraFields.slice(0, i.maxRows + 1).map((f, k) => {
    if (shared && k === i.maxRows) return { ...f, x: s.infoShared.lastX, y: s.infoShared.lastY, w: s.infoShared.lastW };
    return { ...f, x: i.x, y: i.y + k * i.rowStep, w: shared && k === i.maxRows - 1 ? s.infoShared.penultW : i.w };
  });
  const code = product.ean || product.sku || '';
  const bcNumMm = code ? fitFontSize(code, s.bcNum.w, s.bcNum.h * 0.9, 700, "'Courier New', monospace") : 0;
  return { descLines, refText: `REF ${productRef(product)}`, infoRows, code, bcNumMm };
}

function ProdutoHalfPreviewCell({ product, extraFields, offsetYMm }: { product: any; extraFields: { label: string; value: string }[]; offsetYMm: number }) {
  useArimoReady();
  const s = PRODUTO_HALF_SPEC;
  const c = produtoHalfContent(product, extraFields);
  const px = (mm: number) => mm * PREVIEW_PX_PER_MM;
  const box = (x: number, y: number, w: number, h: number, extra?: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    left: `${(x / PRODUTO_LABEL_SIZE) * 100}%`, top: `${((y + offsetYMm) / PRODUTO_LABEL_SIZE) * 100}%`,
    width: `${(w / PRODUTO_LABEL_SIZE) * 100}%`, height: `${(h / PRODUTO_LABEL_SIZE) * 100}%`,
    overflow: 'hidden', ...extra,
  });
  const font: React.CSSProperties = { fontFamily: NOME_FONT_FAMILY, fontWeight: NOME_FONT_WEIGHT };
  const line: React.CSSProperties = { whiteSpace: 'nowrap', textOverflow: 'ellipsis', textAlign: 'left' };
  return (
    <>
      <div style={box(s.descricao.x, s.descricao.y, s.descricao.w, s.descricao.h, { ...font, fontSize: px(s.descricaoFontMm), lineHeight: 1.05, color: '#141400', whiteSpace: 'pre-line', textAlign: 'left' })}>
        {c.descLines.join('\n')}
      </div>
      <div style={box(s.ref.x, s.ref.y, s.ref.w, s.ref.h, { ...line, ...font, fontSize: px(s.refFontMm), lineHeight: `${px(s.ref.h)}px`, color: '#3c3c3c' })}>
        {c.refText}
      </div>
      {c.infoRows.map(r => (
        <div key={r.label} style={box(r.x, r.y, r.w, s.info.rowH, { ...line, ...font, fontSize: px(s.infoFontMm), lineHeight: `${px(s.info.rowH)}px`, color: '#3c3c3c' })}>
          <b style={{ fontWeight: 'inherit' }}>{r.label}:</b>&nbsp;{r.value}
        </div>
      ))}
      <div style={box(s.barcode.x, s.barcode.y, s.barcode.w, s.barcode.h, { background: 'repeating-linear-gradient(90deg,#141400 0 2px, transparent 2px 4.4px)' })} />
      {c.code && (
        <div style={box(s.bcNum.x, s.bcNum.y, s.bcNum.w, s.bcNum.h, { fontFamily: "'DM Mono', monospace", fontWeight: 700, color: '#3c3c3c', textAlign: 'center', fontSize: px(c.bcNumMm), lineHeight: `${px(s.bcNum.h)}px`, whiteSpace: 'nowrap' })}>
          {c.code}
        </div>
      )}
    </>
  );
}

// HTML de impressão de uma Metade (mesmas medidas da prévia); offsetY desloca
// a 2ª metade 20mm pra baixo dentro da folha 40x40 impressa.
function buildProdutoHalfHtml(product: any, extraFields: { label: string; value: string }[], offsetY: number): string {
  const s = PRODUTO_HALF_SPEC;
  const c = produtoHalfContent(product, extraFields);
  const pos = (x: number, y: number, w: number, h: number) => `left:${x.toFixed(2)}mm; top:${(y + offsetY).toFixed(2)}mm; width:${w.toFixed(2)}mm; height:${h.toFixed(2)}mm;`;
  let bcDataUrl = '';
  if (c.code) {
    try { bcDataUrl = generateBarcodeDataUrl(c.code); } catch { /* sem código de barras se falhar */ }
  }
  const info = c.infoRows.map(r =>
    `<div class="ph ph-info" style="${pos(r.x, r.y, r.w, s.info.rowH)} line-height:${s.info.rowH}mm;"><b>${escapeHtml(r.label)}:</b>&nbsp;${escapeHtml(r.value)}</div>`
  ).join('');
  return `
    <div class="ph ph-desc" style="${pos(s.descricao.x, s.descricao.y, s.descricao.w, s.descricao.h)}">${escapeHtml(c.descLines.join('\n'))}</div>
    <div class="ph ph-ref" style="${pos(s.ref.x, s.ref.y, s.ref.w, s.ref.h)} line-height:${s.ref.h}mm;">${escapeHtml(c.refText)}</div>
    ${info}
    ${bcDataUrl ? `<img class="pf-bc" src="${bcDataUrl}" style="${pos(s.barcode.x, s.barcode.y, s.barcode.w, s.barcode.h)}" />` : ''}
    ${c.code ? `<div class="pf pf-bcnum" style="${pos(s.bcNum.x, s.bcNum.y, s.bcNum.w, s.bcNum.h)} line-height:${s.bcNum.h}mm; font-size:${c.bcNumMm.toFixed(2)}mm;">${escapeHtml(c.code)}</div>` : ''}
  `;
}
const PRODUTO_HALF_PRINT_CSS = `
  .ph { position: absolute; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-align: left; font-family: ${NOME_FONT_FAMILY}; font-weight: ${NOME_FONT_WEIGHT}; color: #3c3c3c; }
  .ph b { font-weight: inherit; }
  .ph-desc { color: #141400; font-size: ${PRODUTO_HALF_SPEC.descricaoFontMm.toFixed(3)}mm; line-height: 1.05; white-space: pre-line; }
  .ph-ref { font-size: ${PRODUTO_HALF_SPEC.refFontMm.toFixed(3)}mm; }
  .ph-info { font-size: ${PRODUTO_HALF_SPEC.infoFontMm.toFixed(3)}mm; }
`;

export function ProdutoPreviewHalf({ items, extraFields }: { items: any[]; extraFields: { label: string; value: string }[][] }) {
  const cell = (i: number, offsetYMm: number) => (
    <ProdutoHalfPreviewCell product={items[i]} extraFields={extraFields[i] ?? []} offsetYMm={offsetYMm} />
  );
  return (
    <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-white shadow-inner border border-black/10">
      {cell(0, 0)}
      {cell(1, PRODUTO_HALF_H)}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${PRODUTO_LABEL_SIZE} ${PRODUTO_LABEL_SIZE}`} dangerouslySetInnerHTML={{ __html: CORTE_LINE_SVG_INNER }} />
    </div>
  );
}

// Etiqueta de Produto Código — layout FIXO: 4 códigos de barras por folha
// 40x40mm, sem descrição/REF (medidas do usuário, em mm). O 1º e o último têm
// posição dada; os do meio ficam igualmente espaçados entre eles.
export const PRODUTO_CODIGO_COUNT = 4;
const PRODUTO_CODIGO_SPEC = {
  barcode: { x: 2.18, w: 35.63, h: 5.95, firstY: 1.45, lastY: 30.65 },
  bcNum: { x: 1.79, w: 36.42, h: 2, firstY: 8.2, lastY: 37.4 },
};
export const PRODUTO_CODIGO_STEP_H = (PRODUTO_CODIGO_SPEC.barcode.lastY - PRODUTO_CODIGO_SPEC.barcode.firstY) / (PRODUTO_CODIGO_COUNT - 1);
function codigoPos(index: number) {
  const s = PRODUTO_CODIGO_SPEC;
  const t = index / (PRODUTO_CODIGO_COUNT - 1);
  return {
    barcode: { x: s.barcode.x, y: s.barcode.firstY + (s.barcode.lastY - s.barcode.firstY) * t, w: s.barcode.w, h: s.barcode.h },
    bcNum: { x: s.bcNum.x, y: s.bcNum.firstY + (s.bcNum.lastY - s.bcNum.firstY) * t, w: s.bcNum.w, h: s.bcNum.h },
  };
}
function codigoNumSizeMm(code: string): number {
  return code ? fitFontSize(code, PRODUTO_CODIGO_SPEC.bcNum.w, PRODUTO_CODIGO_SPEC.bcNum.h * 0.9, 700, "'Courier New', monospace") : 0;
}

function ProdutoCodigoPreviewCell({ product, index }: { product: any; index: number }) {
  const p = codigoPos(index);
  const px = (mm: number) => mm * PREVIEW_PX_PER_MM;
  const box = (b: ElPos, extra?: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    left: `${(b.x / PRODUTO_LABEL_SIZE) * 100}%`, top: `${(b.y / PRODUTO_LABEL_SIZE) * 100}%`,
    width: `${(b.w / PRODUTO_LABEL_SIZE) * 100}%`, height: `${(b.h / PRODUTO_LABEL_SIZE) * 100}%`,
    overflow: 'hidden', ...extra,
  });
  const code = product.ean || product.sku || '';
  return (
    <>
      <div style={box(p.barcode, { background: 'repeating-linear-gradient(90deg,#141400 0 2px, transparent 2px 4.4px)' })} />
      {code && (
        <div style={box(p.bcNum, { fontFamily: "'DM Mono', monospace", fontWeight: 700, color: '#3c3c3c', textAlign: 'center', fontSize: px(codigoNumSizeMm(code)), lineHeight: `${px(p.bcNum.h)}px`, whiteSpace: 'nowrap' })}>
          {code}
        </div>
      )}
    </>
  );
}

// HTML de impressão de um dos 4 códigos da folha (mesmas medidas da prévia).
function buildProdutoCodigoHtml(product: any, index: number): string {
  const p = codigoPos(index);
  const code = product.ean || product.sku || '';
  const pos = (b: ElPos) => `left:${b.x.toFixed(2)}mm; top:${b.y.toFixed(2)}mm; width:${b.w.toFixed(2)}mm; height:${b.h.toFixed(2)}mm;`;
  let bcDataUrl = '';
  if (code) {
    try { bcDataUrl = generateBarcodeDataUrl(code); } catch { /* sem código de barras se falhar */ }
  }
  return `
    ${bcDataUrl ? `<img class="pf-bc" src="${bcDataUrl}" style="${pos(p.barcode)}" />` : ''}
    ${code ? `<div class="pf pf-bcnum" style="${pos(p.bcNum)} line-height:${p.bcNum.h}mm; font-size:${codigoNumSizeMm(code).toFixed(2)}mm;">${escapeHtml(code)}</div>` : ''}
  `;
}

export function ProdutoPreviewTriple({ items }: { items: any[] }) {
  // Separadores da prévia no meio do vão entre um código (número incluso) e o próximo.
  const s = PRODUTO_CODIGO_SPEC;
  const gapMid = (s.bcNum.firstY + s.bcNum.h + s.barcode.firstY + PRODUTO_CODIGO_STEP_H) / 2;
  return (
    <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-white shadow-inner border border-black/10">
      {Array.from({ length: PRODUTO_CODIGO_COUNT }, (_, i) => items[i] && <ProdutoCodigoPreviewCell key={i} product={items[i]} index={i} />)}
      {Array.from({ length: PRODUTO_CODIGO_COUNT - 1 }, (_, i) => (
        <div key={i} className="absolute left-0 right-0 border-t border-dashed border-black/30 pointer-events-none" style={{ top: `${(((gapMid + i * PRODUTO_CODIGO_STEP_H) / PRODUTO_LABEL_SIZE) * 100).toFixed(4)}%` }} />
      ))}
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
      <line x1="2" y1="5" x2="14" y2="5" />
      <line x1="2" y1="8" x2="14" y2="8" />
      <line x1="2" y1="11" x2="14" y2="11" />
    </svg>
  );
}

export type LabelTemplate = 'gondola' | 'produto';
// 'triple' (modelo Código) é exclusivo da Etiqueta de Produto — 4 códigos de
// barras por folha 40x40mm (sem descrição/REF). Nome mantido pelas filas salvas.
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
  // Informações adicionais (Fabricante/CNPJ/Composição/Validade) desta
  // etiqueta — só na Etiqueta de Produto, Inteira ou Metade.
  info?: LabelInfoConfig;
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
  // Chamado quando o módulo de Informações adicionais grava algo no cadastro
  // do produto (fabricante vinculado / composição) — pra tela atualizar a
  // lista de produtos em memória.
  onProductUpdated?: (productId: string, patch: ProductCadastroPatch) => void;
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
  info?: LabelInfoConfig;
}

export interface PrintQueueSubmission {
  template: LabelTemplate;
  items: PrintQueueItem[];
}

const emptyDraft = (): Draft => ({ qty: 1, size: 'full' });

export function LabelPrintModal({ isOpen, onClose, products, initialQueue, initialTemplate, onPrinted, requestId, onSaveQueue, onSendQueue, onProductUpdated }: LabelPrintModalProps) {
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

  // Informações adicionais — por produto, exclusivas da Etiqueta de Produto.
  // Fabricante/CNPJ vêm do fabricante vinculado ao produto e Composição do
  // cadastro; por isso precisa da lista de fabricantes e do produto completo
  // (a fila vinda de um pedido remoto só traz id/nome/sku/ean/preço).
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    supabase.from('manufacturers').select('*').order('name').then(({ data }) => {
      if (alive && data) setManufacturers(data as Manufacturer[]);
    });
    return () => { alive = false; };
  }, [isOpen]);
  const manufacturersById = useMemo(() => new Map(manufacturers.map(m => [m.id, m])), [manufacturers]);
  const upsertManufacturer = useCallback((m: Manufacturer) => {
    setManufacturers(prev => {
      const next = prev.some(x => x.id === m.id) ? prev.map(x => (x.id === m.id ? m : x)) : [...prev, m];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
  }, []);

  // Alterações salvas no cadastro pelo módulo de informações (fabricante
  // vinculado / composição) — aplicadas por cima do produto até a lista de
  // produtos da tela ser recarregada.
  const [productPatches, setProductPatches] = useState<Record<string, ProductCadastroPatch>>({});
  const productsById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const cadastroProduct = useCallback((entry: QueueEntry) => ({
    ...entry.product,
    ...(productsById.get(entry.product.id) ?? {}),
    ...(productPatches[entry.product.id] ?? {}),
  }), [productsById, productPatches]);

  // Campos preenchidos que entram na etiqueta deste item (vazio = layout mínimo).
  const labelInfoFor = useCallback((entry: QueueEntry) => {
    if (template !== 'produto' || entry.size === 'triple' || !hasLabelInfo(entry.info)) return [];
    const base = cadastroProduct(entry);
    return resolveLabelInfo(entry.info, base, manufacturersById.get(base.manufacturer_id));
  }, [template, cadastroProduct, manufacturersById]);
  const labelFieldsFor = useCallback((entry: QueueEntry) => labelInfoFor(entry).map(({ label, value }) => ({ label, value })), [labelInfoFor]);

  const queueList = useMemo(() => Object.entries(queue), [queue]);
  const totalLabels = useMemo(() => queueList.reduce((acc, [, e]) => acc + e.qty, 0), [queueList]);

  // Amostras pra prévia — usa o primeiro produto real de cada tamanho na fila,
  // caindo pra um exemplo genérico quando ainda não tem nada adicionado.
  const previewFullEntry = useMemo(() => queueList.find(([, e]) => e.size === 'full')?.[1], [queueList]);
  const previewFull = previewFullEntry ? effectiveLabelProduct(previewFullEntry) : SAMPLE_FULL;
  const previewFullFields = previewFullEntry ? labelFieldsFor(previewFullEntry) : [];
  const previewHalfEntries = useMemo(() => queueList.filter(([, e]) => e.size === 'half').map(([, e]) => e), [queueList]);
  const previewHalfA = previewHalfEntries[0] ? effectiveLabelProduct(previewHalfEntries[0]) : SAMPLE_HALF_A;
  const previewHalfB = previewHalfEntries[1] ? effectiveLabelProduct(previewHalfEntries[1]) : SAMPLE_HALF_B;
  const previewHalfFields = previewHalfEntries.slice(0, 2).map(e => labelFieldsFor(e));
  const previewTripleItems = useMemo(() => queueList.filter(([, e]) => e.size === 'triple').map(([, e]) => effectiveLabelProduct(e)), [queueList]);
  const previewTripleA = previewTripleItems[0] ?? SAMPLE_HALF_A;
  const previewTripleB = previewTripleItems[1] ?? SAMPLE_HALF_B;
  const previewTripleC = previewTripleItems[2] ?? SAMPLE_TRIPLE_C;
  const previewTripleD = previewTripleItems[3] ?? SAMPLE_TRIPLE_D;

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

  // Item com o módulo de Informações adicionais aberto (interruptor "Info").
  const [infoId, setInfoId] = useState<string | null>(null);
  const infoEntry = infoId ? queue[infoId] : null;

  const setEntryInfo = useCallback((id: string, info: LabelInfoConfig | undefined) => {
    setQueue(prev => (prev[id] ? { ...prev, [id]: { ...prev[id], info: hasLabelInfo(info) ? info : undefined } } : prev));
  }, []);

  // Ligar abre o módulo (só fica ligado se salvar); desligar remove as
  // informações só desta etiqueta.
  const toggleEntryInfo = (id: string, entry: QueueEntry) => {
    if (hasLabelInfo(entry.info)) setEntryInfo(id, undefined);
    else setInfoId(id);
  };

  const handleClose = () => {
    setActiveTab('selecao');
    setTemplate('gondola');
    setTemplateMenuOpen(false);
    setSearch('');
    setQueue({});
    setDrafts({});
    setEditingId(null);
    setInfoId(null);
    setProductPatches({});
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
        ...(hasLabelInfo(entry.info) ? { info: entry.info } : {}),
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

    const nomeText = (product.name || '—').toUpperCase();
    const refText = `REF ${productRef(product)}`;
    const priceText = formatPriceValue(product.price ?? 0);
    const dataText = dataImpressaoText();

    // Nome cabe numa linha se der; senão quebra em 2 linhas — na Inteira sobe
    // pra cima, na Metade empurra REF/código de barras/R$/preço pra baixo.
    const nomeFit = fitNomeLayout(nomeText, layout, NOME_FONT_WEIGHT, NOME_FONT_FAMILY);
    const shifted = liftHalfLayout(layout, shiftLayoutDown(layout, nomeFit.extraH), nomeFit.twoLines);
    const nomeBoxStyle = `left:${(layout.nome.x + offsetX).toFixed(2)}mm; top:${nomeFit.yMm.toFixed(2)}mm; width:${layout.nome.w.toFixed(2)}mm; height:${nomeFit.hMm.toFixed(2)}mm;`;
    const nomeDisplayText = nomeFit.twoLines
      ? wrapToLines(nomeText, layout.nome.w, nomeFit.fontSizeMm, NOME_FONT_WEIGHT, NOME_FONT_FAMILY, 2).join('\n')
      : nomeText;
    const nomeWrapStyle = nomeFit.twoLines ? 'white-space: pre-line;' : '';
    const refSize = fitFontSize(refText, shifted.ref.w, shifted.ref.h, 900, "'Courier New', monospace");
    const rsSize = fitFontSize('R$', shifted.rs.w, shifted.rs.h, 800, 'Arial, Helvetica, sans-serif');
    const precoSize = fitFontSize(priceText, shifted.preco.w, shifted.preco.h, 800, 'Arial, Helvetica, sans-serif');
    const bcNumSize = code ? fitFontSize(code, shifted.barcode.w, shifted.barcode.h * 0.3, 700, "'Courier New', monospace") : 0;
    const dataSize = fitFontSize(dataText, shifted.data.w, shifted.data.h, 400, 'Arial, Helvetica, sans-serif');

    return `
      <div class="cell-el nome" style="${nomeBoxStyle} font-size:${nomeFit.fontSizeMm.toFixed(2)}mm; ${nomeWrapStyle}">${escapeHtml(nomeDisplayText)}</div>
      <div class="cell-el ref" style="${boxStyle(shifted.ref)} font-size:${refSize.toFixed(2)}mm;">${escapeHtml(refText)}</div>
      <div class="cell-el barcode" style="${boxStyle(shifted.barcode)}">
        ${bcDataUrl ? `<img class="bc-img" src="${bcDataUrl}" />` : ''}
        ${code ? `<div class="bc-num" style="font-size:${bcNumSize.toFixed(2)}mm;">${escapeHtml(code)}</div>` : ''}
      </div>
      <div class="cell-el rs" style="${boxStyle(shifted.rs)} font-size:${rsSize.toFixed(2)}mm;">R$</div>
      <div class="cell-el preco" style="${boxStyle(shifted.preco)} font-size:${precoSize.toFixed(2)}mm;">${escapeHtml(priceText)}</div>
      <div class="cell-el data" style="${boxStyle(shifted.data)} font-size:${dataSize.toFixed(2)}mm;">${escapeHtml(dataText)}</div>
    `;
  };

  const printElgin = async () => {
    if (template !== 'gondola' || totalLabels === 0) return;
    onPrinted?.();

    // Abre a janela antes de qualquer await (senão o navegador bloqueia o popup)
    // e garante o Arimo carregado antes de medir os textos.
    const win = window.open('', '_blank', 'width=500,height=400');
    if (!win) return;
    await ensureArimoLoaded();

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
    win.document.write(`
      <html><head><title>Etiquetas Elgin L42 Pro</title>
      <style>
        @font-face { font-family: 'Arimo'; font-weight: 400 700; src: url('${window.location.origin}${ARIMO_FONT_URL}') format('truetype'); }
        @page { size: ${ELGIN_LABEL_W}mm ${ELGIN_LABEL_H}mm; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; }
        .elgin-label {
          position: relative; width: ${ELGIN_LABEL_W}mm; height: ${ELGIN_LABEL_H}mm;
          page-break-after: always; overflow: hidden;
        }
        .elgin-label:last-child { page-break-after: auto; }
        .cell-el { position: absolute; color: #141400; font-weight: 700; line-height: 1.05; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .cell-el.nome { font-family: ${NOME_FONT_FAMILY}; font-weight: ${NOME_FONT_WEIGHT}; text-align: left; }
        .cell-el.data { font-weight: 400; color: #3c3c3c; display: flex; align-items: center; justify-content: center; }
        .cell-el.ref { font-family: 'Courier New', monospace; font-weight: 900; color: #3c3c3c; }
        .cell-el.rs { display: flex; align-items: flex-start; justify-content: flex-end; }
        .cell-el.preco { font-weight: 800; line-height: 0.85; overflow: visible; display: flex; align-items: center; justify-content: flex-end; }
        .cell-el.barcode { display: flex; flex-direction: column; white-space: normal; }
        .bc-img { flex: 1 1 auto; width: 100%; min-height: 0; object-fit: fill; }
        .bc-num { font-family: 'Courier New', monospace; font-weight: 700; color: #3c3c3c; text-align: center; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      </style></head>
      <body>${labelsHtml}</body></html>
    `);
    win.document.close();
    win.focus();
    const doPrint = () => { win.print(); };
    (win.document.fonts?.load(`${NOME_FONT_WEIGHT} 16px Arimo`) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => setTimeout(doPrint, 300));
  };

  const printProduto = async () => {
    if (template !== 'produto' || totalLabels === 0) return;
    onPrinted?.();

    // Abre a janela antes de qualquer await (senão o navegador bloqueia o
    // popup) e garante o Arimo carregado antes de medir os textos da
    // descrição (agora na mesma fonte da Gôndola).
    const win = window.open('', '_blank', 'width=400,height=400');
    if (!win) return;
    await ensureArimoLoaded();

    // Cada unidade leva as informações adicionais do seu próprio produto.
    type Unit = { product: any; fields: { label: string; value: string }[] };
    const fullUnits: Unit[] = [];
    const halfUnits: Unit[] = [];
    const tripleUnits: any[] = [];
    queueList.forEach(([, entry]) => {
      const product = effectiveLabelProduct(entry);
      const fields = labelFieldsFor(entry);
      for (let i = 0; i < entry.qty; i++) {
        if (entry.size === 'triple') tripleUnits.push(product);
        else (entry.size === 'half' ? halfUnits : fullUnits).push({ product, fields });
      }
    });

    const pages: string[] = fullUnits.map(u =>
      `<div class="produto-label">${buildProdutoFullHtml(u.product, u.fields)}</div>`
    );
    const cellHtml = (u: Unit, offsetY: number) => buildProdutoHalfHtml(u.product, u.fields, offsetY);
    for (let i = 0; i < halfUnits.length; i += 2) {
      const top = halfUnits[i];
      const bottom = halfUnits[i + 1];
      pages.push(
        `<div class="produto-label">${cellHtml(top, 0)}${bottom ? cellHtml(bottom, PRODUTO_HALF_H) : ''}<svg class="corte" viewBox="0 0 ${PRODUTO_LABEL_SIZE} ${PRODUTO_LABEL_SIZE}">${CORTE_LINE_SVG_INNER}</svg></div>`
      );
    }
    for (let i = 0; i < tripleUnits.length; i += PRODUTO_CODIGO_COUNT) {
      const sheet = tripleUnits.slice(i, i + PRODUTO_CODIGO_COUNT);
      pages.push(`<div class="produto-label">${sheet.map((product, k) => buildProdutoCodigoHtml(product, k)).join('')}</div>`);
    }

    const labelsHtml = pages.join('');
    win.document.write(`
      <html><head><title>Etiquetas de Produto</title>
      <style>
        @font-face { font-family: 'Arimo'; font-weight: 400 700; src: url('${window.location.origin}${ARIMO_FONT_URL}') format('truetype'); }
        @page { size: ${PRODUTO_LABEL_SIZE}mm ${PRODUTO_LABEL_SIZE}mm; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; }
        .produto-label {
          position: relative; width: ${PRODUTO_LABEL_SIZE}mm; height: ${PRODUTO_LABEL_SIZE}mm;
          page-break-after: always; overflow: hidden; background: #fff;
        }
        .produto-label:last-child { page-break-after: auto; }
        .cell-el { position: absolute; color: #141400; font-weight: 700; line-height: 1.05; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        ${PRODUTO_FULL_PRINT_CSS}
        ${PRODUTO_HALF_PRINT_CSS}
        .corte { position: absolute; left: 0; top: 0; width: ${PRODUTO_LABEL_SIZE}mm; height: ${PRODUTO_LABEL_SIZE}mm; pointer-events: none; }
        .cell-el.barcode { display: flex; flex-direction: column; white-space: normal; }
        .bc-img { flex: 1 1 auto; width: 100%; min-height: 0; object-fit: fill; }
        .bc-num { font-family: 'Courier New', monospace; font-weight: 700; color: #3c3c3c; text-align: center; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      </style></head>
      <body>${labelsHtml}</body></html>
    `);
    win.document.close();
    win.focus();
    const doPrint = () => { win.print(); };
    (win.document.fonts?.load(`${NOME_FONT_WEIGHT} 16px Arimo`) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => setTimeout(doPrint, 300));
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
            className={modalBackdropCls}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className={cn(modalCls, 'max-w-[640px]')}
          >
            {/* Barra de título */}
            <div className={barCls}>
              <div className={barChipCls}>
                <Tag size={15} strokeWidth={2.3} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className={barTitleCls}>Etiquetas</h4>
                <p className={barSubtitleCls}>Elgin L42 Pro Full — impressão térmica</p>
              </div>
              <button onClick={handleClose} title="Fechar" className={closeBtnCls}>
                <X size={15} strokeWidth={2.6} />
              </button>
            </div>

            {/* Abas penduradas */}
            <div className={squareTabsBarCls}>
              <button type="button" onClick={() => setActiveTab('selecao')} className={squareTabCls(activeTab === 'selecao', true)}>
                <span className={cn('transition-opacity', activeTab === 'selecao' ? 'opacity-100' : 'opacity-55 hover:opacity-85')}>Seleção</span>
              </button>
              <button type="button" onClick={() => setActiveTab('visualizacao')} className={squareTabCls(activeTab === 'visualizacao', false)}>
                <span className={cn('transition-opacity', activeTab === 'visualizacao' ? 'opacity-100' : 'opacity-55 hover:opacity-85')}>Visualização</span>
                {totalLabels > 0 && (
                  <span className="text-[9px] font-black px-1.5 py-px rounded-full bg-[#D81E1E] text-white">{totalLabels}</span>
                )}
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-[420px] max-h-[62vh] overflow-y-auto px-3.5 py-3 flex flex-col gap-2.5">
              {activeTab === 'selecao' && (
                <>
                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <Search size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                      <span className={sectionTitleCls}>Adicionar à fila</span>
                    </div>
                    <div className="p-2.5 flex flex-col gap-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.6fr] gap-2.5">
                        {/* Modelo de etiqueta — dropdown mostrando só o nome */}
                        <div className="min-w-0">
                          <span className={labelCls}>Modelo de etiqueta</span>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setTemplateMenuOpen(v => !v)}
                              className={cn(inputCls, 'flex items-center justify-between text-left', templateMenuOpen && '!border-[#D81E1E]')}
                            >
                              <span className="truncate">{TEMPLATE_LABELS[template]}</span>
                              <ChevronDown size={14} className={cn('shrink-0 text-on-surface/45 transition-transform duration-150', templateMenuOpen && 'rotate-180')} />
                            </button>
                            <AnimatePresence>
                              {templateMenuOpen && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.97, y: -4 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.97, y: -4 }}
                                  transition={{ duration: 0.13 }}
                                  className="absolute z-10 mt-1 w-full origin-top border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#2E2E28] shadow-[0_16px_36px_-10px_rgba(0,0,0,0.3)]"
                                >
                                  <button
                                    type="button"
                                    onClick={() => { setTemplate('gondola'); setTemplateMenuOpen(false); }}
                                    className={cn('w-full text-left px-2.5 py-2 text-[12.5px] font-bold text-on-surface hover:bg-[#FFF8D0] dark:hover:bg-[#FFE500]/[0.08] transition-colors', template === 'gondola' && 'shadow-[inset_3px_0_0_#D81E1E]')}
                                  >
                                    {TEMPLATE_LABELS.gondola}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setTemplate('produto'); setTemplateMenuOpen(false); }}
                                    className={cn('w-full text-left px-2.5 py-2 text-[12.5px] font-bold text-on-surface hover:bg-[#FFF8D0] dark:hover:bg-[#FFE500]/[0.08] transition-colors flex items-center justify-between gap-2 border-t border-[#E0D8BF] dark:border-white/[0.08]', template === 'produto' && 'shadow-[inset_3px_0_0_#D81E1E]')}
                                  >
                                    {TEMPLATE_LABELS.produto}
                                    <span className="text-[8.5px] font-black uppercase tracking-[0.06em] px-1.5 py-0.5 bg-[#D81E1E]/10 text-[#D81E1E]">Adesiva 40×40mm</span>
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>

                        {/* Busca */}
                        <div className="min-w-0">
                          <span className={labelCls}>Buscar produto</span>
                          <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface/40 pointer-events-none" />
                            <input
                              type="text"
                              value={search}
                              onChange={e => setSearch(e.target.value)}
                              placeholder="Buscar por nome, SKU ou EAN…"
                              className={cn(inputCls, 'pl-8')}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Resultados */}
                      {search.trim() === '' ? (
                        <p className="text-center text-[11.5px] font-semibold text-on-surface/40 py-2">
                          Busque um produto pra adicionar à fila de impressão.
                        </p>
                      ) : (
                        <div className="flex flex-col">
                          {searchResults.map((product, idx) => {
                            const draft = getDraft(product.id);
                            return (
                              <div key={product.id} className={cn('flex items-center gap-2.5 px-2.5 py-2', rowCls(idx === 0))}>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12.5px] font-extrabold text-on-surface truncate">{product.name}</p>
                                  <p className="text-[10.5px] font-mono text-on-surface/40 mt-px truncate">
                                    {product.ean && `EAN ${product.ean}`}
                                    {product.ean && product.sku && ' · '}
                                    {product.sku && `SKU ${product.sku}`}
                                    {!product.ean && !product.sku && 'Sem código'}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <div className={segCls}>
                                    <button type="button" onClick={() => setDraftSize(product.id, 'full')} className={segBtnCls(draft.size === 'full')}>
                                      {template === 'produto' && <IconWholeSquare size={12} />}
                                      Inteira
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDraftSize(product.id, 'half')}
                                      title={template === 'produto' ? 'Meia etiqueta — corte horizontal (40×20mm)' : undefined}
                                      className={segBtnCls(draft.size === 'half')}
                                    >
                                      {template === 'produto' && <IconHalfHorizontal size={12} />}
                                      Metade
                                    </button>
                                    {template === 'produto' && (
                                      <button
                                        type="button"
                                        onClick={() => setDraftSize(product.id, 'triple')}
                                        title="4 códigos de barras — só o código de barras, 4 por etiqueta"
                                        className={segBtnCls(draft.size === 'triple')}
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
                                    className={cn(inputCls, noSpinCls, 'w-11 h-[30px] px-1 text-center font-extrabold')}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => confirmAdd(product)}
                                    className="w-[30px] h-[30px] bg-[#D81E1E] hover:bg-[#B91818] text-white flex items-center justify-center flex-shrink-0 active:scale-[0.94] transition-all duration-[130ms]"
                                    title="Adicionar à fila"
                                  >
                                    <Plus size={15} strokeWidth={2.8} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {searchResults.length === 0 && (
                            <p className="text-center text-[11.5px] font-semibold text-on-surface/35 py-4">
                              Nenhum produto encontrado.
                            </p>
                          )}

                          {queueList.length > 0 && (
                            <p className="text-center text-[10.5px] font-semibold text-on-surface/35 pt-2">
                              Produtos já adicionados à fila somem daqui — veja e ajuste em &quot;Visualização&quot;
                            </p>
                          )}
                        </div>
                      )}

                      {template === 'produto' && (
                        <div className="flex flex-col gap-0.5">
                          <p className="text-[10px] font-semibold text-on-surface/40 flex items-center gap-1.5">
                            <IconHalfHorizontal size={11} />
                            Metade corta a etiqueta ao meio na horizontal (duas de 40×20mm)
                          </p>
                          <p className="text-[10px] font-semibold text-on-surface/40 flex items-center gap-1.5">
                            <IconTriple size={11} />
                            Código imprime 4 códigos de barras por etiqueta, sem descrição
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Resumo da fila */}
                  {queueList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('visualizacao')}
                      className={cn('w-full flex items-center justify-between px-2.5 py-2.5 transition-colors hover:bg-[#FFE500]/25 dark:hover:bg-[#FFE500]/[0.10]', highlightBoxCls)}
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
                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <Eye size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                      <span className={sectionTitleCls}>Prévia</span>
                      <span className={sectionCountCls}>{TEMPLATE_LABELS[template]}</span>
                    </div>
                    <div className="p-2.5">
                      {template === 'gondola' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <span className={labelCls}>Inteira</span>
                            <LabelPreview variant="full" items={[previewFull]} />
                            <p className="text-center font-mono text-[10px] font-medium text-on-surface/40 mt-1.5">{ELGIN_LABEL_W} × {ELGIN_LABEL_H}mm</p>
                          </div>
                          <div>
                            <span className={labelCls}>Metade</span>
                            <LabelPreview variant="half" items={[previewHalfA, previewHalfB]} />
                            <p className="text-center font-mono text-[10px] font-medium text-on-surface/40 mt-1.5">2 × {(ELGIN_LABEL_W / 2).toFixed(1)} × {ELGIN_LABEL_H}mm</p>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <span className={labelCls}>Inteira</span>
                            <ProdutoPreviewFull product={previewFull} extraFields={previewFullFields} />
                            <p className="text-center font-mono text-[10px] font-medium text-on-surface/40 mt-1.5">{PRODUTO_LABEL_SIZE} × {PRODUTO_LABEL_SIZE}mm</p>
                          </div>
                          <div>
                            <span className={labelCls}>Metade</span>
                            <ProdutoPreviewHalf items={[previewHalfA, previewHalfB]} extraFields={previewHalfFields} />
                            <p className="text-center font-mono text-[10px] font-medium text-on-surface/40 mt-1.5">2 × {PRODUTO_LABEL_SIZE} × {PRODUTO_HALF_H}mm</p>
                          </div>
                          <div>
                            <span className={labelCls}>Código</span>
                            <ProdutoPreviewTriple items={[previewTripleA, previewTripleB, previewTripleC, previewTripleD]} />
                            <p className="text-center font-mono text-[10px] font-medium text-on-surface/40 mt-1.5">{PRODUTO_CODIGO_COUNT} códigos · {PRODUTO_LABEL_SIZE} × {PRODUTO_LABEL_SIZE}mm</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={sectionCls}>
                    <div className={sectionHeadCls}>
                      <List size={12} strokeWidth={2.4} className="text-[#D81E1E] shrink-0" />
                      <span className={sectionTitleCls}>Produtos selecionados para impressão</span>
                      {queueList.length > 0 && (
                        <span className={sectionCountCls}>{queueList.length} · {totalLabels} etiqueta{totalLabels !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                    <div className="p-2.5">
                    {queueList.length === 0 ? (
                      <div className="flex flex-col items-center gap-1.5 text-center py-[18px] px-4 border border-dashed border-[#E0D8BF] dark:border-white/[0.12] text-[11.5px] font-bold text-on-surface/45">
                        Nenhum produto na fila ainda — adicione pela aba Seleção.
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        {queueList.map(([id, entry], idx) => {
                          const edited = !!entry.overrides;
                          const effective = effectiveLabelProduct(entry);
                          const infoAvailable = template === 'produto' && entry.size !== 'triple';
                          const infoOn = infoAvailable && hasLabelInfo(entry.info);
                          const infoRows = infoOn ? labelInfoFor(entry) : [];
                          const infoMissing = infoOn ? LABEL_INFO_FIELDS.filter(f => entry.info?.[f.key] && !infoRows.some(r => r.key === f.key)) : [];
                          return (
                            <div key={id} className={cn(rowCls(idx === 0), (edited || infoOn) && highlightCls)}>
                            <div className="flex items-center gap-2 px-2.5 py-2">
                              <span className="flex-1 min-w-0 flex items-center gap-1.5">
                                <span className="min-w-0 text-[12.5px] font-extrabold text-on-surface truncate">{effective.name}</span>
                                {edited && (
                                  <span className="shrink-0 text-[8px] font-black uppercase tracking-[0.06em] px-1.5 py-0.5 bg-[#D4C000]/25 dark:bg-[#FFE500]/20 text-[#7A6A00] dark:text-[#FFE500]">Editado</span>
                                )}
                              </span>
                              <div className={segCls}>
                                <button type="button" onClick={() => updateQueueSize(id, 'full')} className={segBtnCls(entry.size === 'full')}>
                                  Inteira
                                </button>
                                <button type="button" onClick={() => updateQueueSize(id, 'half')} className={segBtnCls(entry.size === 'half')}>
                                  Metade
                                </button>
                                {template === 'produto' && (
                                  <button type="button" onClick={() => updateQueueSize(id, 'triple')} className={segBtnCls(entry.size === 'triple')}>
                                    Código
                                  </button>
                                )}
                              </div>

                              <div className="flex items-stretch h-[26px] flex-shrink-0 border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]">
                                <button
                                  type="button"
                                  onClick={() => updateQueueQty(id, Math.max(1, entry.qty - 1))}
                                  className="w-6 flex items-center justify-center text-on-surface/55 hover:text-on-surface hover:bg-on-surface/[0.05] transition-colors"
                                >
                                  <Minus size={11} strokeWidth={2.6} />
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
                                  className={cn('w-8 text-center text-[11.5px] font-extrabold text-on-surface bg-transparent outline-none caret-[#D81E1E] border-x border-[#E0D8BF] dark:border-white/[0.10]', noSpinCls)}
                                />
                                <button
                                  type="button"
                                  onClick={() => updateQueueQty(id, entry.qty + 1)}
                                  className="w-6 flex items-center justify-center text-on-surface/55 hover:text-on-surface hover:bg-on-surface/[0.05] transition-colors"
                                >
                                  <Plus size={11} strokeWidth={2.6} />
                                </button>
                              </div>
                              {template === 'produto' && (
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={infoOn}
                                  disabled={!infoAvailable}
                                  onClick={() => toggleEntryInfo(id, entry)}
                                  title={infoAvailable ? 'Informações adicionais desta etiqueta' : 'O modelo Código não tem informações adicionais'}
                                  className={cn(
                                    'h-[26px] flex items-center gap-1.5 pl-2 pr-1 border flex-shrink-0 transition-colors disabled:opacity-35 disabled:cursor-not-allowed',
                                    infoOn ? 'border-[#D4C000] dark:border-[#FFE500]/30 bg-[#FFE500]/[0.14] dark:bg-[#FFE500]/[0.06]' : 'border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18]'
                                  )}
                                >
                                  <span className={cn('text-[9px] font-black uppercase tracking-[0.06em]', infoOn ? 'text-on-surface' : 'text-on-surface/55')}>Info</span>
                                  <span className={cn('relative w-[26px] h-3.5 transition-colors duration-150', infoOn ? 'bg-[#D81E1E]' : 'bg-black/[0.18] dark:bg-white/[0.16]')}>
                                    <span className={cn('absolute top-0.5 left-0.5 w-2.5 h-2.5 bg-white shadow-sm transition-transform duration-[180ms] ease-[cubic-bezier(0.23,1,0.32,1)]', infoOn && 'translate-x-3')} />
                                  </span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setEditingId(id)}
                                title={edited ? 'Editar etiqueta (personalizada)' : 'Editar etiqueta'}
                                className={cn('relative', iconBtnCls, edited && 'text-on-surface')}
                              >
                                <Pencil size={13} />
                                {edited && <span className="absolute -top-[3px] -right-[3px] w-[7px] h-[7px] rounded-full bg-[#D81E1E]" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeFromQueue(id)}
                                title="Remover da fila"
                                className={deleteBtnCls}
                              >
                                <X size={12} strokeWidth={2.6} />
                              </button>
                            </div>
                            {infoOn && (
                              <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-2 -mt-0.5">
                                {infoRows.map(r => {
                                  const short = LABEL_INFO_FIELDS.find(f => f.key === r.key)?.short ?? r.label;
                                  return (
                                    <span key={r.key} className={cn(
                                      'max-w-full flex items-center gap-1.5 px-2 py-1 border bg-white dark:bg-[#1E1E18] text-[10.5px] font-bold text-on-surface',
                                      r.manual ? 'border-dashed border-black/25 dark:border-white/20' : 'border-[#E0D8BF] dark:border-white/[0.10]'
                                    )}>
                                      <em className="not-italic text-[8.5px] font-black uppercase tracking-[0.06em] text-on-surface/45">{short}</em>
                                      <span className={cn('truncate max-w-[170px]', r.key === 'cnpj' && 'font-mono text-[10px]')}>{r.value}</span>
                                    </span>
                                  );
                                })}
                                {infoMissing.map(f => (
                                  <span key={f.key} className="flex items-center gap-1.5 px-2 py-1 border border-[rgba(216,30,30,0.55)] bg-[rgba(200,26,26,0.05)] dark:bg-[rgba(216,30,30,0.08)] text-[10.5px] font-bold text-[#B91818] dark:text-red-400">
                                    <em className="not-italic text-[8.5px] font-black uppercase tracking-[0.06em]">{f.short}</em>
                                    sem dado
                                  </span>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => setInfoId(id)}
                                  className="ml-auto text-[10.5px] font-extrabold text-on-surface underline underline-offset-2 hover:text-[#D81E1E] transition-colors"
                                >
                                  Editar
                                </button>
                              </div>
                            )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Rodapé */}
            <div className={footerCls}>
              <button type="button" onClick={handleClose} className={cn(btnCls, 'ml-auto')}>
                Cancelar
              </button>
              {requestId && onSaveQueue && (
                <button
                  type="button"
                  onClick={handleSaveQueue}
                  disabled={totalLabels === 0 || savingQueue}
                  className={btnCls}
                >
                  <Save size={14} strokeWidth={2.6} />
                  {savingQueue ? 'Salvando…' : 'Salvar'}
                </button>
              )}
              {!requestId && onSendQueue && (
                <button
                  type="button"
                  onClick={handleSendQueue}
                  disabled={totalLabels === 0 || sendingQueue}
                  className={btnCls}
                >
                  <Send size={14} strokeWidth={2.6} />
                  {sendingQueue ? 'Enviando…' : 'Enviar'}
                </button>
              )}
              <button
                type="button"
                onClick={() => (template === 'gondola' ? printElgin() : printProduto())}
                disabled={totalLabels === 0}
                className={btnPrimaryCls}
              >
                <Printer size={14} strokeWidth={2.6} />
                {`Imprimir ${totalLabels} etiqueta${totalLabels !== 1 ? 's' : ''}`}
              </button>
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

          <LabelInfoModal
            isOpen={!!infoEntry}
            product={infoEntry ? cadastroProduct(infoEntry) : null}
            subtitle={infoEntry ? `${effectiveLabelProduct(infoEntry).name} · ${infoEntry.size === 'half' ? 'Metade' : 'Inteira'} ×${infoEntry.qty}` : undefined}
            config={infoEntry?.info}
            manufacturers={manufacturers}
            onManufacturerSaved={upsertManufacturer}
            onProductUpdated={(productId, patch) => {
              setProductPatches(prev => ({ ...prev, [productId]: { ...prev[productId], ...patch } }));
              onProductUpdated?.(productId, patch);
            }}
            onSave={info => { if (infoId) setEntryInfo(infoId, info); }}
            onClose={() => setInfoId(null)}
          />
        </div>
      )}
    </AnimatePresence>
  );
}
