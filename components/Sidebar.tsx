'use client';

import {
  LayoutDashboard,
  Package2,
  BarChart3,
  Settings,
  LogIn,
  ShoppingCart,
  Wallet,
  Bell
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isCollapsed?: boolean;         // kept for API compat, ignored
  onToggleCollapse?: () => void; // kept for API compat, ignored
  unreadNotifications?: number;
}

type NavItem = { icon: React.ElementType; label: string; hasBadge?: boolean } | null;

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard' },
  { icon: Package2,        label: 'Inventory' },
  { icon: ShoppingCart,    label: 'Pedidos de Compra' },
  { icon: BarChart3,       label: 'Requisições' },
  null,
  { icon: LogIn,           label: 'Entrada de Mercadoria' },
  { icon: Wallet,          label: 'Controle Financeiro' },
  null,
  { icon: Bell,            label: 'Notificações', hasBadge: true },
  { icon: Settings,        label: 'Configurações' },
];

export function Sidebar({ activeTab, setActiveTab, unreadNotifications = 0 }: SidebarProps) {
  return (
    <aside className="hidden md:flex fixed left-4 top-1/2 -translate-y-1/2 z-40 flex-col items-center gap-1">
      {navItems.map((item, i) => {
        if (item === null) {
          return <div key={`sep-${i}`} className="w-5 h-px bg-on-surface/10 my-1.5" />;
        }

        const isActive = activeTab === item.label;
        const badge = item.hasBadge ? unreadNotifications : 0;

        return (
          <button
            key={item.label}
            onClick={() => setActiveTab(item.label)}
            title={item.label}
            className={cn(
              'group relative w-11 h-11 rounded-full flex items-center justify-center outline-none',
              'transition-[background,color,transform] duration-150',
              'active:scale-[0.93]',
              isActive
                ? 'bg-primary text-white shadow-lg shadow-primary/30'
                : 'text-on-surface/35 hover:bg-on-surface/[0.08] hover:text-on-surface'
            )}
          >
            <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} />

            {/* Notification dot */}
            {badge > 0 && (
              <span className="absolute top-[9px] right-[9px] w-2 h-2 bg-red-500 rounded-full border-2 border-background" />
            )}

            {/* Tooltip */}
            <span
              className={cn(
                'pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2',
                'px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap',
                'text-on-surface bg-surface-container border border-on-surface/[0.08]',
                'shadow-[0_4px_14px_rgba(0,0,0,0.25)]',
                'opacity-0 translate-x-[-4px]',
                'group-hover:opacity-100 group-hover:translate-x-0',
                'transition-[opacity,transform] duration-[120ms] ease-out'
              )}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </aside>
  );
}
