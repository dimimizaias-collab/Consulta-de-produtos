'use client';

import { LayoutDashboard, Package2, BarChart3, LogIn, Wallet, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { useViewMode } from '@/lib/view-mode';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard',   key: 'Dashboard' },
  { icon: Package2,        label: 'Estoque',     key: 'Inventory' },
  { icon: BarChart3,       label: 'Requisições', key: 'Requisições' },
  { icon: LogIn,           label: 'Entrada',     key: 'Entrada de Mercadoria' },
  { icon: Wallet,          label: 'Finanças',    key: 'Controle Financeiro' },
  { icon: Settings,        label: 'Config.',     key: 'Configurações' },
];

export function BottomNav({ activeTab, setActiveTab }: BottomNavProps) {
  const { isMobileView } = useViewMode();

  return (
    <nav className={cn(
      'fixed bottom-0 left-0 right-0 z-50 px-3 pb-[max(env(safe-area-inset-bottom,8px),8px)] pt-2',
      !isMobileView && 'hidden'
    )}>
      {/* Pill container — amarelo no light, escuro no dark */}
      <div className="flex items-center bg-[#FFF8C0] dark:bg-[#2E2E28] border border-[#E8D800] dark:border-white/[0.07] rounded-[28px] px-1 py-1 shadow-lg shadow-[#C8A000]/15 dark:shadow-black/30">
        {navItems.map((item) => {
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={cn(
                'flex flex-col items-center justify-center gap-[3px] flex-1 py-2 px-1 rounded-[22px] relative transition-all duration-200',
                isActive
                  ? 'bg-[#D81E1E]/10 dark:bg-[#D81E1E]/15'
                  : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'
              )}
            >
              <item.icon
                size={20}
                className={cn(
                  'transition-colors',
                  isActive ? 'text-[#D81E1E]' : 'text-[#1A1A0E]/30 dark:text-white/30'
                )}
              />
              <span className={cn(
                'text-[8px] font-black uppercase tracking-tight leading-none',
                isActive ? 'text-[#D81E1E]' : 'text-[#1A1A0E]/30 dark:text-white/25'
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
