'use client';

import {
  LayoutDashboard,
  Package2,
  BarChart3,
  Settings,
  LogIn,
  Wallet,
  Bell,
  Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useViewMode } from '@/lib/view-mode';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isCollapsed?: boolean;
  unreadNotifications?: number;
}

export const NAV_ITEMS = [
  // Dashboard — oculto do menu lateral (desktop). Componente/rota mantidos para reativação futura.
  // { icon: LayoutDashboard, label: 'Dashboard' },
  { icon: Package2,        label: 'Inventory' },
  // Pedidos de Compra — DESATIVADO da navegação (componente/schema mantidos em components/orders/ e db/schema.ts).
  // { icon: ShoppingCart, label: 'Pedidos de Compra' },
  { icon: BarChart3,       label: 'Requisições' },
  { icon: LogIn,           label: 'Entrada de Mercadoria' },
  { icon: Wallet,          label: 'Controle Financeiro' },
  { icon: Users,           label: 'Recursos Humanos' },
  { icon: Bell,            label: 'Notificações', hasBadge: true },
  { icon: Settings,        label: 'Configurações' },
] as const;

// Itens que ficam no pé da faixa (os demais ficam no topo).
const BOTTOM_ITEMS = new Set<string>(['Notificações', 'Configurações']);

/** Ícone da página ativa — usado também no título do cabeçalho (TopNav). */
export function getNavIcon(label: string) {
  if (label === 'Dashboard') return LayoutDashboard;
  return NAV_ITEMS.find(i => i.label === label)?.icon ?? null;
}

// Menu lateral (desktop): faixa colada na borda esquerda, logo abaixo do cabeçalho, com a mesma
// cor/borda dele — o logo (e o botão de ocultar o menu) fica no canto esquerdo do cabeçalho.
export function Sidebar({ activeTab, setActiveTab, isCollapsed = false, unreadNotifications = 0 }: SidebarProps) {
  const { isMobileView } = useViewMode();

  if (isMobileView || isCollapsed) return null;

  const renderItem = (item: typeof NAV_ITEMS[number]) => {
    const isActive = activeTab === item.label;
    const badge = 'hasBadge' in item && item.hasBadge ? unreadNotifications : 0;
    return (
      <button
        key={item.label}
        onClick={() => setActiveTab(item.label)}
        title={item.label}
        className={cn(
          'group relative w-12 h-11 flex items-center justify-center outline-none shrink-0',
          'transition-[background-color,color,opacity,transform] duration-[130ms] active:scale-95',
          isActive
            ? 'bg-[#D81E1E] text-white'
            : 'text-[#1A1A0E] dark:text-[#F2F0E3] opacity-60 hover:opacity-100 hover:bg-black/[0.07] dark:hover:bg-white/[0.06]'
        )}
      >
        <item.icon size={18} strokeWidth={isActive ? 2.5 : 2.1} />

        {badge > 0 && (
          <span className="absolute top-2 right-2.5 w-[7px] h-[7px] rounded-full bg-[#D81E1E] shadow-[0_0_0_2px_#FFE500] dark:shadow-[0_0_0_2px_#252520]" />
        )}

        <span className={cn(
          'pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 z-10',
          'px-2.5 py-1.5 text-[11px] font-extrabold whitespace-nowrap',
          'bg-[#1A1A0E] text-[#F2F0E3] dark:bg-[#F2F0E3] dark:text-[#1A1A0E]',
          'opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0',
          'transition-[opacity,transform] duration-[120ms] ease-out'
        )}>
          {item.label}
        </span>
      </button>
    );
  };

  return (
    <aside className="fixed left-0 top-11 bottom-0 z-40 w-16 flex flex-col items-center gap-1 py-2 bg-[#FFE500] dark:bg-[#252520] border-r border-[#D4C000] dark:border-white/[0.08]">
      {NAV_ITEMS.filter(i => !BOTTOM_ITEMS.has(i.label)).map(renderItem)}
      <div className="flex-1" />
      {NAV_ITEMS.filter(i => BOTTOM_ITEMS.has(i.label)).map(renderItem)}
    </aside>
  );
}
