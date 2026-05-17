'use client';

import {
  LayoutDashboard,
  Package2,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogIn,
  ShoppingCart,
  Wallet,
  Bell
} from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  unreadNotifications?: number;
}

export function Sidebar({ activeTab, setActiveTab, isCollapsed, onToggleCollapse, unreadNotifications = 0 }: SidebarProps) {
  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard' },
    { icon: Package2,        label: 'Inventory' },
    { icon: ShoppingCart,    label: 'Pedidos de Compra' },
    { icon: BarChart3,       label: 'Requisições' },
    { icon: LogIn,           label: 'Entrada de Mercadoria' },
    { icon: Wallet,          label: 'Controle Financeiro' },
    { icon: Bell,            label: 'Notificações', badge: unreadNotifications },
    { icon: Settings,        label: 'Configurações' },
  ];

  return (
    <aside className={cn(
      "hidden md:flex fixed left-0 top-0 h-full flex-col z-40 transition-all duration-300",
      "bg-surface-container-low/80 backdrop-blur-xl border-r border-[#E9DFC2]",
      isCollapsed ? "w-20" : "w-64"
    )}>

      {/* ── Brand / Logo block — fundo amarelo da marca ── */}
      <div className={cn(
        "relative flex items-center shrink-0 border-b-2 border-[#F5C400]",
        "bg-[#FFE500]",
        isCollapsed ? "justify-center px-3" : "justify-center px-4"
      )}
        style={{ height: '88px' }}
      >
        {/* Logo real */}
        <div className={cn(
          "relative shrink-0 transition-all duration-300",
          isCollapsed ? "w-11 h-11" : "w-[130px] h-[60px]"
        )}>
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

      {/* ── Nav items ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        <nav className="flex flex-col gap-1.5 w-full">
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={() => setActiveTab(item.label)}
              className={cn(
                "flex items-center rounded-xl transition-colors duration-200 group text-left w-full relative",
                isCollapsed ? "justify-center p-3" : "gap-3 px-4 py-3",
                activeTab === item.label
                  ? "text-white bg-primary shadow-lg shadow-primary/25"
                  : "text-on-surface/60 hover:text-on-surface hover:bg-[#E9DFC2]/40 dark:hover:bg-white/[0.06]"
              )}
              title={isCollapsed ? item.label : ""}
            >
              <div className="relative shrink-0">
                <item.icon
                  size={19}
                  className={cn(
                    "transition-transform",
                    activeTab === item.label ? "scale-110" : "group-hover:scale-110"
                  )}
                />
                {isCollapsed && (item as any).badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] bg-primary text-white text-[8px] font-black rounded-full flex items-center justify-center px-0.5">
                    {(item as any).badge > 99 ? '99+' : (item as any).badge}
                  </span>
                )}
              </div>

              {!isCollapsed && (
                <>
                  <span className={cn(
                    "text-[11px] uppercase tracking-wider font-manrope whitespace-nowrap flex-1",
                    activeTab === item.label ? "font-extrabold" : "font-semibold"
                  )}>
                    {item.label}
                  </span>
                  {(item as any).badge > 0 && (
                    <span className={cn(
                      "min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-black px-1",
                      activeTab === item.label ? "bg-white/20 text-white" : "bg-primary text-white"
                    )}>
                      {(item as any).badge > 99 ? '99+' : (item as any).badge}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}

          {/* ── Botão Recolher/Expandir — abaixo de Configurações ── */}
          <button
            onClick={onToggleCollapse}
            className={cn(
              "flex items-center rounded-xl transition-colors duration-200 group text-left w-full mt-1",
              "bg-[#FFE500] hover:bg-[#F5C400] text-[#1A1208] dark:bg-white/[0.06] dark:hover:bg-white/[0.10] dark:text-on-surface",
              isCollapsed ? "justify-center p-3" : "gap-3 px-4 py-3"
            )}
            title={isCollapsed ? "Expandir menu" : "Recolher menu"}
          >
            <motion.div
              animate={{ rotate: isCollapsed ? 0 : 180 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="shrink-0"
            >
              <ChevronRight size={19} />
            </motion.div>
            {!isCollapsed && (
              <span className="text-[11px] uppercase tracking-wider font-manrope font-semibold whitespace-nowrap">
                Recolher menu
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* ── Capacity card ── */}
      {!isCollapsed && (
        <div className="p-4 border-t border-[#E9DFC2]">
          <div className="bg-surface-container-lowest/60 rounded-2xl p-4 border border-[#E9DFC2]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-extrabold text-on-surface/40 uppercase tracking-widest">Capacity</p>
              <span className="text-[10px] font-bold text-primary">75%</span>
            </div>
            <div className="h-1.5 w-full bg-[#E9DFC2] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '75%' }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="h-full bg-primary rounded-full"
              />
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
