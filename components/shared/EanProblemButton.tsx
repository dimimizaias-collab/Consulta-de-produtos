'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';

export interface EanProblem {
  id: string;
  ean: string;
  descricao: 'Não lê' | 'Sem código' | 'Outro';
  observacao?: string;
  source?: string;
  created_at: string;
}

interface EanProblemButtonProps {
  ean: string;
  problems: EanProblem[];
  onReport: (ean: string, desc: string, obs: string) => Promise<void>;
  size?: 'sm' | 'xs';
  className?: string;
}

export function EanProblemButton({
  ean,
  problems,
  onReport,
  size = 'sm',
  className,
}: EanProblemButtonProps) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState<'Não lê' | 'Sem código' | 'Outro'>('Não lê');
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);

  const hasProblem = problems.some(p => p.ean === ean.trim());
  const iconSize = size === 'xs' ? 12 : 14;

  async function handleSave() {
    setSaving(true);
    try {
      await onReport(ean, desc, obs);
      setOpen(false);
      setObs('');
      setDesc('Não lê');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn('relative inline-flex', className)}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title={hasProblem ? 'Problema com EAN registrado' : 'Reportar problema com EAN'}
        className={cn(
          'flex items-center justify-center transition-colors',
          hasProblem
            ? 'text-amber-500 hover:text-amber-600'
            : 'text-on-surface/20 dark:text-white/15 hover:text-amber-400',
        )}
      >
        <AlertTriangle size={iconSize} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
            className="absolute z-50 top-full left-0 mt-1 w-72 bg-white dark:bg-[#2e2e28] border border-[#E0D8BF] dark:border-white/10 rounded-2xl shadow-2xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-black text-on-surface uppercase tracking-widest">
                Problema com EAN
              </p>
              <button
                onClick={() => setOpen(false)}
                className="text-on-surface/40 hover:text-on-surface transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Descrição — radio buttons */}
            <div className="space-y-1">
              <p className="text-[10px] font-black text-on-surface/40 uppercase tracking-wider">
                Descrição *
              </p>
              {(['Não lê', 'Sem código', 'Outro'] as const).map(opt => (
                <label key={opt} className="flex items-center gap-2 cursor-pointer py-1">
                  <input
                    type="radio"
                    name={`desc-${ean}`}
                    value={opt}
                    checked={desc === opt}
                    onChange={() => setDesc(opt)}
                    className="accent-[#D81E1E]"
                  />
                  <span className="text-sm font-medium text-on-surface">{opt}</span>
                </label>
              ))}
            </div>

            {/* Observação */}
            <div className="space-y-1">
              <p className="text-[10px] font-black text-on-surface/40 uppercase tracking-wider">
                Observação
              </p>
              <textarea
                value={obs}
                onChange={e => setObs(e.target.value)}
                placeholder="Detalhes para análise futura..."
                className="w-full bg-[#FDFAF0] dark:bg-[#1e1e18] border border-[#E0D8BF] dark:border-white/[0.08] rounded-xl p-2 text-xs resize-none h-16 focus:outline-none focus:border-[#D81E1E]"
              />
            </div>

            {/* Botões */}
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-[#D81E1E] text-white text-xs font-black py-2 rounded-xl hover:bg-[#c01818] transition-colors disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="px-3 py-2 text-xs font-bold text-on-surface/50 hover:bg-on-surface/5 rounded-xl transition-colors"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
