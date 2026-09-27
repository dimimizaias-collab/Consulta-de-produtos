'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Plus, Save, Search, Lock, Factory, FlaskConical, AlignLeft, AlertCircle, Info, Loader2, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { formatCNPJ } from './labelPrintUtils';
import { AddManufacturerModal, type Manufacturer } from '@/components/manufacturers/AddManufacturerModal';

// Informações adicionais da Etiqueta de Produto — configuradas por produto
// na Visualização. Fabricante/CNPJ vêm do fabricante vinculado ao produto,
// Composição do cadastro do produto e Validade é sempre digitada na hora.
export type LabelInfoKey = 'fabricante' | 'cnpj' | 'composicao' | 'validade';
export type LabelInfoSource = 'cadastro' | 'manual';
export interface LabelInfoFieldConfig { source: LabelInfoSource; manual: string }
// Chave presente = campo marcado pra entrar na etiqueta.
export type LabelInfoConfig = Partial<Record<LabelInfoKey, LabelInfoFieldConfig>>;

export const LABEL_INFO_FIELDS: { key: LabelInfoKey; label: string; short: string }[] = [
  { key: 'fabricante', label: 'Fabricante', short: 'Fab.' },
  { key: 'cnpj', label: 'CNPJ', short: 'CNPJ' },
  { key: 'composicao', label: 'Composição', short: 'Comp.' },
  { key: 'validade', label: 'Validade', short: 'Val.' },
];

const MISSING_TEXT: Record<LabelInfoKey, string> = {
  fabricante: 'Sem fabricante no cadastro',
  cnpj: 'Sem CNPJ no cadastro',
  composicao: 'Sem composição no cadastro',
  validade: '',
};

export function hasLabelInfo(config: LabelInfoConfig | undefined): boolean {
  return !!config && Object.keys(config).length > 0;
}

export function cadastroInfoValue(key: LabelInfoKey, product: any, manufacturer: Manufacturer | null | undefined): string {
  switch (key) {
    case 'fabricante': return manufacturer?.name?.trim() || '';
    case 'cnpj': return manufacturer?.cnpj ? formatCNPJ(manufacturer.cnpj) : '';
    case 'composicao': return (product?.composicao ?? '').trim();
    default: return '';
  }
}

function fieldValue(key: LabelInfoKey, cfg: LabelInfoFieldConfig, product: any, manufacturer: Manufacturer | null | undefined): string {
  return cfg.source === 'manual' ? cfg.manual.trim() : cadastroInfoValue(key, product, manufacturer);
}

// Campos marcados e preenchidos, na ordem fixa — o que vai impresso.
export function resolveLabelInfo(config: LabelInfoConfig | undefined, product: any, manufacturer: Manufacturer | null | undefined): { key: LabelInfoKey; label: string; value: string; manual: boolean }[] {
  if (!config) return [];
  return LABEL_INFO_FIELDS.flatMap(f => {
    const cfg = config[f.key];
    if (!cfg) return [];
    const value = fieldValue(f.key, cfg, product, manufacturer);
    return value ? [{ key: f.key, label: f.label, value, manual: cfg.source === 'manual' }] : [];
  });
}

