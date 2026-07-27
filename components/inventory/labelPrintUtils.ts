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

// Formata CNPJ conforme o usuário digita: 00.000.000/0000-00
export function formatCNPJ(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  let out = digits;
  if (digits.length > 2) out = digits.replace(/^(\d{2})(\d)/, '$1.$2');
  if (digits.length > 5) out = out.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
  if (digits.length > 8) out = out.replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4');
  if (digits.length > 12) out = out.replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
  return out;
}
