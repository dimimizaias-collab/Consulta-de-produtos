import JsBarcode from 'jsbarcode';

export type CodeField = 'ean' | 'sku';

export function generateBarcodeDataUrl(code: string): string {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, code, { format: 'CODE128', displayValue: false, width: 1.5, height: 50, margin: 0 });
  return canvas.toDataURL('image/png');
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function defaultCodeField(p: any): CodeField {
  return p?.ean ? 'ean' : 'sku';
}
