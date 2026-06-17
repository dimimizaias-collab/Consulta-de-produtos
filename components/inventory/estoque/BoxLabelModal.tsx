'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Printer, X } from 'lucide-react';
import JsBarcode from 'jsbarcode';

interface BoxLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  boxCode: string;
  shelfName?: string;
}

export function BoxLabelModal({ isOpen, onClose, boxCode, shelfName }: BoxLabelModalProps) {
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (isOpen && barcodeRef.current && boxCode) {
      try {
        JsBarcode(barcodeRef.current, boxCode, {
          format: 'CODE128',
          width: 2,
          height: 56,
          displayValue: false,
          margin: 0,
          background: 'transparent',
          lineColor: '#1A1A0E',
        });
      } catch {
        // ignore invalid barcode chars
      }
    }
  }, [isOpen, boxCode]);

  const handlePrint = () => {
    const printContents = document.getElementById('label-print-area')?.innerHTML;
    if (!printContents) return;
    const win = window.open('', '_blank', 'width=400,height=300');
    if (!win) return;
    win.document.write(`
      <html><head><title>Etiqueta ${boxCode}</title>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@700;900&family=DM+Mono:wght@700&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fff; font-family: 'DM Sans', sans-serif; }
        .label { text-align: center; padding: 24px; }
        .code { font-family: 'DM Mono', monospace; font-size: 28px; font-weight: 700; color: #1A1A0E; letter-spacing: 0.04em; margin-bottom: 12px; }
        svg { display: block; margin: 0 auto 12px; }
        .shelf { font-size: 11px; font-weight: 700; color: rgba(26,26,10,0.45); text-transform: uppercase; letter-spacing: 0.10em; }
      </style></head>
      <body><div class="label">${printContents}</div></body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="w-full max-w-xs bg-[#FDFAF0] dark:bg-[#1E1E18] rounded-3xl overflow-hidden shadow-2xl border border-on-surface/[0.06]"
          >
            {/* Header */}
            <div className="bg-[#FFE500] border-b border-[#D4C000] px-5 py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-black/[0.09] flex items-center justify-center shrink-0">
                <Printer size={16} strokeWidth={2.5} color="#1A1A0E" />
              </div>
              <div className="flex-1">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#1A1A0E]/50 mb-0.5">Impressão</p>
                <p className="text-base font-black text-[#1A1A0E]">Etiqueta da Caixa</p>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-[9px] bg-black/[0.08] border border-black/[0.10] flex items-center justify-center text-[#1A1A0E]/40 hover:bg-red-500/10 hover:text-red-600 transition-colors"
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            </div>

            {/* Label preview */}
            <div className="p-5">
              <div
                id="label-print-area"
                className="flex flex-col items-center gap-3 border-2 border-dashed border-on-surface/[0.14] rounded-2xl p-6 bg-white dark:bg-[#252520]"
              >
                <p className="font-mono text-3xl font-black text-on-surface tracking-wide">{boxCode}</p>
                <svg ref={barcodeRef} className="w-full max-w-[200px]" />
                <div className="w-full h-px bg-on-surface/[0.08]" />
                {shelfName && (
                  <p className="text-[11px] font-black text-on-surface/40 uppercase tracking-[0.10em] text-center">{shelfName}</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5">
              <button
                onClick={handlePrint}
                className="w-full py-3 rounded-xl text-sm font-black bg-[#1A1A0E] text-[#FFE500] hover:bg-[#2A2A1E] dark:bg-[#FFE500] dark:text-[#1A1A0E] dark:hover:bg-[#F5DB00] transition-colors flex items-center justify-center gap-2 active:scale-[0.97]"
              >
                <Printer size={14} strokeWidth={2.5} />
                Imprimir
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
