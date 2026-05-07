'use client';

import {
  LayoutDashboard,
  Package2,
  BarChart3,
  ArrowLeftRight,
  Settings,
  Pin,
  ChevronLeft,
  ChevronRight,
  LogIn,
  ShoppingCart,
  Wallet,
  Bell
} from 'lucide-react';
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
      "hidden md:flex fixed left-0 top-0 h-full bg-surface-container-low/80 backdrop-blur-xl flex-col pt-6 z-40 transition-all duration-300",
      isCollapsed ? "w-20" : "w-64"
    )}>
      <div className={cn("px-4 mb-8 flex flex-col", isCollapsed ? "items-center" : "")}>
        <div className={cn("flex items-center gap-3 mb-10 relative", isCollapsed ? "justify-center" : "")}>
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-white shadow-xl shadow-primary/20 shrink-0">
            <Package2 size={24} />
          </div>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="overflow-hidden whitespace-nowrap"
            >
              <h2 className="text-base font-manrope font-extrabold tracking-tight text-on-surface leading-tight uppercase">Universo . do</h2>
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest leading-tight">Warehouse Curator</p>
            </motion.div>
          )}

          <button
            onClick={onToggleCollapse}
            className={cn(
              "absolute -right-3 top-1/2 -translate-y-1/2 w-7 h-7 bg-surface-container-lowest rounded-full flex items-center justify-center text-on-surface/40 hover:text-primary transition-all shadow-md z-50",
              isCollapsed ? "right-[-14px]" : ""
            )}
            title={isCollapsed ? "Expandir" : "Recolher"}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        <nav className="flex flex-col gap-2 w-full">
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={() => setActiveTab(item.label)}
              className={cn(
                "flex items-center rounded-xl transition-all duration-300 group text-left w-full relative",
                isCollapsed ? "justify-center p-3" : "gap-3 px-4 py-3.5",
                activeTab === item.label
                  ? "text-on-primary bg-primary shadow-lg shadow-primary/20"
                  : "text-on-surface/60 hover:text-on-surface hover:bg-surface-container-lowest/50"
              )}
              title={isCollapsed ? item.label : ""}
            >
              <div className="relative shrink-0">
                <item.icon
                  size={20}
                  className={cn(
                    "transition-all",
                    activeTab === item.label ? "scale-110" : "group-hover:scale-110"
                  )}
                />
                {/* Badge compacto no ícone quando collapsed */}
                {isCollapsed && (item as any).badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-0.5 shadow-sm">
                    {(item as any).badge > 99 ? '99+' : (item as any).badge}
                  </span>
                )}
              </div>
              {!isCollapsed && (
                <>
                  <span className={cn(
                    "text-xs uppercase tracking-wider font-manrope whitespace-nowrap flex-1",
                    activeTab === item.label ? "font-extrabold" : "font-semibold"
                  )}>
                    {item.label}
                  </span>
                  {/* Badge quando expandido */}
                  {(item as any).badge > 0 && (
                    <span className={cn(
                      "min-w-[20px] h-5 rounded-full flex items-center justify-center text-[10px] font-black px-1.5 shadow-sm",
                      activeTab === item.label ? "bg-white/20 text-white" : "bg-red-500 text-white"
                    )}>
                      {(item as any).badge > 99 ? '99+' : (item as any).badge}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </nav>
      </div>

      {!isCollapsed && (
        <div className="mt-auto p-6">
          <div className="bg-surface-container-lowest/40 backdrop-blur-sm rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-extrabold text-on-surface/40 uppercase tracking-tighter">Capacity</p>
              <span className="text-[10px] font-bold text-primary">75%</span>
            </div>
            <div className="h-1.5 w-full bg-on-surface/5 rounded-full overflow-hidden">
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
