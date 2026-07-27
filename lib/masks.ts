// Máscaras de documento compartilhadas entre os módulos de RH e Fornecedores/Favorecidos.

export type DocumentoTipo = 'CNPJ' | 'CPF';

// Máscara de CPF: XXX.XXX.XXX-XX (limitada a 11 dígitos).
export function maskCpf(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 11);
  const [p1, p2, p3, p4] = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9), digits.slice(9, 11)];
  let out = p1;
  if (p2) out += `.${p2}`;
  if (p3) out += `.${p3}`;
  if (p4) out += `-${p4}`;
  return out;
}

// Máscara de CNPJ: XX.XXX.XXX/XXXX-XX (limitada a 14 dígitos).
export function maskCnpj(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 14);
  const [p1, p2, p3, p4, p5] = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 8), digits.slice(8, 12), digits.slice(12, 14)];
  let out = p1;
  if (p2) out += `.${p2}`;
  if (p3) out += `.${p3}`;
  if (p4) out += `/${p4}`;
  if (p5) out += `-${p5}`;
  return out;
}

// Aplica a máscara certa de acordo com o tipo de documento.
export function maskDocumento(v: string, tipo: DocumentoTipo): string {
  return tipo === 'CPF' ? maskCpf(v) : maskCnpj(v);
}
