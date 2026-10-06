import { cn } from '@/lib/utils';

// Classes do padrão quadrado usadas pelos modais do módulo de Etiquetas
// (mesmo visual dos modais de Fornecedor/Fabricante).

export const modalBackdropCls = 'absolute inset-0 bg-black/55';
export const modalCls = 'relative w-full max-h-[90vh] flex flex-col overflow-hidden bg-[#FDFAF0] dark:bg-[#1E1E18] border border-black/[0.12] dark:border-white/[0.08] shadow-2xl';

export const barCls = 'h-12 pl-3.5 pr-3 flex items-center gap-[11px] bg-[#FBF35E] dark:bg-[#252520] border-b border-[#D9CF45] dark:border-white/[0.08] shrink-0';
export const barChipCls = 'w-[30px] h-[30px] flex items-center justify-center shrink-0 bg-black/[0.09] dark:bg-[#D81E1E]/[0.16] text-[#1A1A0E] dark:text-[#D81E1E]';
export const barTitleCls = 'truncate text-[15px] font-black text-[#1A1A0E] dark:text-[#F2F0E3] leading-tight';
export const barSubtitleCls = 'truncate text-[10.5px] font-bold text-[#1A1A0E]/50 dark:text-[#F2F0E3]/40';
export const closeBtnCls = 'w-[30px] h-[30px] flex items-center justify-center shrink-0 border border-black/[0.14] dark:border-white/[0.10] text-black/50 dark:text-white/40 hover:bg-[#D81E1E]/[0.09] hover:text-[#D81E1E] hover:border-[#D81E1E]/25 active:scale-[0.93] transition-all duration-[130ms]';

export const sectionCls = 'bg-[#F1EAD3] dark:bg-[#181814] border border-[#E0D8BF] dark:border-white/[0.10]';
export const sectionHeadCls = 'h-7 flex items-center gap-2 px-2.5 bg-[#FFEC4D] border-b-[1.5px] border-[#8F7E10]';
export const sectionTitleCls = 'text-[9px] font-black uppercase tracking-[0.1em] text-[rgba(26,26,10,0.55)]';
export const sectionCountCls = 'ml-auto text-[10px] font-extrabold text-[rgba(26,26,10,0.55)]';

export const labelCls = 'flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.1em] text-[#1A1A0E]/[0.58] dark:text-[#F2F0E3]/55 pl-px mb-1';
export const inputCls = 'w-full min-w-0 h-[34px] px-2.5 bg-white dark:bg-[#1E1E18] text-[13px] font-semibold text-on-surface border border-[#E0D8BF] dark:border-white/[0.10] outline-none caret-[#D81E1E] hover:border-[#CFC4A2] dark:hover:border-white/[0.20] focus:!border-[#D81E1E] focus:shadow-[0_0_0_2px_rgba(216,30,30,0.12)] placeholder:text-on-surface/25 placeholder:font-medium transition-[border-color,box-shadow]';
export const noSpinCls = '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

/** Linha de produto empilhada — separador mais escuro no modo claro. */
export const rowCls = (first: boolean) => cn(
  'bg-white dark:bg-[#1E1E18] border border-[#B5AA86] dark:border-white/[0.10]',
  !first && 'border-t-0',
);
export const rowLineCls = 'border-[#B5AA86] dark:border-white/[0.10]';

/** Seletor segmentado (Inteira / Metade / Código). */
export const segCls = 'flex shrink-0 gap-0.5 p-0.5 bg-on-surface/[0.06] border border-[#E0D8BF] dark:border-white/[0.10]';
export const segBtnCls = (active: boolean) => cn(
  'h-6 px-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.06em] transition-colors duration-[130ms]',
  active ? 'bg-[#D81E1E] text-white' : 'text-on-surface/50 hover:text-on-surface',
);

/** Botão quadrado pequeno com borda (editar, −/+). */
export const iconBtnCls = 'w-[26px] h-[26px] flex items-center justify-center shrink-0 border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-on-surface/55 hover:text-on-surface hover:border-[#CFC4A2] dark:hover:border-white/[0.20] active:scale-[0.94] transition-all duration-[130ms]';
export const deleteBtnCls = 'w-[26px] h-[26px] flex items-center justify-center shrink-0 border border-[#D81E1E]/25 bg-[#D81E1E]/[0.06] text-[#D81E1E] hover:bg-[#D81E1E]/[0.14] active:scale-[0.94] transition-all duration-[130ms]';

export const footerCls = 'px-3.5 py-2.5 bg-[#EFE7CD] dark:bg-[#181814] border-t border-[#DDD2B0] dark:border-white/[0.08] flex items-center gap-2 shrink-0';
export const btnCls = 'h-9 px-[18px] flex items-center justify-center gap-2 border border-[#E0D8BF] dark:border-white/[0.10] bg-white dark:bg-[#1E1E18] text-[12px] font-extrabold uppercase tracking-[0.04em] text-on-surface hover:bg-on-surface/[0.05] active:scale-[0.97] transition-all disabled:opacity-45 disabled:cursor-not-allowed';
export const btnPrimaryCls = 'h-9 px-[18px] flex items-center justify-center gap-2 bg-[#D81E1E] hover:bg-[#B91818] text-white text-[12px] font-extrabold uppercase tracking-[0.04em] active:scale-[0.97] transition-all disabled:opacity-45 disabled:cursor-not-allowed';

/** Faixa de destaque amarela (resumo da fila, linha editada). */
export const highlightCls = 'bg-[#FFE500]/[0.12] dark:bg-[#FFE500]/[0.06]';
export const highlightBoxCls = 'border border-[#D4C000] dark:border-[#FFE500]/30 bg-[#FFE500]/[0.12] dark:bg-[#FFE500]/[0.06]';
