'use client';

import { 
  LayoutDashboard, 
  Package2, 
  MapPin, 
  BarChart3, 
  ArrowLeftRight, 
  Settings,
  Pin,
  ChevronLeft,
  ChevronRight,
  ChevronRight,
  LogIn,
  ShoppingCart
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ activeTab, setActiveTab, isCollapsed, onToggleCollapse }: SidebarProps) {
  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard' },
    { icon: Package2, label: 'Inventory' },
    { icon: ShoppingCart, label: 'Pedidos de Compra' },
    { icon: BarChart3, label: 'Requisições' },
    { icon: LogIn, label: 'Entrada de Mercadoria' },
    { icon: Settings, label: 'Settings' },
  ];

  return (
    <aside className={cn(
      "fixed left-0 top-0 h-full bg-surface-container-low/80 backdrop-blur-xl flex flex-col pt-6 z-40 transition-all duration-300",
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
                "flex items-center rounded-xl transition-all duration-300 group text-left w-full",
                isCollapsed ? "justify-center p-3" : "gap-3 px-4 py-3.5",
                activeTab === item.label 
                  ? "text-on-primary bg-primary shadow-lg shadow-primary/20" 
                  : "text-on-surface/60 hover:text-on-surface hover:bg-surface-container-lowest/50"
              )}
              title={isCollapsed ? item.label : ""}
            >
              <item.icon 
                size={20} 
                className={cn(
                  "transition-all shrink-0",
                  activeTab === item.label ? "scale-110" : "group-hover:scale-110"
                )} 
              />
              {!isCollapsed && (
                <span className={cn(
                  "text-xs uppercase tracking-wider font-manrope whitespace-nowrap",
                  activeTab === item.label ? "font-extrabold" : "font-semibold"
                )}>
                  {item.label}
                </span>
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
