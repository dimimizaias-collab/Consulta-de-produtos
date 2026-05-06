'use client';

import { useState, useRef } from 'react';
import { X, Upload, FileText, Loader2, CheckSquare, Square, ArrowRight, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImportedRow {
  supplierCode: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImport: (rows: ImportedRow[]) => void;
}

type Step = 'upload' | 'loading' | 'selecting';

// ─── Parsing ──────────────────────────────────────────────────────────────────

const UNITS = ['UN', 'KG', 'CX', 'SC', 'FD', 'PC', 'MT', 'LT', 'GR', 'ML',
  'CT', 'DZ', 'PAR', 'JG', 'PT', 'RL', 'BD', 'VD', 'FR', 'PÇ', 'CJ', 'KIT'];

function parseLine(line: string): ImportedRow {
  const unitRegex = new RegExp(`\\b(${UNITS.join('|')})\\b`, 'i');
  const unitMatch = line.match(unitRegex);

  if (unitMatch && unitMatch.index !== undefined) {
    const beforeUnit = line.slice(0, unitMatch.index).trim();
    const afterUnit = line.slice(unitMatch.index + unitMatch[0].length).trim();

    // Leading code (number or alphanumeric) before description
    const codeMatch = beforeUnit.match(/^([A-Z]?\d+[A-Z]?)\s+(.+)$/i);
    const supplierCode = codeMatch ? codeMatch[1] : '';
    const description = (codeMatch ? codeMatch[2] : beforeUnit).trim();

    // Numbers after unit: first = qty, second = unit price
    const nums = (afterUnit.match(/[\d.,]+/g) || []).map(n =>
      n.replace(/\.(?=\d{3})/g, '').replace(',', '.')
    );
    const quantity = nums[0] ?? '1';
    const unitPrice = nums[1] ?? '';

    return { supplierCode, description, unit: unitMatch[0].toUpperCase(), quantity, unitPrice };
  }

  // Fallback: leading code + rest as description
  const codeMatch = line.match(/^([A-Z]?\d+[A-Z]?)\s+(.+)$/i);
  return {
    supplierCode: codeMatch ? codeMatch[1] : '',
    description: (codeMatch ? codeMatch[2] : line).trim(),
    unit: 'UN',
    quantity: '1',
    unitPrice: '',
  };
}

// ─── CDN loader for Tesseract.js (browser-side OCR, no bundle impact) ────────

function loadTesseractCDN(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Tesseract) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar motor OCR. Verifique sua conexão.'));
    document.head.appendChild(script);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InvoiceImportModal({ isOpen, onClose, onImport }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [lines, setLines] = useState<string[]>([]);
  const [source, setSource] = useState<'ocr' | 'pdf'>('ocr');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [parsed, setParsed] = useState<Record<number, ImportedRow>>({});
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload'); setLines([]); setSelected(new Set());
    setParsed({}); setError('');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError('');
    setStep('loading');

    try {
      let extractedLines: string[] = [];
      let src: 'ocr' | 'pdf' = 'ocr';

      if (file.type === 'application/pdf') {
        // PDF: extract text server-side (pdf-parse, lightweight)
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/import-invoice', { method: 'POST', body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao processar PDF.');
        extractedLines = json.lines ?? [];
        src = 'pdf';
      } else {
        // Image: OCR in the browser via Tesseract.js CDN (no server dependency)
        await loadTesseractCDN();
        const Tesseract = (window as any).Tesseract;
        const worker = await Tesseract.createWorker('por+eng', 1, {
          workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/worker.min.js',
          langPath: 'https://tessdata.projectnaptha.com/4.0.0',
          corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@6/tesseract-core-simd-lstm.wasm.js',
          logger: () => {},
        });
        const { data: { text } } = await worker.recognize(file);
        await worker.terminate();
        extractedLines = text.split('\n').map((l: string) => l.replace(/\s+/g, ' ').trim()).filter((l: string) => l.length > 2);
        src = 'ocr';
      }

      if (!extractedLines.length) throw new Error('Nenhum texto encontrado no documento.');
      setLines(extractedLines);
      setSource(src);
      setSelected(new Set());
      setParsed({});
      setStep('selecting');
    } catch (err: any) {
      setError(err.message);
      setStep('upload');
    }
  };

  const toggleLine = (idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
        setParsed(p => { const n = { ...p }; delete n[idx]; return n; });
      } else {
        next.add(idx);
        setParsed(p => ({ ...p, [idx]: parseLine(lines[idx]) }));
      }
      return next;
    });
  };

  const selectAll = () => {
    const allIdx = lines.map((_, i) => i);
    setSelected(new Set(allIdx));
    setParsed(Object.fromEntries(allIdx.map(i => [i, parseLine(lines[i])])));
  };

  const clearAll = () => {
    setSelected(new Set());
    setParsed({});
  };

  const updateParsed = (idx: number, field: keyof ImportedRow, value: string) => {
    setParsed(p => ({ ...p, [idx]: { ...p[idx], [field]: value } }));
  };

  const handleImport = () => {
    const rows = [...selected].sort((a, b) => a - b).map(i => parsed[i]).filter(Boolean);
    if (!rows.length) return;
    onImport(rows);
    handleClose();
  };

  const selectedRows = [...selected].sort((a, b) => a - b);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.55 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black" onClick={handleClose} />

      <motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }} transition={{ duration: 0.18 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden"
        style={{ maxHeight: '88vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
              <FileText size={16} className="text-blue-600" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 text-sm uppercase tracking-widest">Importar Nota</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {step === 'upload' && 'Selecione um PDF ou imagem da nota fiscal'}
                {step === 'loading' && 'Extraindo texto do documento...'}
                {step === 'selecting' && `${lines.length} linhas extraídas via ${source === 'pdf' ? 'PDF' : 'OCR'} — marque os itens`}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col">

          {/* Upload step */}
          {step === 'upload' && (
            <div className="flex-1 flex flex-col items-center justify-center p-10 gap-4">
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden" onChange={handleFile} />
              <button onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center gap-3 border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 rounded-2xl px-16 py-10 transition-all group">
                <div className="w-12 h-12 bg-slate-100 group-hover:bg-blue-100 rounded-2xl flex items-center justify-center transition-colors">
                  <Upload size={22} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-slate-700 text-sm">Clique para selecionar o arquivo</p>
                  <p className="text-xs text-slate-400 mt-1">PDF, JPG, PNG ou WebP — máximo 10MB</p>
                </div>
              </button>
              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2 max-w-sm text-center">{error}</p>
              )}
            </div>
          )}

          {/* Loading step */}
          {step === 'loading' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <Loader2 size={32} className="text-blue-500 animate-spin" />
              <p className="text-sm font-bold text-slate-600">Processando documento...</p>
              <p className="text-xs text-slate-400">Isso pode levar alguns segundos</p>
            </div>
          )}

          {/* Selecting step */}
          {step === 'selecting' && (
            <div className="flex-1 overflow-hidden flex gap-0 min-h-0">

              {/* Left: OCR lines */}
              <div className="w-1/2 border-r border-slate-100 flex flex-col min-h-0">
                <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Linhas extraídas</span>
                  <div className="flex items-center gap-2">
                    <button onClick={selectAll} className="text-[10px] font-bold text-blue-600 hover:underline">Selecionar tudo</button>
                    <span className="text-slate-300">·</span>
                    <button onClick={clearAll} className="text-[10px] font-bold text-slate-400 hover:underline">Limpar</button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {lines.map((line, idx) => (
                    <button key={idx} onClick={() => toggleLine(idx)}
                      className={cn(
                        'w-full flex items-start gap-2.5 px-4 py-2 text-left transition-colors border-b border-slate-50',
                        selected.has(idx) ? 'bg-blue-50' : 'hover:bg-slate-50',
                      )}>
                      <span className="shrink-0 mt-0.5 text-blue-500">
                        {selected.has(idx) ? <CheckSquare size={14} /> : <Square size={14} className="text-slate-300" />}
                      </span>
                      <span className={cn(
                        'text-xs font-mono leading-relaxed break-all',
                        selected.has(idx) ? 'text-slate-800' : 'text-slate-500',
                      )}>{line}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Right: parsed items */}
              <div className="w-1/2 flex flex-col min-h-0">
                <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Itens selecionados ({selectedRows.length})
                  </span>
                </div>

                {selectedRows.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-xs text-slate-400 text-center px-6">
                      Marque as linhas à esquerda que correspondem a produtos
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto">
                    {selectedRows.map(idx => {
                      const item = parsed[idx];
                      if (!item) return null;
                      return (
                        <div key={idx} className="border-b border-slate-100 px-4 py-3 flex flex-col gap-2">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 grid grid-cols-[64px_1fr] gap-2">
                              <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Código</label>
                                <input value={item.supplierCode}
                                  onChange={e => updateParsed(idx, 'supplierCode', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-300"
                                  placeholder="—" />
                              </div>
                              <div>
                                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Descrição</label>
                                <input value={item.description}
                                  onChange={e => updateParsed(idx, 'description', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-300"
                                  placeholder="Descrição do produto" />
                              </div>
                            </div>
                            <button onClick={() => toggleLine(idx)}
                              className="mt-4 p-1 text-slate-300 hover:text-red-400 transition-colors shrink-0">
                              <Trash2 size={13} />
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Unid.</label>
                              <input value={item.unit}
                                onChange={e => updateParsed(idx, 'unit', e.target.value.toUpperCase())}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-center focus:outline-none focus:ring-1 focus:ring-blue-300" />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Quantidade</label>
                              <input value={item.quantity} type="number" min="0"
                                onChange={e => updateParsed(idx, 'quantity', e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono text-right focus:outline-none focus:ring-1 focus:ring-blue-300" />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Preço Unit.</label>
                              <input value={item.unitPrice} type="number" min="0" step="0.01"
                                onChange={e => updateParsed(idx, 'unitPrice', e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono text-right focus:outline-none focus:ring-1 focus:ring-blue-300"
                                placeholder="0,00" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'selecting' && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between shrink-0">
            <button onClick={reset}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest">
              ← Novo arquivo
            </button>
            <button onClick={handleImport} disabled={selectedRows.length === 0}
              className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-xs hover:bg-blue-600 transition-all shadow-lg shadow-slate-900/10 disabled:opacity-40 uppercase tracking-widest">
              <ArrowRight size={14} />
              Adicionar {selectedRows.length > 0 ? `${selectedRows.length} ` : ''}ao Manifesto
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
