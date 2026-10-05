import { cn } from '@/lib/utils';

// Abas "penduradas" do padrão quadrado (Editar Produto, Editar Fornecedor):
// mesma cor da barra de título, sombra interna em cima e traço vermelho na ativa.
export const squareTabCls = (active: boolean, first: boolean) => cn(
  'min-w-[120px] h-8 px-3.5 flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap',
  'bg-[#FBF35E] dark:bg-[#252520] border border-t-0 border-[#D9CF45] dark:border-white/[0.08]',
  first ? 'border-l-0' : '-ml-px',
  'text-[11px] font-extrabold uppercase tracking-[0.05em] text-[#1A1A0E] dark:text-[#F2F0E3]',
  active
    ? 'shadow-[inset_0_6px_8px_-5px_rgba(26,26,10,0.35),inset_0_-3px_0_#D81E1E] dark:shadow-[inset_0_6px_8px_-5px_rgba(0,0,0,0.55),inset_0_-3px_0_#D81E1E]'
    : 'shadow-[inset_0_6px_8px_-5px_rgba(26,26,10,0.35)] dark:shadow-[inset_0_6px_8px_-5px_rgba(0,0,0,0.55)]',
  'transition-transform duration-150 active:scale-[0.97] disabled:active:scale-100 disabled:cursor-not-allowed'
);

/** Faixa atrás das abas (mesma cor do rodapé do modal). */
export const squareTabsBarCls = 'shrink-0 flex bg-[#EFE7CD] dark:bg-[#181814]';
