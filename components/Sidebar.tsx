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
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useViewMode } from '@/lib/view-mode';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isCollapsed?: boolean;         // kept for API compat, ignored
  onToggleCollapse?: () => void; // kept for API compat, ignored
  unreadNotifications?: number;
}

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard' },
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

export function Sidebar({ activeTab, setActiveTab, unreadNotifications = 0 }: SidebarProps) {
  const { isMobileView } = useViewMode();

  return (
    <aside className={cn(
      'fixed left-4 inset-y-0 z-40 flex-col items-center w-[56px] py-6',
      isMobileView ? 'hidden' : 'flex'
    )}>

      {/* ── Logo circle — slightly larger than nav circles ── */}
      <div className="w-14 h-14 rounded-full bg-on-surface/[0.10] flex items-center justify-center shrink-0 mb-6 overflow-hidden">
        <div className="relative w-9 h-9">
          <Image
            src="/brand/logo.png"
            alt="Universo do R$1,99"
            fill
            className="object-contain"
            unoptimized
            priority
          />
        </div>
      </div>

      {/* ── Nav items — spread across remaining vertical space ── */}
      <nav className="flex flex-col items-center justify-between flex-1 w-full">
        {navItems.map((item) => {
          const isActive = activeTab === item.label;
          const badge = 'hasBadge' in item && item.hasBadge ? unreadNotifications : 0;

          return (
            <button
              key={item.label}
              onClick={() => setActiveTab(item.label)}
              title={item.label}
              className={cn(
                'group relative w-12 h-12 rounded-full flex items-center justify-center outline-none',
                'transition-[background,color,transform] duration-150 active:scale-[0.93]',
                isActive
                  ? 'bg-primary text-white shadow-lg shadow-primary/30'
                  : 'bg-on-surface/[0.10] text-on-surface/70 hover:bg-on-surface/[0.18] hover:text-on-surface'
              )}
            >
              <item.icon size={19} strokeWidth={isActive ? 2.5 : 2} />

              {/* Notification dot */}
              {badge > 0 && (
                <span className="absolute top-[10px] right-[10px] w-2 h-2 bg-red-500 rounded-full border-2 border-background" />
              )}

              {/* Tooltip */}
              <span className={cn(
                'pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2',
                'px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap',
                'text-on-surface bg-surface-container border border-on-surface/[0.08]',
                'shadow-[0_4px_14px_rgba(0,0,0,0.25)]',
                'opacity-0 translate-x-[-4px]',
                'group-hover:opacity-100 group-hover:translate-x-0',
                'transition-[opacity,transform] duration-[120ms] ease-out'
              )}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
