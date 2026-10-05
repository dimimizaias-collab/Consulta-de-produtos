import { cn } from '@/lib/utils';
import { FAV_MATCH_LABEL, type FavMatch, type FavMatchField } from '@/lib/favorecidoSearch';

/** Texto com o trecho casado na busca marcado em amarelo. */
export function Highlight({ text, range, className }: { text: string; range: [number, number] | null; className?: string }) {
  if (!range) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {text.slice(0, range[0])}
      <mark className="bg-[#FFE500] dark:bg-[#FFE500]/85 text-[#1A1A0E] px-px">{text.slice(range[0], range[1])}</mark>
      {text.slice(range[1])}
    </span>
  );
}

const TAG_CLS: Record<FavMatchField, string> = {
  nome: '',
  apelido: 'bg-[#D81E1E]/[0.09] text-[#B91818] dark:bg-[#D81E1E]/[0.16] dark:text-[#FF6B6B]',
  extrato: 'bg-[#1A1A0E]/[0.07] text-[#1A1A0E]/[0.62] dark:bg-[#F2F0E3]/[0.08] dark:text-[#F2F0E3]/[0.62]',
  fornecedor: 'bg-[#0A7A55]/[0.09] text-[#0A7A55] dark:bg-[#34D399]/10 dark:text-[#34D399]',
  fantasia: 'bg-[#0A7A55]/[0.09] text-[#0A7A55] dark:bg-[#34D399]/10 dark:text-[#34D399]',
  razao: 'bg-[#0A7A55]/[0.09] text-[#0A7A55] dark:bg-[#34D399]/10 dark:text-[#34D399]',
  documento: 'bg-[#92400E]/[0.09] text-[#92400E] dark:bg-[#FCD34D]/10 dark:text-[#FCD34D]',
};

/** Segunda linha da sugestão: em qual campo a busca bateu (só quando não foi o nome fiscal). */
export function FavMatchWhy({ match, className }: { match: FavMatch; className?: string }) {
  if (match.field === 'nome') return null;
  return (
    <span className={cn('flex items-center gap-1.5 min-w-0 text-[11px] font-semibold text-on-surface/45', className)}>
      <span className={cn('shrink-0 px-[5px] py-[1.5px] text-[8.5px] font-black uppercase tracking-[0.08em]', TAG_CLS[match.field])}>
        {FAV_MATCH_LABEL[match.field]}
      </span>
      <Highlight
        text={match.value}
        range={match.range}
        className={cn('truncate', match.field === 'documento' && "font-['DM_Mono',monospace] text-[10.5px]")}
      />
    </span>
  );
}
