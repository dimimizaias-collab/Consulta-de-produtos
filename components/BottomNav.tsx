'use client';

import { LayoutDashboard, Package2, ShoppingCart, BarChart3, LogIn, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', key: 'Dashboard' },
  { icon: Package2,        label: 'Estoque',   key: 'Inventory' },
  { icon: ShoppingCart,    label: 'Pedidos',   key: 'Pedidos de Compra' },
  { icon: BarChart3,       label: 'Requisições', key: 'Requisições' },
  { icon: LogIn,           label: 'Entrada',   key: 'Entrada de Mercadoria' },
  { icon: Wallet,          label: 'Finanças',  key: 'Controle Financeiro' },
];

export function BottomNav({ activeTab, setActiveTab }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-surface-container-low/90 backdrop-blur-xl border-t border-on-surface/5 safe-area-inset-bottom">
      <div className="flex items-center justify-around px-2 pt-2 pb-[env(safe-area-inset-bottom,8px)]">
        {navItems.map((item) => {
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className="flex flex-col items-center justify-center gap-1 flex-1 py-1 min-h-[52px] relative"
            >
              {isActive && (
                <motion.div
                  layoutId="bottom-nav-indicator"
                  className="absolute inset-x-2 top-0 h-0.5 bg-primary rounded-full"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <item.icon
                size={22}
                className={cn(
                  'transition-colors',
                  isActive ? 'text-primary' : 'text-on-surface/40'
                )}
              />
              <span className={cn(
                'text-[10px] font-bold uppercase tracking-tight leading-none',
                isActive ? 'text-primary' : 'text-on-surface/40'
              )}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