function validadeFromNow(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
const VALIDADE_QUICK: { label: string; value: () => string }[] = [
  { label: '+6m', value: () => validadeFromNow(6) },
  { label: '+1a', value: () => validadeFromNow(12) },
  { label: '+2a', value: () => validadeFromNow(24) },
  { label: 'Indet.', value: () => 'Indeterminada' },
];

const fieldBase = 'flex-1 min-w-0 min-h-9 rounded-[10px] border-[1.5px] px-[11px] py-[7px] text-[12.5px] font-semibold flex items-center gap-2';
const segBtn = (on: boolean, disabled?: boolean) => cn(
  'px-2 py-[5px] rounded-[7px] text-[9px] font-black uppercase tracking-wide transition-colors',
  on ? 'bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]' : 'text-secondary/50 hover:text-on-surface',
  disabled && 'opacity-40 cursor-not-allowed hover:text-secondary/50'
);

interface LabelInfoModalProps {
  isOpen: boolean;
  product: any;          // produto do cadastro (com manufacturer_id e composicao)
  subtitle?: string;
  config?: LabelInfoConfig;
  manufacturers: Manufacturer[];
  onManufacturerSaved: (m: Manufacturer) => void;
  onProductUpdated: (productId: string, patch: { manufacturer_id?: string | null; composicao?: string | null }) => void;
  onSave: (config: LabelInfoConfig) => void;
  onClose: () => void;
}

export function LabelInfoModal({ isOpen, product, subtitle, config, manufacturers, onManufacturerSaved, onProductUpdated, onSave, onClose }: LabelInfoModalProps) {
  const [draft, setDraft] = useState<LabelInfoConfig>({});
  const [savedKeys, setSavedKeys] = useState<Set<LabelInfoKey>>(new Set());
  const [picker, setPicker] = useState<null | 'fabricante' | 'composicao'>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(config ?? {});
    setSavedKeys(new Set());
    setPicker(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const manufacturer = useMemo(
    () => manufacturers.find(m => m.id === product?.manufacturer_id) ?? null,
    [manufacturers, product?.manufacturer_id]
  );

  const toggleField = (key: LabelInfoKey) => {
    setDraft(prev => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = { source: key === 'validade' ? 'manual' : 'cadastro', manual: '' };
      return next;
    });
  };

  const setSource = (key: LabelInfoKey, source: LabelInfoSource) => {
    setDraft(prev => {
      const cur = prev[key];
      if (!cur) return prev;
      // Ao trocar pra Manual, parte do valor do cadastro (se houver) pra
      // facilitar um ajuste pequeno.
      const manual = source === 'manual' && !cur.manual ? cadastroInfoValue(key, product, manufacturer) : cur.manual;
      return { ...prev, [key]: { source, manual } };
    });
  };

  const setManual = (key: LabelInfoKey, value: string) => {
    setDraft(prev => (prev[key] ? { ...prev, [key]: { ...prev[key]!, manual: key === 'cnpj' ? formatCNPJ(value) : value } } : prev));
  };

  const markSaved = (keys: LabelInfoKey[]) => setSavedKeys(prev => new Set([...prev, ...keys]));

  const selectedKeys = LABEL_INFO_FIELDS.filter(f => draft[f.key]).map(f => f.key);
  const incomplete = selectedKeys.some(k => !fieldValue(k, draft[k]!, product, manufacturer));

  const handleSave = () => {
    if (incomplete) return;
    onSave(draft);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && product && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="relative bg-[#F0E7CC] dark:bg-[#1E1E18] rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-black/10 dark:border-white/[0.08] flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="px-5 py-4 flex items-center gap-3 bg-[#FFE500] dark:bg-[#252520] border-b border-[#D4C000] dark:border-white/[0.07] flex-shrink-0">
              <div className="w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
                <AlignLeft size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-manrope font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight">Informações adicionais</h2>
                <p className="text-[11.5px] font-bold text-[#1A1A0E]/55 dark:text-[#F2F0E3]/35 mt-0.5 truncate">{subtitle ?? product.name}</p>
              </div>
              <button
                onClick={onClose}
                className="w-[34px] h-[34px] rounded-[11px] flex items-center justify-center shrink-0 bg-black/[0.08] dark:bg-white/[0.06] border border-black/10 dark:border-white/[0.08] text-black/50 dark:text-white/40 hover:bg-black/[0.14] dark:hover:bg-white/[0.10] transition-[background-color,transform] active:scale-[0.93]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 flex flex-col gap-2.5 overflow-y-auto">
              {manufacturer ? (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/[0.06] dark:bg-white/[0.07] text-[10.5px] font-semibold text-secondary/70">
                  <Factory size={13} className="shrink-0" />
                  Fabricante vinculado: <b className="text-on-surface truncate">{manufacturer.name}</b>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[rgba(200,26,26,0.05)] dark:bg-[rgba(216,30,30,0.08)] text-[10.5px] font-bold text-[#B91818] dark:text-red-400">
                  <AlertCircle size={13} className="shrink-0" />
                  Produto sem fabricante vinculado
                </div>
              )}

              {LABEL_INFO_FIELDS.map(field => {
                const cfg = draft[field.key];
                const selected = !!cfg;
                const isValidade = field.key === 'validade';
                const cadastro = cadastroInfoValue(field.key, product, manufacturer);
                const missing = selected && cfg!.source === 'cadastro' && !cadastro;
                return (
                  <div
                    key={field.key}
                    className={cn(
                      'rounded-2xl border-[1.5px] transition-[border-color,background-color] duration-[130ms] overflow-hidden',
                      missing
                        ? 'border-[rgba(216,30,30,0.55)] bg-[#FFE500]/[0.14] dark:bg-[#FFE500]/[0.06]'
                        : selected
                          ? 'border-[#D4C000] dark:border-[#FFE500]/30 bg-[#FFE500]/[0.14] dark:bg-[#FFE500]/[0.06]'
                          : 'border-black/10 dark:border-white/[0.08] bg-white dark:bg-[#252520]'
                    )}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleField(field.key)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleField(field.key); } }}
                      className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer select-none"
                    >
                      <div className={cn(
                        'w-[18px] h-[18px] rounded-md flex items-center justify-center flex-shrink-0 transition-colors',
                        selected ? 'bg-[#1A1A0E] dark:bg-[#FFE500]' : 'border-2 border-black/20 dark:border-white/20'
                      )}>
                        {selected && <Check size={11} strokeWidth={3.5} className="text-[#FFE500] dark:text-[#1A1A0E]" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-extrabold text-on-surface">{field.label}</p>
                        {!selected && (
                          <p className="text-[10.5px] font-semibold text-secondary/50 mt-px truncate">
                            {isValidade ? 'Informada na hora da impressão' : (cadastro || 'Não cadastrado')}
                          </p>
                        )}
                        {selected && isValidade && (
                          <p className="text-[10.5px] font-semibold text-secondary/50 mt-px">Informada na hora da impressão</p>
                        )}
                      </div>
                      {selected && (
                        <div className="flex bg-black/[0.06] dark:bg-white/[0.07] rounded-[9px] p-0.5 gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <button type="button" disabled={isValidade} onClick={() => setSource(field.key, 'cadastro')} className={segBtn(cfg!.source === 'cadastro', isValidade)}>Cadastro</button>
                          <button type="button" onClick={() => setSource(field.key, 'manual')} className={segBtn(cfg!.source === 'manual')}>Manual</button>
                        </div>
                      )}
                    </div>

                    {selected && (
                      <>
                        <div className="pl-10 pr-3 pb-3 flex gap-2 items-stretch flex-wrap">
                          {cfg!.source === 'manual' ? (
                            isValidade ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <input
                                  autoFocus
                                  value={cfg!.manual}
                                  onChange={e => setManual(field.key, e.target.value)}
                                  placeholder="MM/AAAA"
                                  className="w-[120px] h-9 rounded-[10px] border-[1.5px] border-[#E0D8BF] dark:border-white/[0.08] bg-white dark:bg-[#252520] px-[11px] font-['DM_Mono',monospace] text-[12px] tracking-[0.02em] text-on-surface outline-none caret-[#D81E1E] focus:border-[#D81E1E] focus:shadow-[0_0_0_3px_rgba(216,30,30,0.15)] transition-[border-color,box-shadow] duration-[130ms]"
                                />
                                {VALIDADE_QUICK.map(q => {
                                  const v = q.value();
                                  return (
                                    <button
                                      key={q.label}
                                      type="button"
                                      onClick={() => setManual(field.key, v)}
                                      className={cn(
                                        'px-2.5 py-1.5 rounded-[9px] text-[10px] font-extrabold transition-colors active:scale-[0.97]',
                                        cfg!.manual === v ? 'bg-[#1A1A0E] text-[#FFE500] dark:bg-[#FFE500] dark:text-[#1A1A0E]' : 'bg-black/[0.06] dark:bg-white/[0.07] text-secondary/60 hover:text-on-surface'
                                      )}
                                    >
                                      {q.label}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : field.key === 'composicao' ? (
                              <textarea
                                autoFocus
                                rows={2}
                                value={cfg!.manual}
                                onChange={e => setManual(field.key, e.target.value)}
                                placeholder="Composição só pra esta etiqueta…"
                                className={cn(fieldBase, 'resize-none bg-white dark:bg-[#252520] border-[#E0D8BF] dark:border-white/[0.08] text-on-surface outline-none caret-[#D81E1E] focus:border-[#D81E1E] focus:shadow-[0_0_0_3px_rgba(216,30,30,0.15)] transition-[border-color,box-shadow] duration-[130ms]')}
                              />
                            ) : (
                              <input
                                autoFocus
                                value={cfg!.manual}
                                onChange={e => setManual(field.key, e.target.value)}
                                maxLength={field.key === 'cnpj' ? 18 : undefined}
                                placeholder={field.key === 'cnpj' ? '00.000.000/0000-00' : 'Nome do fabricante'}
                                className={cn(fieldBase, 'h-9 bg-white dark:bg-[#252520] border-[#E0D8BF] dark:border-white/[0.08] text-on-surface outline-none caret-[#D81E1E] focus:border-[#D81E1E] focus:shadow-[0_0_0_3px_rgba(216,30,30,0.15)] transition-[border-color,box-shadow] duration-[130ms]', field.key === 'cnpj' && "font-['DM_Mono',monospace] text-[12px] tracking-[0.02em]")}
                              />
                            )
                          ) : missing ? (
                            <>
                              <div className={cn(fieldBase, 'border-[rgba(216,30,30,0.55)] bg-[rgba(200,26,26,0.05)] dark:bg-[rgba(216,30,30,0.08)] text-[#B91818] dark:text-red-400 font-bold')}>
                                {MISSING_TEXT[field.key]}
                              </div>
                              <button
                                type="button"
                                onClick={() => setPicker(field.key === 'composicao' ? 'composicao' : 'fabricante')}
                                className="flex-shrink-0 flex items-center gap-1 px-3 rounded-[10px] bg-[#D81E1E] text-white text-[11px] font-extrabold hover:opacity-90 transition-[opacity,transform] active:scale-[0.97]"
                              >
                                <Plus size={12} strokeWidth={3} />
                                Adicionar
                              </button>
                            </>
                          ) : (
                            <div className={cn(fieldBase, 'bg-[#FAF7EE] dark:bg-[#1E1E18] border-[#E0D8BF] dark:border-white/[0.08] text-on-surface', field.key === 'cnpj' && "font-['DM_Mono',monospace] text-[12px] tracking-[0.02em]", field.key === 'composicao' && 'items-start leading-[1.45]')}>
                              <span className="min-w-0 flex-1 break-words">{cadastro}</span>
                              <Lock size={12} className="shrink-0 text-secondary/35" />
                            </div>
                          )}
                        </div>
                        {cfg!.source === 'cadastro' && !missing && savedKeys.has(field.key) && (
                          <p className="pl-10 pr-3 pb-2.5 -mt-1 text-[10px] font-bold text-[#0A7A55] dark:text-[#34D399] flex items-center gap-1">
                            <Check size={11} strokeWidth={3} /> Salvo no cadastro
                          </p>
                        )}
                        {cfg!.source === 'manual' && !isValidade && (
                          <p className="pl-10 pr-3 pb-2.5 -mt-1 text-[10px] font-semibold text-secondary/50">
                            Vale só pra esta etiqueta{cadastro ? ` — o cadastro continua "${cadastro}"` : ' — não altera o cadastro'}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 pt-2 flex flex-col gap-2 flex-shrink-0">
              {incomplete && (
                <p className="text-center text-[10.5px] font-semibold text-secondary/50">
                  Preencha ou desmarque os campos em vermelho/vazios pra salvar
                </p>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 bg-black/[0.06] dark:bg-white/[0.07] text-secondary font-bold py-3 rounded-2xl hover:bg-black/[0.10] dark:hover:bg-white/[0.11] transition-[background-color,transform] active:scale-[0.97]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={incomplete}
                  className="flex-1 bg-primary text-white font-bold py-3 rounded-2xl hover:opacity-90 transition-[opacity,transform] shadow-lg shadow-primary/30 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97] flex items-center justify-center gap-2"
                >
                  <Save size={15} />
                  Salvar na etiqueta
                </button>
              </div>
            </div>
          </motion.div>

          <ManufacturerPickerModal
            isOpen={picker === 'fabricante'}
            product={product}
            manufacturers={manufacturers}
            onManufacturerSaved={onManufacturerSaved}
            onClose={() => setPicker(null)}
            onSaved={manufacturerId => {
              onProductUpdated(product.id, { manufacturer_id: manufacturerId });
              markSaved(['fabricante', 'cnpj']);
            }}
          />
          <CompositionModal
            isOpen={picker === 'composicao'}
            product={product}
            onClose={() => setPicker(null)}
            onSaved={composicao => {
              onProductUpdated(product.id, { composicao });
              markSaved(['composicao']);
            }}
          />
        </div>
      )}
    </AnimatePresence>
  );
}

// Casca comum dos sub-módulos (vincular fabricante / composição).
function SubModal({ isOpen, icon, title, subtitle, onClose, children, footer }: {
  isOpen: boolean; icon: React.ReactNode; title: string; subtitle: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[750] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/35"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="relative bg-[#F0E7CC] dark:bg-[#1E1E18] rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-black/10 dark:border-white/[0.08] flex flex-col max-h-[85vh]"
          >
            <div className="px-5 py-4 flex items-center gap-3 bg-[#FFE500] dark:bg-[#252520] border-b border-[#D4C000] dark:border-white/[0.07] flex-shrink-0">
              <div className="w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]">
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-manrope font-extrabold text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight">{title}</h3>
                <p className="text-[11.5px] font-bold text-[#1A1A0E]/55 dark:text-[#F2F0E3]/35 mt-0.5 truncate">{subtitle}</p>
              </div>
              <button
                onClick={onClose}
                className="w-[34px] h-[34px] rounded-[11px] flex items-center justify-center shrink-0 bg-black/[0.08] dark:bg-white/[0.06] border border-black/10 dark:border-white/[0.08] text-black/50 dark:text-white/40 hover:bg-black/[0.14] dark:hover:bg-white/[0.10] transition-[background-color,transform] active:scale-[0.93]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto">{children}</div>
            <div className="px-5 pb-5 pt-1 flex gap-3 flex-shrink-0">{footer}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

const cancelBtnCls = 'flex-1 bg-black/[0.06] dark:bg-white/[0.07] text-secondary font-bold py-3 rounded-2xl hover:bg-black/[0.10] dark:hover:bg-white/[0.11] transition-[background-color,transform] active:scale-[0.97]';
const saveBtnCls = 'flex-1 bg-primary text-white font-bold py-3 rounded-2xl hover:opacity-90 transition-[opacity,transform] shadow-lg shadow-primary/30 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97] flex items-center justify-center gap-2';

function highlight(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-[#FFE500]/55 dark:bg-[#FFE500]/25 text-inherit rounded-[3px] px-px">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function ManufacturerPickerModal({ isOpen, product, manufacturers, onManufacturerSaved, onClose, onSaved }: {
  isOpen: boolean; product: any; manufacturers: Manufacturer[]; onManufacturerSaved: (m: Manufacturer) => void; onClose: () => void; onSaved: (manufacturerId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Manufacturer | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelectedId(product?.manufacturer_id ?? null);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const list = manufacturers.filter(m => m.active !== false || m.id === selectedId);
    if (!q) return list.slice(0, 50);
    return list.filter(m => m.name.toLowerCase().includes(q) || (digits && (m.cnpj ?? '').includes(digits))).slice(0, 50);
  }, [manufacturers, query, selectedId]);

  const selected = manufacturers.find(m => m.id === selectedId) ?? null;

  const handleSave = async () => {
    if (!selectedId || saving) return;
    setSaving(true);
    setError('');
    const { error: dbError } = await supabase.from('products').update({ manufacturer_id: selectedId }).eq('id', product.id);
    setSaving(false);
    if (dbError) { setError(dbError.message || 'Erro ao salvar no cadastro.'); return; }
    onSaved(selectedId);
    onClose();
  };

  return (
    <>
      <SubModal
        isOpen={isOpen}
        icon={<Factory size={18} />}
        title="Vincular fabricante"
        subtitle={product?.name ?? ''}
        onClose={onClose}
        footer={
          <>
            <button type="button" onClick={onClose} className={cancelBtnCls}>Cancelar</button>
            <button type="button" onClick={handleSave} disabled={!selectedId || saving} className={saveBtnCls}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Salvar no cadastro
            </button>
          </>
        }
      >
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary/40 pointer-events-none" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por nome ou CNPJ…"
              className="w-full h-10 pl-9 pr-3 rounded-[14px] border-[1.5px] border-[#E0D8BF] dark:border-white/[0.08] bg-white dark:bg-[#252520] text-[13px] font-semibold text-on-surface placeholder:text-secondary/40 outline-none caret-[#D81E1E] focus:border-[#D81E1E] focus:shadow-[0_0_0_3px_rgba(216,30,30,0.15)] transition-[border-color,box-shadow] duration-[130ms]"
            />
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            title="Cadastrar novo fabricante"
            className="w-10 h-10 rounded-[14px] flex-shrink-0 bg-[#1A1A0E] dark:bg-[#FFE500] text-[#FFE500] dark:text-[#1A1A0E] flex items-center justify-center hover:opacity-85 transition-[opacity,transform] active:scale-[0.95]"
          >
            <Plus size={16} strokeWidth={2.8} />
          </button>
        </div>

        <div className="rounded-[14px] border border-black/10 dark:border-white/[0.08] bg-white dark:bg-[#2E2E28] overflow-hidden">
          {results.length === 0 ? (
            <p className="px-3 py-5 text-center text-[12px] font-semibold text-secondary/45">
              Nenhum fabricante encontrado — use o <b>+</b> pra cadastrar.
            </p>
          ) : results.map(m => {
            const on = m.id === selectedId;
            return (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(m.id)}
                onKeyDown={e => { if (e.key === 'Enter') setSelectedId(m.id); }}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 border-b last:border-b-0 border-black/[0.07] dark:border-white/[0.06] cursor-pointer transition-colors',
                  on ? 'bg-[#FFE500]/[0.14] dark:bg-[#FFE500]/[0.06]' : 'hover:bg-[#FFF8D0] dark:hover:bg-white/[0.03]'
                )}
              >
                <span className={cn('w-4 h-4 rounded-full flex-shrink-0 transition-[border-width,border-color] duration-[130ms]', on ? 'border-[5px] border-[#D81E1E]' : 'border-2 border-black/20 dark:border-white/20')} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-bold text-on-surface truncate">{highlight(m.name, query.trim())}</p>
                  {m.cnpj ? (
                    <p className="text-[10.5px] font-['DM_Mono',monospace] text-secondary/50 mt-px">{formatCNPJ(m.cnpj)}</p>
                  ) : (
                    <p className="text-[10.5px] font-bold text-[#B91818] dark:text-red-400 mt-px">Sem CNPJ cadastrado</p>
                  )}
                </div>
                {!m.cnpj && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setEditing(m); }}
                    title="Editar fabricante pra adicionar o CNPJ"
                    className="w-[26px] h-[26px] rounded-lg flex-shrink-0 flex items-center justify-center bg-black/[0.05] dark:bg-white/[0.06] text-secondary/60 hover:text-on-surface transition-colors"
                  >
                    <Pencil size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 px-3 py-2.5 rounded-xl bg-black/[0.06] dark:bg-white/[0.07] text-[11px] font-semibold text-secondary/70 leading-relaxed">
          <Info size={14} className="shrink-0 mt-px" />
          <span>
            {selected
              ? <>O produto passa a ter <b className="text-on-surface">{selected.name}</b> como fabricante. Fabricante e CNPJ da etiqueta usam esses dados.</>
              : 'O fabricante será vinculado ao cadastro do produto. Fabricante e CNPJ da etiqueta passam a usar esses dados.'}
          </span>
        </div>
        {error && <p className="text-[11px] font-bold text-[#B91818] dark:text-red-400">{error}</p>}
      </SubModal>

      <div className="relative z-[800]">
        <AddManufacturerModal
          isOpen={addOpen || !!editing}
          editingManufacturer={editing}
          onClose={() => { setAddOpen(false); setEditing(null); }}
          onSuccess={m => { onManufacturerSaved(m); setSelectedId(m.id); }}
        />
      </div>
    </>
  );
}

function CompositionModal({ isOpen, product, onClose, onSaved }: {
  isOpen: boolean; product: any; onClose: () => void; onSaved: (composicao: string) => void;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setValue(product?.composicao ?? '');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError('');
    const { error: dbError } = await supabase.from('products').update({ composicao: trimmed }).eq('id', product.id);
    setSaving(false);
    if (dbError) { setError(dbError.message || 'Erro ao salvar no cadastro.'); return; }
    onSaved(trimmed);
    onClose();
  };

  return (
    <SubModal
      isOpen={isOpen}
      icon={<FlaskConical size={18} />}
      title="Composição"
      subtitle={product?.name ?? ''}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={cancelBtnCls}>Cancelar</button>
          <button type="button" onClick={handleSave} disabled={!value.trim() || saving} className={saveBtnCls}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Salvar no cadastro
          </button>
        </>
      }
    >
      <span className="block text-[10.5px] font-extrabold uppercase tracking-wide text-secondary/55 -mb-1">Composição</span>
      <textarea
        autoFocus
        rows={4}
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Ingredientes / composição do produto..."
        className="w-full rounded-[14px] border-[1.5px] border-[#E0D8BF] dark:border-white/[0.08] bg-white dark:bg-[#252520] px-3.5 py-3 text-[13px] font-semibold leading-relaxed text-on-surface placeholder:text-secondary/40 outline-none resize-none caret-[#D81E1E] focus:border-[#D81E1E] focus:shadow-[0_0_0_3px_rgba(216,30,30,0.15)] transition-[border-color,box-shadow] duration-[130ms]"
      />
      <p className="text-right text-[10px] font-['DM_Mono',monospace] text-secondary/40 -mt-1.5">{value.trim().length} caracteres</p>
      {error && <p className="text-[11px] font-bold text-[#B91818] dark:text-red-400">{error}</p>}
    </SubModal>
  );
}
